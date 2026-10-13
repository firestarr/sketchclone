// Pembaca berkas SketchUp (.skp) versi 2021 ke atas.
// Berkasnya berupa header + arsip ZIP; geometri ada di "model.dat" dalam format
// tag-panjang-isi (u16 tag, u32 panjang, isi) yang bersarang. Satuan internal inci.
import { inflateSync } from 'fflate';

const IN = 0.0254;

// ---- ZIP (hanya local file header; cukup untuk berkas .skp) ----
function zipEntries(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out = {};
  for (let i = 0; i + 30 < b.length; i++) {
    if (b[i] !== 0x50 || b[i + 1] !== 0x4b || b[i + 2] !== 3 || b[i + 3] !== 4) continue;
    const method = dv.getUint16(i + 8, true), size = dv.getUint32(i + 18, true);
    const nl = dv.getUint16(i + 26, true), el = dv.getUint16(i + 28, true);
    const name = new TextDecoder().decode(b.subarray(i + 30, i + 30 + nl));
    const s = i + 30 + nl + el;
    if (!name.endsWith('/') && s + size <= b.length) out[name] = { method, data: b.subarray(s, s + size) };
    i = s + size - 1;
  }
  return out;
}

// ---- pohon TLV ----
function tree(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const LEAF = new Set([2501, 3501, 6502]);
  const seq = (s, e) => {
    const out = [];
    let i = s;
    while (i + 6 <= e) {
      const t = dv.getUint16(i, true), l = dv.getUint32(i + 2, true);
      if (l > e - i - 6) return null;
      out.push({ t, s: i + 6, l });
      i += 6 + l;
    }
    return i === e && out.length ? out : null;
  };
  const walk = (n, depth) => {
    n.kids = n.l >= 6 && !LEAF.has(n.t) && depth < 40 ? seq(n.s, n.s + n.l) : null;
    if (n.kids) for (const k of n.kids) walk(k, depth + 1);
    return n;
  };
  return { dv, root: walk({ t: dv.getUint16(0, true), s: 6, l: dv.getUint32(2, true) }, 0) };
}

const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');

/**
 * Baca .skp -> { layers, groups: [{name, layer, faces:[{loops:[[[x,y,z]...]...], n, color}]}] } dalam meter.
 * inflateRaw(Uint8Array) -> Uint8Array (bawaan: fflate).
 */
export async function parseSkp(bytes, inflateRaw = inflateSync) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const head = new TextDecoder('utf-16le').decode(b.subarray(0, 64)).replace(/[^\x20-\x7e]/g, '');
  if (!/SketchUp Model/.test(head)) throw new Error('bukan berkas SketchUp');
  const ver = +(head.match(/\{(\d+)\./) || [])[1] || 0;
  const zip = zipEntries(b);
  if (!zip['model.dat']) throw new Error(`format SketchUp ${ver ? ver + '.x ' : ''}lama belum didukung — simpan ulang dari SketchUp 2021 atau lebih baru`);
  const unz = async (e) => (e.method === 8 ? await inflateRaw(e.data) : e.data);
  const dat = await unz(zip['model.dat']);
  // warna material dari materials/<nama>/material.xml
  const matColor = {};
  for (const [k, e] of Object.entries(zip)) {
    const m = k.match(/^materials\/(.+)\/material\.xml$/);
    if (!m) continue;
    const x = new TextDecoder().decode(await unz(e));
    const c = (a) => +(x.match(new RegExp(a + '="(\\d+)"')) || [])[1];
    if (Number.isFinite(c('colorRed'))) matColor[m[1]] = hex(c('colorRed'), c('colorGreen'), c('colorBlue'));
  }
  const { dv, root } = tree(dat);
  const all = [];
  (function f(n) { all.push(n); (n.kids || []).forEach(f); })(root);
  const kid = (n, t) => n?.kids?.find((k) => k.t === t);
  const kids = (n, t) => (n?.kids || []).filter((k) => k.t === t);
  const u16 = (n) => (n && n.l >= 2 ? dv.getUint16(n.s, true) : null);
  const dbl = (n, i) => dv.getFloat64(n.s + 8 * i, true);
  const str = (n) => (n ? new TextDecoder('latin1').decode(dat.subarray(n.s, n.s + n.l)) : '');
  const idOf = (n) => u16(kid(kid(n, 1500) || kid(kid(n, 2000), 1500), 1502));
  const layers = {}, mats = {};
  for (const n of all) {
    if (n.t === 15500) layers[idOf(n)] = str(kid(n, 15501));
    if (n.t === 13000) mats[idOf(n)] = str(kid(n, 13004));
  }
  const colorOf = (ref) => (ref != null && mats[ref] && matColor[mats[ref]] && !/^Layer_/.test(mats[ref]) ? matColor[mats[ref]] : null);
  const ents = (e) => {
    const V = {}, E = {}, F = [], I = [];
    for (const v of kids(kid(e, 5001), 2500)) {
      const p = kid(v, 2501);
      if (p) V[idOf(v)] = [dbl(p, 0) * IN, dbl(p, 1) * IN, dbl(p, 2) * IN];
    }
    for (const x of kids(kid(e, 5002), 3000)) E[idOf(x)] = [u16(kid(x, 3001)), u16(kid(x, 3002))];
    for (const x of kids(kid(e, 5003), 3500)) {
      const loops = kids(kid(x, 3502), 4500).map((lp) => kids(kid(lp, 4501), 4000).map((eu) => {
        const ed = E[u16(kid(eu, 4001))];
        return ed && V[dat[kid(eu, 4002)?.s] ? ed[1] : ed[0]];
      })).filter((l) => l.length >= 3 && l.every(Boolean));
      const pl = kid(x, 3501), h = kid(x, 2000);
      if (loops.length) F.push({ loops, n: pl ? [dbl(pl, 0), dbl(pl, 1), dbl(pl, 2)] : null, mat: u16(kid(h, 2001)), layer: layers[u16(kid(h, 2002))] });
    }
    const inst = [...kids(kid(e, 5004), 6500), ...kids(kid(e, 5005), 7500).map((q) => kid(q, 6500))].filter(Boolean);
    for (const x of inst) {
      const t = kid(x, 6502), h = kid(x, 2000);
      if (!t || t.l < 104) continue;
      const hidden = (dat[kid(h, 2003)?.s] ?? 0) & 1;
      I.push({ def: u16(kid(x, 6503)), m: [...Array(13)].map((_, i) => dbl(t, i)), mat: u16(kid(h, 2001)), layer: layers[u16(kid(h, 2002))], hidden });
    }
    return { F, I };
  };
  const defs = {};
  for (const n of all) {
    if (n.t !== 5500) continue;
    const e = kid(n, 5000);
    if (e) defs[idOf(e)] = { name: str(kid(n, 5502)), ...ents(e) };
  }
  const top = kid(kid(root, 502), 5000) || kid(root, 502);
  if (!top) throw new Error('struktur model tidak dikenali');
  const model = ents(top);
  // transformasi: sumbu x, y, z (kolom), translasi (inci), skala w
  const ap = (m, p) => {
    const w = m[12] || 1;
    return [
      (m[0] * p[0] + m[3] * p[1] + m[6] * p[2] + m[9] * IN) / w,
      (m[1] * p[0] + m[4] * p[1] + m[7] * p[2] + m[10] * IN) / w,
      (m[2] * p[0] + m[5] * p[1] + m[8] * p[2] + m[11] * IN) / w,
    ];
  };
  const apN = (m, n) => [m[0] * n[0] + m[3] * n[1] + m[6] * n[2], m[1] * n[0] + m[4] * n[1] + m[7] * n[2], m[2] * n[0] + m[5] * n[1] + m[8] * n[2]];
  const det = (m) => m[0] * (m[4] * m[8] - m[7] * m[5]) - m[3] * (m[1] * m[8] - m[7] * m[2]) + m[6] * (m[1] * m[5] - m[4] * m[2]);
  const r6 = (v) => Math.round(v * 1e6) / 1e6;
  const groups = [];
  let nFaces = 0;
  const flat = (en, xf, xn, out, mat, depth) => {
    for (const f of en.F) {
      if (++nFaces > 200000) throw new Error('model terlalu besar (lebih dari 200.000 bidang)');
      out.faces.push({
        loops: f.loops.map((l) => l.map((p) => xf(p).map(r6))),
        n: f.n ? xn(f.n) : null,
        color: colorOf(f.mat) || colorOf(mat),
        layer: f.layer,
      });
    }
    if (depth > 30) return;
    for (const i of en.I) {
      const d = defs[i.def];
      if (!d || i.hidden) continue;
      const flip = det(i.m) < 0;
      flat(d, (p) => xf(ap(i.m, p)), (n) => { const q = xn(apN(i.m, n)); return flip ? q.map((v) => -v) : q; }, out, f0(i.mat, mat), depth + 1);
    }
  };
  const f0 = (a, b) => (a != null && colorOf(a) ? a : b);
  const id = (p) => p;
  if (model.F.length) {
    const g = { name: 'Geometri lepas', layer: null, faces: [] };
    flat({ F: model.F, I: [] }, id, id, g, null, 0);
    groups.push(g);
  }
  for (const i of model.I) {
    const d = defs[i.def];
    if (!d || i.hidden) continue;
    const g = { name: d.name || 'Grup', layer: i.layer && i.layer !== 'Layer0' ? i.layer : null, faces: [] };
    const flip = det(i.m) < 0;
    flat(d, (p) => ap(i.m, p), (n) => { const q = apN(i.m, n); return flip ? q.map((v) => -v) : q; }, g, i.mat, 0);
    // tag: banyak model menandai geometri di dalam grup, bukan grupnya
    const cnt = {};
    for (const f of g.faces) if (f.layer && f.layer !== 'Layer0') cnt[f.layer] = (cnt[f.layer] || 0) + 1;
    const best = Object.entries(cnt).sort((a, c) => c[1] - a[1])[0];
    if (best) g.layer = best[0];
    if (g.faces.length) groups.push(g);
  }
  return { version: ver, layers: Object.values(layers), groups };
}
