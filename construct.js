// Fitur konstruksi: kusen yang melubangi dinding, ruang (luas lantai), lantai bertingkat, dan RAB otomatis.
import * as THREE from 'three';
import * as G from './geometry.js';
import { booleanSolids } from './csg.js';
import AHSP from './ahsp.json' with { type: 'json' };

export { AHSP };
const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
const UP = new THREE.Vector3(0, 0, 1);

// ---------- volume solid (teorema divergensi) ----------
export function solidVolume(model, sid) {
  let v = 0;
  for (const f of model.faces) {
    if (f.solid !== sid) continue;
    const t = G.triangulateFace(f);
    for (let i = 0; i < t.length; i += 3) {
      const a = t[i], b = t[i + 1], c = t[i + 2];
      v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
  }
  return Math.abs(v);
}

// ---------- tebal dinding di titik tertentu ----------
export function wallThickness(model, face, point) {
  const n = V(face.n);
  let best = Infinity;
  for (const q of model.faces) {
    if (q.solid !== face.solid || q === face) continue;
    const nq = V(q.n);
    const dn = n.dot(nq);
    if (dn > -0.99) continue;
    const t = -point.clone().sub(V(q.pts[0])).dot(nq) / -dn;
    if (t < 1e-4 || t >= best) continue;
    // titik proyeksi harus berada di dalam kotak pembatas bidang lawan
    const pp = point.clone().addScaledVector(n, -t);
    const box = new THREE.Box3().setFromPoints(q.pts.map(V)).expandByScalar(2e-3);
    if (box.containsPoint(pp)) best = t;
  }
  return Number.isFinite(best) ? best : null;
}

export const OPENING_DEFAULTS = {
  pintu: { w: 0.9, h: 2.1, sill: 0 },
  jendela: { w: 1.2, h: 1.2, sill: 0.9 },
};
const WOOD = '#8a5a36', LEAF = '#b5835a', GLASS = '#a9cbe6', HANDLE = '#c9a227';

// Kerangka lokal sebuah bukaan: x sepanjang dinding, y menembus dinding (0 = muka luar), z ke atas.
export function openingFrame(model, faceId, point, opt) {
  const face = model.faces.find((f) => f.id === faceId);
  if (!face || face.solid == null) return { error: 'Klik bidang samping sebuah dinding' };
  const n = V(face.n);
  if (Math.abs(n.z) > 0.1) return { error: 'Klik bidang tegak dinding' };
  n.setZ(0).normalize();
  const t = wallThickness(model, face, point);
  if (!t || t > 0.6) return { error: 'Tebal dinding tidak terbaca' };
  const u = new THREE.Vector3(-n.y, n.x, 0);
  // batas dari semua potongan bidang yang sebidang & bersambung (hasil CSG bisa memecah bidang)
  const fn = V(face.n), d0 = V(face.pts[0]).dot(fn);
  const cop = model.faces.filter((q) => q.solid === face.solid && V(q.n).dot(fn) > 0.999 && Math.abs(V(q.pts[0]).dot(fn) - d0) < 1e-4);
  const ext = (f) => {
    const al = f.pts.map((p) => V(p).sub(point).dot(u)), zz = f.pts.map((p) => p[2]);
    return { a0: Math.min(...al), a1: Math.max(...al), z0: Math.min(...zz), z1: Math.max(...zz) };
  };
  const E = ext(face);
  let grown = true;
  while (grown) {
    grown = false;
    for (const q of cop) {
      const e = ext(q);
      if (e.a1 < E.a0 - 1e-4 || e.a0 > E.a1 + 1e-4 || e.z1 < E.z0 - 1e-4 || e.z0 > E.z1 + 1e-4) continue;
      if (e.a0 < E.a0 - 1e-6 || e.a1 > E.a1 + 1e-6 || e.z0 < E.z0 - 1e-6 || e.z1 > E.z1 + 1e-6) {
        E.a0 = Math.min(E.a0, e.a0); E.a1 = Math.max(E.a1, e.a1); E.z0 = Math.min(E.z0, e.z0); E.z1 = Math.max(E.z1, e.z1);
        grown = true;
      }
    }
  }
  const zmin = E.z0, zmax = E.z1, amin = E.a0, amax = E.a1;
  const w = Math.min(opt.w, amax - amin - 0.1);
  if (w < 0.3) return { error: 'Dinding terlalu sempit' };
  let a = 0;
  if (a - w / 2 < amin + 0.05) a = amin + 0.05 + w / 2;
  if (a + w / 2 > amax - 0.05) a = amax - 0.05 - w / 2;
  const sill = Math.max(0, opt.sill);
  const h = Math.min(opt.h, zmax - zmin - sill - 0.15);
  if (h < 0.3) return { error: 'Dinding terlalu pendek' };
  const o = point.clone().addScaledVector(u, a - w / 2);
  o.z = zmin + sill;
  // basis: kolom matriks = u, -n, z
  const M = new THREE.Matrix4().makeBasis(u, n.clone().negate(), UP).setPosition(o);
  return { face, n, u, t, w, h, sill, o, M };
}

function lbox(m, ids0, x, y, z, w, d, h, color) {
  const f = G.makeFace(m, [[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]], UP, color);
  if (!f) return null;
  m.faces.push(f);
  G.pushPull(m, f.id, h);
  return f.solid;
}

// Bangun kusen + daun di koordinat lokal (lalu ditransformasikan dengan M).
export function buildKusen(m, type, w, h, t, M) {
  const start = m.nextId;
  const fw = 0.06, fd = Math.min(0.12, t), y0 = (t - fd) / 2;
  lbox(m, 0, 0, y0, 0, fw, fd, h, WOOD);
  lbox(m, 0, w - fw, y0, 0, fw, fd, h, WOOD);
  lbox(m, 0, fw, y0, h - fw, w - 2 * fw, fd, fw, WOOD);
  const glass = [];
  if (type === 'pintu') {
    const lt = 0.035, ly = t / 2 - lt / 2;
    const leaf = [
      lbox(m, 0, fw, ly, 0.01, w - 2 * fw, lt, h - fw - 0.01, LEAF),
      lbox(m, 0, w - fw - 0.12, ly - 0.03, 1.0, 0.05, 0.03, 0.04, HANDLE),
      lbox(m, 0, w - fw - 0.12, ly + lt, 1.0, 0.05, 0.03, 0.04, HANDLE),
    ];
    // daun pintu tidak ikut digambar sebagai potongan di denah (diganti busur bukaan)
    for (const f of m.faces) if (leaf.includes(f.solid)) f.part = 'leaf';
  } else {
    lbox(m, 0, fw, y0, 0, w - 2 * fw, fd, fw, WOOD);
    const leaves = w > 0.8 ? 2 : 1;
    const iw = (w - 2 * fw - (leaves - 1) * 0.05) / leaves;
    if (leaves === 2) lbox(m, 0, fw + iw, y0, fw, 0.05, fd, h - 2 * fw, WOOD);
    for (let i = 0; i < leaves; i++) {
      const x = fw + i * (iw + 0.05);
      glass.push(lbox(m, 0, x, t / 2 - 0.006, fw, iw, 0.012, h - 2 * fw, GLASS));
    }
  }
  const ids = new Set(m.faces.filter((f) => f.id >= start).map((f) => f.id));
  for (const f of m.faces) if (glass.includes(f.solid)) f.finish = 'glass';
  G.applyMatrix(m, ids, M);
  return ids;
}

// Pasang pintu/jendela: lubangi dinding (CSG) lalu sisipkan kusen sebagai grup anak dinding.
export function placeOpening(model, faceId, point, type, opt = {}) {
  const o = { ...OPENING_DEFAULTS[type], ...opt };
  const fr = openingFrame(model, faceId, point, o);
  if (fr.error) return fr;
  const { face, t, w, h, M } = fr;
  const wallSid = face.solid, parent = face.group ?? null;
  // balok pemotong sedikit lebih besar dari tebal dinding (dan di bawah lantai untuk pintu)
  const ext = fr.sill <= 1e-3 ? 0.02 : 0;
  const cm = { ...model, faces: [], nextId: model.nextId };
  const csid = lbox(cm, 0, 0, -0.02, -ext, w, t + 0.04, h + ext, '#ffffff');
  G.applyMatrix(cm, new Set(cm.faces.map((f) => f.id)), M);
  model.nextId = cm.nextId;
  model.faces.push(...cm.faces);
  const r = booleanSolids(model, wallSid, csid, 'subtract');
  if (r !== 'ok') {
    model.faces = model.faces.filter((f) => f.solid !== csid);
    return { error: r === 'open' ? 'Dinding bukan solid tertutup' : 'Gagal melubangi dinding' };
  }
  const newWall = model.faces[model.faces.length - 1].solid;
  const ids = buildKusen(model, type, w, h, t, M);
  for (const f of model.faces) if (ids.has(f.id)) f.group = parent;
  const gid = G.makeGroup(model, ids, (type === 'pintu' ? 'Pintu ' : 'Jendela ') + `${w.toFixed(2)}×${h.toFixed(2)}`, false, parent);
  const r6 = (v) => [v.x, v.y, v.z].map((x) => +x.toFixed(6));
  model.groups[gid].opening = {
    type, w: +w.toFixed(3), h: +h.toFixed(3), sill: +fr.sill.toFixed(3), t: +t.toFixed(3),
    // kerangka saat dipasang (dunia); posisi terkini = matriks grup × kerangka ini
    frame: { o: r6(fr.o), u: r6(fr.u), d: r6(fr.n.clone().negate()) },
  };
  return { gid, wall: newWall };
}

// ---------- dinding sebagai grup bermeta ----------
export function makeWallGroup(model, sid, meta, parent = null) {
  const ids = new Set(model.faces.filter((f) => f.solid === sid).map((f) => f.id));
  if (!ids.size) return null;
  const gid = G.makeGroup(model, ids, 'Dinding', false, parent);
  const pts = meta.pts.map((p) => [+p[0].toFixed(4), +p[1].toFixed(4), +p[2].toFixed(4)]);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += V(pts[i]).distanceTo(V(pts[i - 1]));
  if (meta.closed && pts.length > 2) len += V(pts[0]).distanceTo(V(pts[pts.length - 1]));
  model.groups[gid].wall = { t: meta.t, h: meta.h, pts, closed: !!meta.closed, len: +len.toFixed(4) };
  return gid;
}

// ---------- ruang: isi banjir pada irisan denah ----------
export function sliceSegments(model, z, vis) {
  const segs = [];
  for (const f of model.faces) {
    if (Math.abs(f.n[2]) > 0.99 || (vis && !vis(f))) continue;
    const zs = f.pts.map((p) => p[2]);
    if (Math.min(...zs) > z || Math.max(...zs) < z) continue;
    const d = new THREE.Vector3(f.n[0], f.n[1], f.n[2]).cross(UP);
    if (d.lengthSq() < 1e-9) continue;
    d.normalize();
    const hits = [];
    for (const loop of [f.pts, ...f.holes]) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length];
        if ((a[2] - z) * (b[2] - z) > 0 || a[2] === b[2]) continue;
        const s = (z - a[2]) / (b[2] - a[2]);
        hits.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s]);
      }
    }
    hits.sort((p, q) => p[0] * d.x + p[1] * d.y - (q[0] * d.x + q[1] * d.y));
    for (let i = 0; i + 1 < hits.length; i += 2) segs.push([hits[i], hits[i + 1]]);
  }
  return segs;
}

function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    const [ax, ay] = pts[i], [bx, by] = pts[j];
    const L = Math.hypot(bx - ax, by - ay) || 1e-9;
    let md = 0, mk = -1;
    for (let k = i + 1; k < j; k++) {
      const d = Math.abs((bx - ax) * (ay - pts[k][1]) - (ax - pts[k][0]) * (by - ay)) / L;
      if (d > md) { md = d; mk = k; }
    }
    if (md > tol) { keep[mk] = 1; stack.push([i, mk], [mk, j]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const lineX = (p, d, q, e) => {
  const den = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(den) < 1e-9) return null;
  const s = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den;
  return [p[0] + d[0] * s, p[1] + d[1] * s];
};

// Kembalikan poligon ruang (searah jarum jam berlawanan) di sekitar titik (x,y) pada tinggi irisan z.
export function roomOutline(model, x, y, z, vis = null, cell = 0.02) {
  const segs = sliceSegments(model, z, vis);
  if (!segs.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of segs) for (const p of s) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  if (x < x0 || x > x1 || y < y0 || y > y1) return null;
  x0 -= 0.1; y0 -= 0.1; x1 += 0.1; y1 += 0.1;
  const W = Math.ceil((x1 - x0) / cell), H = Math.ceil((y1 - y0) / cell);
  if (W * H > 9e6) cell *= Math.sqrt((W * H) / 9e6);
  const NX = Math.ceil((x1 - x0) / cell), NY = Math.ceil((y1 - y0) / cell);
  const grid = new Uint8Array(NX * NY);
  const mark = (px, py) => {
    const i = Math.floor((px - x0) / cell), j = Math.floor((py - y0) / cell);
    for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const ii = i + a, jj = j + b;
      if (ii >= 0 && jj >= 0 && ii < NX && jj < NY) grid[jj * NX + ii] = 1;
    }
  };
  for (const [a, b] of segs) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(L / (cell * 0.5)));
    for (let k = 0; k <= n; k++) mark(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n);
  }
  const si = Math.floor((x - x0) / cell), sj = Math.floor((y - y0) / cell);
  if (grid[sj * NX + si]) return null;
  const q = new Int32Array(NX * NY);
  let qh = 0, qt = 0;
  q[qt++] = sj * NX + si;
  grid[sj * NX + si] = 2;
  while (qh < qt) {
    const c = q[qh++];
    const i = c % NX, j = (c - i) / NX;
    if (i === 0 || j === 0 || i === NX - 1 || j === NY - 1) return null; // bocor ke luar
    for (const nc of [c - 1, c + 1, c - NX, c + NX]) if (!grid[nc]) { grid[nc] = 2; q[qt++] = nc; }
  }
  // telusuri batas sel terisi -> rantai tepi berarah (isi di kiri)
  const nxt = new Map();
  const key = (i, j) => j * (NX + 1) + i;
  const filled = (i, j) => i >= 0 && j >= 0 && i < NX && j < NY && grid[j * NX + i] === 2;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    if (!filled(i, j)) continue;
    if (!filled(i, j - 1)) nxt.set(key(i, j), key(i + 1, j));
    if (!filled(i + 1, j)) nxt.set(key(i + 1, j), key(i + 1, j + 1));
    if (!filled(i, j + 1)) nxt.set(key(i + 1, j + 1), key(i, j + 1));
    if (!filled(i - 1, j)) nxt.set(key(i, j + 1), key(i, j));
  }
  // loop terpanjang = batas luar
  let best = null;
  const seen = new Set();
  for (const k0 of nxt.keys()) {
    if (seen.has(k0)) continue;
    const loop = [];
    let k = k0;
    while (k != null && !seen.has(k)) { seen.add(k); loop.push(k); k = nxt.get(k); }
    if (!best || loop.length > best.length) best = loop;
  }
  let poly = best.map((k) => [x0 + (k % (NX + 1)) * cell, y0 + Math.floor(k / (NX + 1)) * cell]);
  {
    // loop tertutup: belah di titik terjauh dari titik awal agar Douglas-Peucker bekerja
    let far = 0, fd = -1;
    poly.forEach((p, i) => { const d = Math.hypot(p[0] - poly[0][0], p[1] - poly[0][1]); if (d > fd) { fd = d; far = i; } });
    const A1 = simplify(poly.slice(0, far + 1), cell * 1.5), B1 = simplify([...poly.slice(far), poly[0]], cell * 1.5);
    poly = [...A1, ...B1.slice(1, -1)];
  }
  // tepatkan setiap tepi ke garis dinding sejajar terdekat
  const lines = poly.map((p, i) => {
    const b = poly[(i + 1) % poly.length];
    const d = [b[0] - p[0], b[1] - p[1]], L = Math.hypot(d[0], d[1]);
    const dn = [d[0] / L, d[1] / L], mid = [(p[0] + b[0]) / 2, (p[1] + b[1]) / 2];
    let bestS = null, bestD = null, bd = cell * 4;
    for (const [sa, sb] of segs) {
      const e = [sb[0] - sa[0], sb[1] - sa[1]], el = Math.hypot(e[0], e[1]);
      if (el < 1e-6 || Math.abs(dn[0] * e[1] - dn[1] * e[0]) / el > 0.05) continue;
      const dist = Math.abs(e[0] * (sa[1] - mid[1]) - e[1] * (sa[0] - mid[0])) / el;
      if (dist < bd) { bd = dist; bestS = sa; bestD = [e[0] / el, e[1] / el]; }
    }
    return { p: bestS || mid, d: bestD || dn };
  });
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const a = lines[(i + lines.length - 1) % lines.length], b = lines[i];
    out.push(lineX(a.p, a.d, b.p, b.d) || poly[i]);
  }
  const area = Math.abs(out.reduce((s, p, i) => { const q2 = out[(i + 1) % out.length]; return s + p[0] * q2[1] - q2[0] * p[1]; }, 0)) / 2;
  return { pts: out, area };
}

// Buat ruang: lantai tipis + label, sebagai grup bermeta 'room'.
export function makeRoom(model, outline, name, z, opts = {}) {
  const pts = outline.pts.map((p) => [p[0], p[1], z + 0.002]);
  const f = G.makeFace(model, pts, UP, opts.color || '#d8cfc0');
  if (!f) return null;
  f.group = opts.parent ?? null;
  model.faces.push(f);
  const gid = G.makeGroup(model, new Set([f.id]), 'Ruang ' + name, false, opts.parent ?? null);
  const c = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);
  const lid = model.nextId++;
  model.labels.push({ id: lid, p: [c[0], c[1], z + 0.01], text: `${name}\n${outline.area.toFixed(2)} m²`, room: gid });
  model.groups[gid].room = { name, area: +outline.area.toFixed(3), z, floor: opts.floor || '7.4.1.2', label: lid };
  return gid;
}

// ---------- lantai bertingkat ----------
export function levelsOf(model) {
  if (!model.levels || !model.levels.length) model.levels = [{ name: 'Lantai 1', z: 0, h: 3.5 }];
  return model.levels;
}
export function levelAt(model, z) {
  const L = levelsOf(model);
  let idx = 0;
  for (let i = 0; i < L.length; i++) if (z >= L[i].z - 0.05) idx = i;
  return idx;
}

// ---------- pondasi (ukuran bisa diubah di panel) ----------
export const PONDASI_DEFAULT = { top: 0.3, bot: 0.6, h: 0.7, w: 0.8, d: 0.8, sand: 0.05 };
export function pondasiOf(model, extra) {
  const p = { ...PONDASI_DEFAULT, ...((model.rab && model.rab.pondasi) || {}), ...(extra || {}) };
  p.stone = p.stone ?? ((p.top + p.bot) / 2) * p.h;
  return p;
}

// ---------- tangga beton lurus ----------
export function stairSpec(H, opt = {}) {
  if (/kiri$/.test(opt.shape || '')) opt = { ...opt, shape: opt.shape.replace(/kiri$/, ''), flip: true };
  const n = Math.max(2, Math.round(H / (opt.riser || 0.175)));
  return { H, n, R: H / n, T: opt.tread || 0.28, w: opt.w || 0.9, waist: opt.waist || 0.12, shape: opt.shape || 'lurus', flip: !!opt.flip };
}
// Bangun tangga di koordinat lokal (naik ke +Y, lebar sepanjang X, kaki di y=0), lalu M.
export function buildStair(m, sp, M) {
  const start = m.nextId;
  const { n, R, T, w, waist, H } = sp;
  const run = n * T, tanA = R / T, k = waist / Math.cos(Math.atan(tanA));
  const prof = [[0, 0], [0, R]];
  for (let i = 1; i < n; i++) prof.push([i * T, i * R], [i * T, (i + 1) * R]);
  prof.push([run, H], [run, Math.max(0, H - k)], [Math.min(run - 0.01, k / tanA), 0]);
  const x0 = -w / 2;
  const f = G.makeFace(m, prof.map(([y, z]) => [x0, y, z]), new THREE.Vector3(1, 0, 0), '#cfc9bd');
  m.faces.push(f);
  G.pushPull(m, f.id, w);
  const conc = f.solid;
  // reling sisi kanan: tiang di kaki & puncak + pegangan miring
  const xr = w / 2 - 0.05;
  lbox(m, 0, xr, 0.1, R, 0.04, 0.04, 0.9, '#4a4f57');
  lbox(m, 0, xr, run - 0.14, H, 0.04, 0.04, 0.9, '#4a4f57');
  const rail = G.makeFace(m, [[xr, 0.1, R + 0.88], [xr, run - 0.1, H + 0.88], [xr, run - 0.1, H + 0.93], [xr, 0.1, R + 0.93]], new THREE.Vector3(1, 0, 0), '#4a4f57');
  m.faces.push(rail);
  G.pushPull(m, rail.id, 0.04);
  const ids = new Set(m.faces.filter((q) => q.id >= start).map((q) => q.id));
  for (const q of m.faces) if (ids.has(q.id) && q.solid !== conc) q.finish = 'metal';
  if (M) G.applyMatrix(m, ids, M);
  return { ids, conc, run };
}
export const STAIR_SHAPES = { lurus: 'Lurus', L: 'Bentuk L, belok kanan', Lkiri: 'Bentuk L, belok kiri', U: 'Bentuk U, balik kanan', Ukiri: 'Bentuk U, balik kiri' };
// Tangga lurus / L / U. Lokal: naik ke +Y, lebar sepanjang X, kaki di (0,0,0); L berbelok ke kanan (+X), U berbalik di sebelah kanan.
export function buildStairShape(m, sp, M) {
  const shape = sp.shape || 'lurus';
  const ids = new Set();
  const take = (r) => r.ids.forEach((id) => ids.add(id));
  const { w, T, R } = sp;
  if (shape === 'lurus') {
    const r = buildStair(m, sp, null);
    take(r);
    const outline = [[-w / 2, 0], [w / 2, 0], [w / 2, r.run], [-w / 2, r.run]];
    G.applyMatrix(m, ids, M);
    return { ids, outline, flights: [[r.run, sp.H]], landing: 0, axes: [[[0, 0], [0, r.run], sp.n]] };
  }
  const n1 = Math.floor(sp.n / 2), n2 = sp.n - n1;
  const H1 = n1 * R, run1 = n1 * T, run2 = n2 * T;
  take(buildStair(m, { ...sp, n: n1, H: H1 }, null));
  const gap = 0.1;
  const lx1 = shape === 'U' ? 1.5 * w + gap : w / 2;
  const startL = m.nextId;
  lbox(m, 0, -w / 2, run1, H1 - 0.15, lx1 + w / 2, w, 0.15, '#cfc9bd');
  m.faces.filter((f) => f.id >= startL).forEach((f) => ids.add(f.id));
  const s2 = m.nextId;
  buildStair(m, { ...sp, n: n2, H: n2 * R }, null);
  const ids2 = new Set(m.faces.filter((f) => f.id >= s2).map((f) => f.id));
  const M2 = shape === 'L'
    ? new THREE.Matrix4().makeRotationZ(-Math.PI / 2).setPosition(w / 2, run1 + w / 2, H1)
    : new THREE.Matrix4().makeRotationZ(Math.PI).setPosition(w + gap, run1, H1);
  G.applyMatrix(m, ids2, M2);
  ids2.forEach((id) => ids.add(id));
  G.applyMatrix(m, ids, M);
  const outline = shape === 'L'
    ? [[-w / 2, 0], [w / 2, 0], [w / 2, run1], [w / 2 + run2, run1], [w / 2 + run2, run1 + w], [-w / 2, run1 + w]]
    : [[-w / 2, Math.min(0, run1 - run2)], [lx1, Math.min(0, run1 - run2)], [lx1, run1 + w], [-w / 2, run1 + w]];
  // sumbu tiap lengan (kaki -> puncak) dan bordes, koordinat lokal
  const axes = shape === 'L'
    ? [[[0, 0], [0, run1], n1], [[w / 2, run1 + w / 2], [w / 2 + run2, run1 + w / 2], n2]]
    : [[[0, 0], [0, run1], n1], [[w + gap, run1], [w + gap, run1 - run2], n2]];
  const landingPts = shape === 'L' ? [[-w / 2, run1], [w / 2, run1], [w / 2, run1 + w], [-w / 2, run1 + w]] : [[-w / 2, run1], [lx1, run1], [lx1, run1 + w], [-w / 2, run1 + w]];
  return { ids, outline, flights: [[run1, H1], [run2, n2 * R]], landing: (lx1 + w / 2) * w, axes, landingPts };
}
export function placeStair(m, at, angle, sp, parent = null) {
  // flip: cermin lokal -> L/U berbelok ke kiri
  const M = new THREE.Matrix4().makeRotationZ(angle).setPosition(at);
  if (sp.flip) M.multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
  const r = buildStairShape(m, sp, M);
  for (const f of m.faces) if (r.ids.has(f.id)) f.group = parent;
  const shape = sp.shape || 'lurus';
  const gid = G.makeGroup(m, r.ids, `Tangga ${shape === 'lurus' ? '' : shape + ' '}${sp.n} anak tangga`, false, parent);
  const fp = r.outline.map(([x, y]) => new THREE.Vector3(x, y, 0).applyMatrix4(M));
  const area = Math.abs(r.outline.reduce((a, p, i) => { const q = r.outline[(i + 1) % r.outline.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  m.groups[gid].stair = {
    shape, flip: sp.flip || undefined, n: sp.n, R: +sp.R.toFixed(4), T: sp.T, w: sp.w, H: sp.H, run: +r.flights.reduce((a, f) => a + f[0], 0).toFixed(4),
    rail: +r.flights.reduce((a, f) => a + Math.hypot(f[0], f[1]), 0).toFixed(3), landing: +r.landing.toFixed(3), area: +area.toFixed(4),
    fp: fp.map((v) => [+v.x.toFixed(4), +v.y.toFixed(4)]), z: at.z,
  };
  // untuk denah: sumbu lengan (dunia) & bordes
  const W2 = ([x, y]) => { const v = new THREE.Vector3(x, y, 0).applyMatrix4(M); return [+v.x.toFixed(4), +v.y.toFixed(4)]; };
  m.groups[gid].stair.axes = (r.axes || []).map(([a, b, k]) => [W2(a), W2(b), k]);
  if (r.landingPts) m.groups[gid].stair.landingFp = r.landingPts.map(W2);
  return { gid, ids: r.ids };
}
// Lubangi lantai ruang di atas tangga (bukaan tangga) dan kurangi luasnya.
export function cutStairVoid(model, gid) {
  const st = model.groups[gid]?.stair;
  if (!st) return null;
  const ztop = st.z + st.H;
  const hole = st.fp.map(([x, y]) => [x, y]);
  for (const [rid, g] of Object.entries(model.groups)) {
    if (!g.room || Math.abs(g.room.z - ztop) > 0.05) continue;
    const f = model.faces.find((q) => (q.group ?? null) === +rid && q.n[2] > 0.99);
    if (!f) continue;
    const poly = f.pts.map((p) => new THREE.Vector2(p[0], p[1]));
    if (!hole.every(([x, y]) => G.pointInPoly2(new THREE.Vector2(x, y), poly))) continue;
    const z = f.pts[0][2];
    const loop = hole.map(([x, y]) => [x, y, z]);
    if (G.newellNormal(loop).z > 0) loop.reverse();
    f.holes.push(loop);
    const a = st.area ?? st.w * st.run;
    g.room.area = +(g.room.area - a).toFixed(3);
    const lab = model.labels.find((l) => l.id === g.room.label);
    if (lab) lab.text = `${g.room.name}
${g.room.area.toFixed(2)} m²`;
    st.void = +rid;
    return +rid;
  }
  return null;
}


// ---------- utilitas listrik & sanitasi ----------
// mount: 'ceiling' (menempel plafon), 'wall' (menempel dinding pada ketinggian z), 'floor' (di lantai; boleh menempel dinding)
// Lokal: punggung benda di y = 0 menghadap dinding, benda menjorok ke +Y, alas di z = 0.
function lcyl(m, cx, cy, z, r, h, color, seg = 16) {
  const pts = [...Array(seg)].map((_, i) => [cx + r * Math.cos((i / seg) * Math.PI * 2), cy + r * Math.sin((i / seg) * Math.PI * 2), z]);
  const f = G.makeFace(m, pts, UP, color);
  m.faces.push(f);
  G.pushPull(m, f.id, h);
  return f.solid;
}
const WH = '#f4f4f2', GR = '#8c939b', BL = '#3f7fc4';
export const MEP = {
  lampu: { name: 'Titik lampu', icon: '💡', sys: 'listrik', mount: 'ceiling', codes: { '8.1.1.1': 1, '16.5.1.1': 1 }, build: (m) => { lcyl(m, 0, 0, -0.05, 0.11, 0.05, WH, 20); } },
  saklar: { name: 'Saklar', icon: '⏻', sys: 'listrik', mount: 'wall', z: 1.4, codes: {}, build: (m) => lbox(m, 0, -0.04, 0, -0.04, 0.08, 0.015, 0.08, WH) },
  stopkontak: { name: 'Stop kontak', icon: '🔌', sys: 'listrik', mount: 'wall', z: 0.3, codes: { '8.1.1.2': 1 }, build: (m) => { lbox(m, 0, -0.04, 0, -0.04, 0.08, 0.015, 0.08, WH); lbox(m, 0, -0.015, 0.015, -0.01, 0.03, 0.004, 0.02, '#333'); } },
  ac: { name: 'AC split 1 PK', icon: '❄', sys: 'listrik', mount: 'wall', z: 2.3, codes: { '8.5.1.1': 1 }, build: (m) => { lbox(m, 0, -0.4, 0, 0, 0.8, 0.2, 0.28, WH); lbox(m, 0, -0.34, 0.2, 0.03, 0.68, 0.005, 0.04, GR); } },
  exhaust: { name: 'Exhaust fan', icon: '🌀', sys: 'listrik', mount: 'wall', z: 2.2, codes: { '8.6.1.1': 1 }, build: (m) => lbox(m, 0, -0.13, 0, -0.13, 0.26, 0.05, 0.26, GR) },
  panel: { name: 'Panel listrik (MCB)', icon: '⚡', sys: 'listrik', mount: 'wall', z: 1.5, codes: { '16.4.1.1': 1 }, build: (m) => lbox(m, 0, -0.15, 0, -0.2, 0.3, 0.1, 0.4, GR) },
  kloset: { name: 'Kloset duduk', icon: '🚽', sys: 'kotor', mount: 'floor', codes: { '17.3.1.1': 1, '8.7.1.1': 1 }, build: (m) => {
    lbox(m, 0, -0.19, 0, 0.4, 0.38, 0.17, 0.4, WH);
    lbox(m, 0, -0.17, 0.17, 0, 0.34, 0.5, 0.4, WH);
  } },
  wastafel: { name: 'Wastafel', icon: '🚰', sys: 'kotor', mount: 'floor', codes: { '17.3.2.1': 1, '8.7.1.1': 1 }, build: (m) => {
    lcyl(m, 0, 0.18, 0, 0.09, 0.7, WH);
    lbox(m, 0, -0.25, 0, 0.7, 0.5, 0.42, 0.16, WH);
  } },
  bakmandi: { name: 'Bak mandi fiber', icon: '🛁', sys: 'air', mount: 'floor', codes: { '17.4.1.1': 1, '8.7.1.1': 1 }, build: (m) => lbox(m, 0, -0.75, 0, 0, 1.5, 0.7, 0.55, '#e9f1f7') },
  kran: { name: 'Kran air', icon: '🔧', sys: 'air', mount: 'wall', z: 0.8, codes: { '8.7.1.1': 1 }, build: (m) => { lcyl(m, 0, 0.03, -0.02, 0.02, 0.04, '#c0c4c8', 10); lbox(m, 0, -0.01, 0.03, 0, 0.02, 0.1, 0.02, '#c0c4c8'); } },
  floordrain: { name: 'Floor drain', icon: '⊞', sys: 'kotor', mount: 'floor', codes: { '8.7.2.1': 1 }, build: (m) => lbox(m, 0, -0.06, 0.1, 0, 0.12, 0.12, 0.006, '#9aa1a8') },
  septictank: { name: 'Septic tank', icon: '⛁', sys: 'septic', mount: 'floor', codes: { '8.3.1.1': 1 }, build: (m) => { lcyl(m, 0, 0.7, -1.5, 0.6, 1.53, GR, 24); } },
  tandon: { name: 'Tandon air 1000 L', icon: '🛢', sys: 'tandon', mount: 'floor', codes: { '8.9.1.1': 1 }, build: (m) => { lcyl(m, 0, 0.6, 0, 0.55, 1.2, BL, 24); } },
  pompa: { name: 'Pompa air', icon: '⛲', sys: 'air', mount: 'floor', codes: { '8.8.1.1': 1 }, build: (m) => lbox(m, 0, -0.15, 0.05, 0, 0.3, 0.25, 0.3, BL) },
};

// Pasang utilitas. n = normal bidang yang diklik (dinding -> menempel dinding).
export function placeMep(m, kind, at, n, angle, opt = {}) {
  const it = MEP[kind];
  const start = m.nextId;
  it.build(m);
  const ids = new Set(m.faces.filter((f) => f.id >= start).map((f) => f.id));
  const p = at.clone();
  let a = angle;
  const onWall = n && Math.abs(n.z) < 0.3;
  if (onWall) a = Math.atan2(n.y, n.x) - Math.PI / 2; // lokal +Y menghadap keluar dinding
  if (it.mount === 'ceiling') p.z = opt.ceilingZ ?? p.z;
  else if (it.mount === 'wall') p.z = (opt.levelZ ?? 0) + it.z;
  else if (onWall) p.z = opt.levelZ ?? p.z;
  G.applyMatrix(m, ids, new THREE.Matrix4().makeRotationZ(a).setPosition(p));
  for (const f of m.faces) if (ids.has(f.id)) f.group = opt.parent ?? null;
  const gid = G.makeGroup(m, ids, it.name, false, opt.parent ?? null);
  m.groups[gid].mep = { kind, p: [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)] };
  return { gid, ids };
}

// Panjang kabel & pipa: jalur siku (|dx|+|dy|+|dz|) dari sumber ke tiap titik, +10% cadangan.
function mepPos(g) {
  return new THREE.Vector3(...g.mep.p).applyMatrix4(new THREE.Matrix4().fromArray(g.m));
}
export function mepRuns(model, keep = null) {
  const pts = { listrik: [], air: [], kotor: [], septic: [], tandon: [], panel: [] };
  for (const [gid, g] of Object.entries(model.groups)) {
    if (!g.mep || !MEP[g.mep.kind]) continue;
    const it = MEP[g.mep.kind], p = mepPos(g);
    if (keep && !['panel', 'septic', 'tandon'].includes(g.mep.kind === 'panel' ? 'panel' : it.sys) && !keep(+gid)) continue; // renovasi: jalur titik baru saja
    if (g.mep.kind === 'panel') pts.panel.push(p);
    else if (it.sys === 'listrik') pts.listrik.push(p);
    if (it.sys === 'air' || it.sys === 'kotor') pts.air.push(p);
    if (it.sys === 'kotor') pts.kotor.push(p);
    if (it.sys === 'septic') pts.septic.push(p);
    if (it.sys === 'tandon') pts.tandon.push(p);
  }
  const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
  const centroid = (arr) => arr.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / arr.length);
  const sum = (arr, src) => (src && arr.length ? arr.reduce((s, v) => s + man(v, src), 0) * 1.1 : 0);
  const panel = pts.panel[0] || (pts.listrik.length ? centroid(pts.listrik) : null);
  const tandon = pts.tandon[0] || (pts.air.length ? centroid(pts.air) : null);
  const septic = pts.septic[0] || null;
  return { kabel: sum(pts.listrik, panel), air: sum(pts.air, tandon), kotor: sum(pts.kotor, septic), counts: pts };
}

// ---------- RAB ----------
const ahspBy = Object.fromEntries(AHSP.map((a) => [a.code, a]));
// ---------- Renovasi: fase eksisting / dibongkar / baru ----------
export const PHASE_LABEL = { exist: 'Eksisting', demo: 'Dibongkar', new: 'Baru' };
const META_KEYS = ['wall', 'opening', 'room', 'roof', 'stair', 'mep', 'slab', 'beam', 'column', 'furniture'];
// Fase grup: milik sendiri; struktur ikut dindingnya; elemen bermeta yang belum ditandai = baru;
// sub-grup polos ikut induknya.
export function phaseOf(model, gid, depth = 0) {
  if (gid == null || depth > 60) return 'new';
  const g = model.groups[gid];
  if (!g) return 'new';
  if (g.phase) return g.phase;
  if (g.struct && model.groups[g.struct.wall]) return phaseOf(model, g.struct.wall, depth + 1);
  if (META_KEYS.some((k) => g[k])) return 'new';
  return phaseOf(model, g.parent ?? null, depth + 1);
}
export const facePhase = (model, f) => phaseOf(model, f.group ?? null);
export const renoActive = (model) => Object.values(model.groups || {}).some((g) => g.phase);
// tandai grup beserta seluruh sub-grupnya
export function setPhase(model, gids, phase) {
  const all = new Set();
  const walk = (g) => {
    if (all.has(g)) return;
    all.add(g);
    for (const [k, c] of Object.entries(model.groups)) if ((c.parent ?? null) === g) walk(+k);
  };
  gids.forEach((g) => walk(+g));
  for (const g of all) {
    const gr = model.groups[g];
    if (!gr) continue;
    if (phase === 'new') delete gr.phase;
    else gr.phase = phase;
  }
  // struktur dinding ikut
  for (const sg of Object.values(model.groups)) if (sg.struct && all.has(sg.struct.wall)) delete sg.phase;
  return all.size;
}
// Pekerjaan bongkaran (tidak ada di AHSP RAB_Bangunan): harga pasar perkiraan, bisa diubah di panel RAB.
const demoIt = (code, name, unit, price) => ({ code, name, unit, price, mat: 0, lab: 0.85, eq: 0.15, group: 'Bongkaran', sub: 'Pekerjaan Bongkaran' });
export const DEMO_ITEMS = Object.fromEntries([
  demoIt('B.1', 'Bongkar pasangan dinding bata + plester', 'm²', 45000),
  demoIt('B.2', 'Bongkar penutup & rangka atap', 'm²', 35000),
  demoIt('B.3', 'Bongkar plafon', 'm²', 20000),
  demoIt('B.4', 'Bongkar kusen + daun pintu/jendela', 'unit', 75000),
  demoIt('B.5', 'Bongkar beton bertulang', 'm³', 750000),
  demoIt('B.6', 'Bongkar lantai keramik', 'm²', 30000),
  demoIt('B.7', 'Angkut & buang puing (volume gembur)', 'm³', 175000),
  demoIt('B.8', 'Bongkar titik instalasi / sanitair', 'titik', 50000),
  demoIt('B.9', 'Bobok dinding lama untuk bukaan baru + perapian', 'm²', 85000),
].map((d) => [d.code, d]));

// ---------- Elemen struktur: plat, balok, kolom (+ footplat) ----------
const SLABC = '#cbc7bf', BEAMC = '#b9b6ae';
const ccw = (pts) => (G.newellNormal(pts).z < 0 ? pts.slice().reverse() : pts);
function prism(model, pts2, z, h, color, parent) {
  const pts = ccw(pts2.map((p) => [p[0], p[1], z]));
  const f = G.makeFace(model, pts, UP, color);
  if (!f) return null;
  f.group = parent;
  model.faces.push(f);
  G.pushPull(model, f.id, h);
  return f.solid;
}
const polyArea2 = (P) => Math.abs(P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
function groupFrom(model, start, name, parent) {
  const ids = new Set(model.faces.filter((f) => f.id >= start).map((f) => f.id));
  for (const f of model.faces) if (ids.has(f.id)) f.group = parent;
  return G.makeGroup(model, ids, name, false, parent);
}
// Plat beton: outline 2D [[x,y]..], zTop = elevasi atas plat
export function makeSlab(model, outline, zTop, t = 0.12, parent = null) {
  const start = model.nextId;
  if (prism(model, outline, zTop - t, t, SLABC, parent) == null) return null;
  const gid = groupFrom(model, start, `Plat beton ${Math.round(t * 100)} cm`, parent);
  const pts = outline.map((p) => [+p[0].toFixed(4), +p[1].toFixed(4)]);
  model.groups[gid].slab = { t, z: +zTop.toFixed(4), area: +polyArea2(pts).toFixed(3), pts };
  return gid;
}
// Balok: as a->b (2D), zTop = elevasi atas balok, lebar bw, tinggi total h
export function makeBeam(model, a, b, zTop, bw = 0.15, h = 0.3, parent = null) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  if (L < 0.05) return null;
  const nx = (-dy / L) * (bw / 2), ny = (dx / L) * (bw / 2);
  const start = model.nextId;
  prism(model, [[a[0] + nx, a[1] + ny], [a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]], zTop - h, h, BEAMC, parent);
  const gid = groupFrom(model, start, `Balok ${Math.round(bw * 100)}/${Math.round(h * 100)}`, parent);
  model.groups[gid].beam = { b: bw, h, p1: [+a[0].toFixed(4), +a[1].toFixed(4)], p2: [+b[0].toFixed(4), +b[1].toFixed(4)], z: +zTop.toFixed(4), len: +L.toFixed(4) };
  return gid;
}
// Sloof pengikat (balok di atas tanah, mis. untuk footplat pinggir)
export function makeSloof(model, a, b, zTop, bw = 0.15, h = 0.2, parent = null) {
  const gid = makeBeam(model, a, b, zTop, bw, h, parent);
  if (gid == null) return null;
  model.groups[gid].beam.sloof = true;
  model.groups[gid].name = `Sloof pengikat ${Math.round(bw * 100)}/${Math.round(h * 100)}`;
  return gid;
}

// ---------- Batas tanah (kavling persegi panjang: model.site = {w, d, x0, y0}) ----------
export function siteOf(model) {
  const s = model.site;
  if (!s || !(s.w > 0) || !(s.d > 0)) return null;
  const x0 = +s.x0 || 0, y0 = +s.y0 || 0;
  return { x0, y0, x1: x0 + s.w, y1: y0 + s.d, w: s.w, d: s.d };
}
// jarak dari titik p ke batas tanah searah vektor satuan u (Infinity bila tanpa batas)
export function siteRay(S, p, u) {
  if (!S) return Infinity;
  let t = Infinity;
  if (u.x > 1e-9) t = Math.min(t, (S.x1 - p.x) / u.x);
  if (u.x < -1e-9) t = Math.min(t, (S.x0 - p.x) / u.x);
  if (u.y > 1e-9) t = Math.min(t, (S.y1 - p.y) / u.y);
  if (u.y < -1e-9) t = Math.min(t, (S.y0 - p.y) / u.y);
  return Math.max(0, t);
}
// pusat footplat B x B untuk kolom di (x, y): digeser ke dalam bila menyeberang batas tanah (footplat pinggir)
export function footCenter(model, x, y, B) {
  const S = siteOf(model);
  if (!S) return [x, y];
  const cl = (v, a, b) => (b < a ? (a + b) / 2 : Math.min(Math.max(v, a), b));
  return [cl(x, S.x0 + B / 2, S.x1 - B / 2), cl(y, S.y0 + B / 2, S.y1 - B / 2)];
}
// rapatkan titik yang sedikit keluar batas (kolom praktis, ring, sloof) ke garis batas tanah
function clampToSite(model, faces, tol = 0.15) {
  const S = siteOf(model);
  if (!S) return;
  const cl = (p) => {
    if (p[0] < S.x0 && p[0] > S.x0 - tol) p[0] = S.x0;
    if (p[0] > S.x1 && p[0] < S.x1 + tol) p[0] = S.x1;
    if (p[1] < S.y0 && p[1] > S.y0 - tol) p[1] = S.y0;
    if (p[1] > S.y1 && p[1] < S.y1 + tol) p[1] = S.y1;
  };
  for (const f of faces) { f.pts.forEach(cl); (f.holes || []).forEach((h) => h.forEach(cl)); }
}

// Kolom struktur b x b dari z0 setinggi H; foot = lebar footplat (0 = tanpa), dalam = kedalaman dasar footplat
export function makeColumn(model, x, y, z0, H, b = 0.2, opt = {}, parent = null) {
  const foot = opt.foot || 0, depth = opt.depth || 1.0, tf = 0.25;
  const start = model.nextId;
  const sq = (w, cx = x, cy = y) => [[cx - w / 2, cy - w / 2], [cx + w / 2, cy - w / 2], [cx + w / 2, cy + w / 2], [cx - w / 2, cy + w / 2]];
  const zb = foot ? z0 - depth + tf : z0;
  prism(model, sq(b), zb, z0 + H - zb, CONC, parent);
  const fc = foot ? footCenter(model, x, y, foot) : [x, y];
  if (foot) prism(model, sq(foot, fc[0], fc[1]), z0 - depth, tf, CONC, parent);
  const ecc = [+(fc[0] - x).toFixed(4), +(fc[1] - y).toFixed(4)];
  const pinggir = Math.abs(ecc[0]) > 0.01 || Math.abs(ecc[1]) > 0.01;
  const gid = groupFrom(model, start, `Kolom ${Math.round(b * 100)}/${Math.round(b * 100)}${foot ? (pinggir ? ' + footplat pinggir' : ' + footplat') : ''}`, parent);
  model.groups[gid].column = { b, H: +H.toFixed(4), x: +x.toFixed(4), y: +y.toFixed(4), z: +z0.toFixed(4), foot, depth, ...(pinggir ? { ecc } : {}) };
  return gid;
}
// Bangun ulang elemen dengan ukuran baru (fase, tag, induk & nama-ruang dipertahankan)
export function rebuildElem(model, gid, patch = {}) {
  const g = model.groups[gid];
  if (!g) return null;
  const keep = { phase: g.phase, tag: g.tag, parent: g.parent ?? null };
  let ng = null;
  if (g.slab) {
    const s = { ...g.slab, ...patch };
    G.deleteIds(model, G.entitiesInTree(model, gid));
    ng = makeSlab(model, s.pts, s.z, s.t, keep.parent);
  } else if (g.beam) {
    const s = { ...g.beam, ...patch };
    G.deleteIds(model, G.entitiesInTree(model, gid));
    ng = (s.sloof ? makeSloof : makeBeam)(model, s.p1, s.p2, s.z, s.b, s.h, keep.parent);
  } else if (g.column) {
    const s = { ...g.column, ...patch };
    G.deleteIds(model, G.entitiesInTree(model, gid));
    ng = makeColumn(model, s.x, s.y, s.z, s.H, s.b, { foot: s.foot, depth: s.depth }, keep.parent);
  }
  if (ng != null) {
    if (keep.phase) model.groups[ng].phase = keep.phase;
    if (keep.tag != null) model.groups[ng].tag = keep.tag;
  }
  return ng;
}
// Tulangan elemen -> baris pembesian {el, kode, bar, desc, len}
export function elemBars(kind, d) {
  const out = [];
  const add = (el, kode, bar, desc, len) => len > 0 && out.push({ el, kode, bar, desc, len });
  if (kind === 'balok') {
    const main = d.h >= 0.25 ? 'D13' : 'D10', n = d.h >= 0.4 ? 6 : 4;
    const per = 2 * (d.b + d.h) - 0.16 + 0.1;
    const tag = `Balok ${Math.round(d.b * 100)}/${Math.round(d.h * 100)}`;
    add(tag, 'B', main, `Tulangan utama ${n}${main}`, n * (d.len + 0.4) * d.n);
    add(tag, 'B', 'Ø8', `Sengkang Ø8-150 (${per.toFixed(2)} m/bh)`, (Math.floor(d.len / 0.15) + 1) * per * d.n);
  } else if (kind === 'kolom') {
    const main = d.b >= 0.2 ? 'D13' : 'D10';
    const per = 4 * d.b - 0.16 + 0.1;
    const tag = `Kolom struktur ${Math.round(d.b * 100)}/${Math.round(d.b * 100)}`;
    add(tag, 'KS', main, `Tulangan utama 4${main}`, 4 * (d.H + 0.6) * d.n);
    add(tag, 'KS', 'Ø8', `Sengkang Ø8-150 (${per.toFixed(2)} m/bh)`, (Math.floor(d.H / 0.15) + 1) * per * d.n);
  } else if (kind === 'footplat') {
    const nb = Math.ceil(d.B / 0.15) + 1;
    add(`Footplat ${Math.round(d.B * 100)}×${Math.round(d.B * 100)}`, 'FP', 'D13', `Tulangan D13-150 dua arah (${nb}+${nb} btg)`, 2 * nb * (d.B + 0.2) * d.n);
  } else if (kind === 'ring') {
    const per = 2 * (0.15 + d.h) - 0.16 + 0.1;
    const tag = `Ring balok 15/${Math.round(d.h * 100)}`;
    add(tag, 'RB', 'D13', 'Tulangan utama 4D13', 4 * d.len * 1.05);
    add(tag, 'RB', 'Ø8', `Sengkang Ø8-150 (${per.toFixed(2)} m/bh)`, (d.len / 0.15) * per);
  }
  return out.map((r) => ({ ...r, len: r.len * (r.bar === 'Ø8' ? 1.05 : 1.1) }));
}
const pip2 = (x, y, P) => G.pointInPoly2(new THREE.Vector2(x, y), P.map((p) => new THREE.Vector2(p[0], p[1])));
export function slabAt(model, x, y, z, tol = 0.06) {
  for (const g of Object.values(model.groups)) if (g.slab && Math.abs(g.slab.z - z) < tol && pip2(x, y, g.slab.pts)) return g.slab;
  return null;
}

// Bagian plat (0..1) yang tidak tertutup plat lebih tinggi atau atap (atap yang dibongkar diabaikan).
export function slabExposure(model, s) {
  const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]);
  const covers = [];
  for (const [k, o] of Object.entries(model.groups)) {
    if (phaseOf(model, +k) === 'demo') continue;
    if (o.slab && o.slab !== s && o.slab.z > s.z + 0.3) covers.push((x, y) => pip2(x, y, o.slab.pts));
    if (o.roof) {
      const tree = G.entitiesInTree(model, +k);
      for (const f of model.faces) if (tree.has(f.id) && f.n[2] > 0.1 && Math.max(...f.pts.map((p) => p[2])) > s.z + 0.3) covers.push((x, y) => pip2(x, y, f.pts));
    }
  }
  let n = 0, open = 0;
  const st = Math.max(0.25, Math.sqrt(s.area) / 12);
  for (let x = Math.min(...xs) + st / 2; x < Math.max(...xs); x += st) for (let y = Math.min(...ys) + st / 2; y < Math.max(...ys); y += st) {
    if (!pip2(x, y, s.pts)) continue;
    n++;
    if (!covers.some((c) => c(x, y))) open++;
  }
  return n ? open / n : 0;
}

export const FLOOR_TYPES = { '7.4.1.1': 'Keramik 30x30', '7.4.1.2': 'Keramik 40x40', '9.1.1.1': 'Granit 60x60' };

export function rabQuantities(model, opt = {}) {
  const q = {};
  const add = (code, v, note) => {
    if (!(v > 1e-6)) return;
    q[code] ||= { code, vol: 0, notes: [] };
    q[code].vol += v;
    if (note) q[code].notes.push(note);
  };
  const levels = levelsOf(model);
  const z0 = levels[0].z;
  const pond = pondasiOf(model, opt.pondasi);
  const reno = renoActive(model);
  const bars = [];
  let puing = 0, elemConc = 0;
  const conc = (v) => { add('6.3.1.3', v); elemConc += v; };
  const gvol = (gid, filt = () => true) => {
    const sids = new Set(model.faces.filter((f) => (f.group ?? null) === +gid && f.solid != null && filt(f)).map((f) => f.solid));
    let v = 0;
    for (const s2 of sids) v += solidVolume(model, s2);
    return v;
  };
  for (const [gid, g] of Object.entries(model.groups)) {
    const ph = reno ? phaseOf(model, +gid) : 'new';
    if (ph === 'demo') {
      // pekerjaan bongkaran
      if (g.wall) { const v = gvol(gid); add('B.1', v / g.wall.t); puing += v; }
      else if (g.opening) add('B.4', 1);
      else if (g.room) { add('B.6', g.room.area); add('B.3', g.room.area); puing += g.room.area * 0.05; }
      else if (g.roof) {
        let a = 0;
        for (const f of model.faces) if ((f.group ?? null) === +gid && f.n[2] > 0.1) a += G.faceArea(f);
        add('B.2', a); puing += a * 0.04;
      } else if (g.stair || g.slab || g.beam || g.column) { const v = gvol(gid, (f) => !f.finish); add('B.5', v); puing += v; }
      else if (g.mep) add('B.8', 1);
      else if (g.parent == null) { const v = gvol(gid); if (v > 0.005) { add('B.5', v); puing += v; } } // benda pejal lain (mis. pilar pagar)
      continue;
    }
    if (ph === 'exist') {
      // perkuatan struktur pada dinding lama (hasil saran cek struktur)
      const up = g.wall && g.wall.upgrade;
      if (up) {
        const nCols = columnPoints(g.wall).length, L = g.wall.len;
        if (up.colB > 0.15) {
          conc(nCols * up.colB * up.colB * g.wall.h);
          add('6.5.1.1', nCols * 2 * up.colB * g.wall.h);
          add('B.9', nCols * up.colB * g.wall.h, 'bobok untuk kolom struktur baru');
          bars.push(...elemBars('kolom', { b: up.colB, H: g.wall.h, n: nCols }));
        }
        if (up.ringH > 0.2) {
          conc(0.15 * up.ringH * L);
          add('6.5.1.2', 2 * up.ringH * L);
          add('B.9', up.ringH * L, 'bobok untuk ring balok baru');
          bars.push(...elemBars('ring', { h: up.ringH, len: L }));
        }
      }
      continue;
    }
    if (g.opening && reno && g.parent != null && phaseOf(model, g.parent) === 'exist') add('B.9', g.opening.w * g.opening.h, 'bukaan baru di dinding lama');
    if (g.slab) {
      const s = g.slab;
      if (s.t <= 0.13) add('18.1.1.1', s.area * Math.max(1, s.t / 0.12));
      else if (Math.abs(s.t - 0.15) < 0.02) add('18.1.1.2', s.area);
      else add('18.1.1.2', s.area * (s.t / 0.15));
      // plat dak terbuka ke langit -> waterproofing (luas terbuka + naik 30 cm ke dinding tepi)
      const ex = slabExposure(model, s);
      if (ex > 0.02) {
        const per = s.pts.reduce((a, p, i) => { const q = s.pts[(i + 1) % s.pts.length]; return a + Math.hypot(q[0] - p[0], q[1] - p[1]); }, 0);
        add('7.9.2.1', ex * (s.area + 0.3 * per));
      }
    }
    if (g.beam?.sloof) {
      const bm = g.beam;
      add('6.1.1.1', (bm.b + 0.3) * (bm.h + 0.1) * bm.len);
      conc(bm.b * bm.h * bm.len);
      add('6.5.1.2', 2 * bm.h * bm.len);
      bars.push(...elemBars('balok', { b: bm.b, h: bm.h, len: bm.len, n: 1 }));
    } else if (g.beam) {
      const bm = g.beam;
      const mid = [(bm.p1[0] + bm.p2[0]) / 2, (bm.p1[1] + bm.p2[1]) / 2];
      const sl = slabAt(model, mid[0], mid[1], bm.z, 0.06) || slabAt(model, mid[0] + 0.2, mid[1], bm.z, 0.06) || slabAt(model, mid[0], mid[1] + 0.2, bm.z, 0.06);
      const hb = Math.max(0.05, bm.h - (sl ? sl.t : 0));
      conc(bm.b * hb * bm.len);
      add('6.5.1.2', (2 * hb + bm.b) * bm.len);
      bars.push(...elemBars('balok', { b: bm.b, h: bm.h, len: bm.len, n: 1 }));
    }
    if (g.column) {
      const c = g.column, Hc = c.H + (c.foot ? c.depth - 0.25 : 0);
      conc(c.b * c.b * Hc + (c.foot ? c.foot * c.foot * 0.25 : 0));
      add('6.5.1.1', 4 * c.b * Hc);
      bars.push(...elemBars('kolom', { b: c.b, H: Hc, n: 1 }));
      if (c.foot) {
        add('6.1.1.1', (c.foot + 0.3) ** 2 * c.depth);
        add('6.9.1.1', c.foot * c.foot);
        bars.push(...elemBars('footplat', { B: c.foot, n: 1 }));
      }
    }
    if (g.wall) {
      const sids = new Set(model.faces.filter((f) => (f.group ?? null) === +gid && f.solid != null).map((f) => f.solid));
      let vol = 0;
      for (const s of sids) vol += solidVolume(model, s);
      const area = vol / g.wall.t;
      const L = g.wall.len;
      const nCols = columnPoints(g.wall).length;
      const cb = g.wall.colB || 0.15, rh = g.wall.ringH || 0.2;
      // pasangan bata = luas dinding - bidang kolom praktis - ring balok (plester tetap seluruh bidang)
      add('7.1.1.1', Math.max(0, area - nCols * cb * (g.wall.h - rh) - L * rh));
      add('7.2.1.1', area * 2);
      add('7.2.1.2', area * 2);
      // dinding keliling tertutup: satu sisi dalam + satu sisi luar; sekat: dua sisi dalam
      add('7.3.1.1', g.wall.closed ? area : area * 2);
      if (g.wall.closed) add('7.3.1.2', area);
      if (rh > 0.2 + 1e-6) {
        conc(0.15 * rh * L);
        add('6.5.1.2', 2 * rh * L);
        bars.push(...elemBars('ring', { h: rh, len: L }));
      } else add('6.8.1.2', L);
      if (cb > 0.15 + 1e-6) {
        conc(nCols * cb * cb * g.wall.h);
        add('6.5.1.1', nCols * 2 * cb * g.wall.h);
        bars.push(...elemBars('kolom', { b: cb, H: g.wall.h, n: nCols }));
      } else add('6.8.1.1', nCols * g.wall.h);
      const pts = g.wall.pts;
      const zb = pts[0] ? pts[0][2] : 0;
      if (Math.abs(zb - z0) < 0.1) {
        add('6.1.1.1', L * pond.w * pond.d);
        add('6.2.1.1', L * pond.w * pond.sand);
        add('6.6.1.1', L * pond.stone);
        add('sloof', L);
      }
    }
    if (g.opening) {
      const o = g.opening;
      add('7.5.1.1', o.type === 'pintu' ? 2 * o.h + o.w : 2 * o.h + 2 * o.w);
      if (o.type === 'pintu') add('7.5.2.1', 1);
      else add('7.5.3.1', o.w > 0.8 ? 2 : 1);
    }
    if (g.room) {
      const r = g.room;
      add(r.floor || '7.4.1.2', r.area);
      add('7.7.1.1', r.area);
      const lab = model.labels.find((l) => l.id === r.label);
      if (Math.abs(r.z - z0) < 0.1) {
        add('6.9.1.1', r.area);
        add('6.2.1.1', r.area * 0.1);
      } else if (!(lab && (slabAt(model, lab.p[0], lab.p[1], r.z, 0.15)))) add('18.1.1.1', r.area); // plat digambar terpisah -> tidak dihitung dua kali
    }
    if (g.stair) {
      const st = g.stair;
      const sids = new Set(model.faces.filter((f) => (f.group ?? null) === +gid && !f.finish).map((f) => f.solid));
      let vol = 0;
      for (const s2 of sids) if (s2 != null) vol += solidVolume(model, s2);
      add('6.3.1.3', vol);
      add('7.4.1.1', st.n * (st.T + st.R) * st.w + (st.landing || 0));
      add('14.3.1.1', st.rail ?? Math.hypot(st.run, st.H));
    }
    if (g.mep && MEP[g.mep.kind]) for (const [code, k] of Object.entries(MEP[g.mep.kind].codes)) add(code, k);
    if (g.roof) {
      let a = 0;
      for (const f of model.faces) if ((f.group ?? null) === +gid && f.n[2] > 0.1) a += G.faceArea(f);
      add('7.6.1.1', a);
      add('14.2.1.1', a);
    }
  }
  const runs = mepRuns(model, reno ? (g) => phaseOf(model, g) === 'new' : null);
  add('8.4.1.1', runs.kabel); // kabel NYM 2.5 mm²
  add('16.2.1.1', runs.kabel); // pipa conduit
  add('17.1.1.1', runs.air); // air bersih 1/2"
  add('17.2.1.2', runs.kotor); // air kotor 4"
  if (puing > 0) add('B.7', puing * 1.3);
  // besi elemen struktur (balok, kolom struktur, footplat, ring balok besar) dihitung terpisah per kg
  let ulir = 0, polos = 0;
  for (const b of bars) { const kg = b.len * BAR_KG[b.bar]; if (b.bar.startsWith('D')) ulir += kg; else polos += kg; }
  add('6.4.1.2', ulir);
  add('6.4.1.1', polos);
  Object.defineProperty(q, '_bars', { value: bars, enumerable: false });
  Object.defineProperty(q, '_elemConc', { value: elemConc, enumerable: false });
  return q;
}

const ORDER = ['Pekerjaan Bongkaran', 'Pekerjaan Tanah', 'Pekerjaan Pondasi', 'Pekerjaan Beton', 'Pekerjaan Besi', 'Pekerjaan Bekisting', 'Cor Dak', 'Konstruksi Baja', 'Pekerjaan Dinding', 'Pekerjaan Plester', 'Pekerjaan Kayu', 'Pekerjaan Lantai', 'Pekerjaan Waterproofing', 'Pekerjaan Plafon', 'Baja Ringan', 'Pekerjaan Atap', 'Pekerjaan Cat', 'Pekerjaan Listrik', 'Kabel Listrik', 'Pipa Instalasi', 'Panel Listrik', 'Lampu', 'Pekerjaan AC', 'Pekerjaan Ventilasi', 'Pekerjaan Plumbing', 'Pipa Air Bersih', 'Pipa Air Kotor', 'Sanitari', 'Pekerjaan Sanitasi', 'Pekerjaan Pompa', 'Pekerjaan Tandon'];

// Paket penawaran: tukar item finishing & faktor harga per kategori.
export const PACKAGES = {
  hemat: {
    label: 'Hemat', swap: { '7.4.1.2': '7.4.1.1', '9.1.1.1': '7.4.1.1', '7.5.2.1': '15.2.2.1', '7.5.1.1': '15.1.1.1' },
    factor: { 'Pekerjaan Cat': 0.9, Sanitari: 0.85, Lampu: 0.9 },
    spec: { Lantai: 'Keramik 30×30', Kusen: 'Kayu meranti 6/12', Pintu: 'Pintu flush kayu lapis', Atap: 'Genteng beton', Cat: 'Cat tembok ekonomis', Sanitair: 'Sanitair standar ekonomis' },
  },
  standar: {
    label: 'Standar', swap: {}, factor: {},
    spec: { Lantai: 'Sesuai pilihan per ruang (umumnya keramik 40×40)', Kusen: 'Kayu kamper 6/12', Pintu: 'Pintu panel kayu', Atap: 'Genteng beton', Cat: 'Cat tembok standar', Sanitair: 'Sanitair standar' },
  },
  premium: {
    label: 'Premium', swap: { '7.4.1.1': '9.1.1.1', '7.4.1.2': '9.1.1.1', '7.5.2.1': '15.2.1.1', '7.6.1.1': '19.1.1.1' },
    factor: { 'Pekerjaan Cat': 1.3, Sanitari: 1.6, Lampu: 1.3 },
    spec: { Lantai: 'Granit tile 60×60', Kusen: 'Kayu kamper 6/12', Pintu: 'Pintu panel kayu solid 3 cm', Atap: 'Genteng keramik glazur', Cat: 'Cat tembok premium (tahan cuaca)', Sanitair: 'Sanitair premium' },
  },
};
export function rabRows(model, opt = {}) {
  const q0 = rabQuantities(model, opt);
  const pk = opt.pkg && PACKAGES[opt.pkg];
  let q = q0;
  if (pk) {
    q = {};
    for (const it of Object.values(q0)) {
      const code = pk.swap[it.code] || it.code;
      q[code] ||= { code, vol: 0, notes: [] };
      q[code].vol += it.vol;
    }
  }
  const prices = (model.rab && model.rab.prices) || {};
  const rows = [];
  for (const it of Object.values(q)) {
    const src = it.code === 'sloof' ? { ...ahspBy['6.8.1.2'], name: 'Sloof beton 15/20 cm' } : ahspBy[it.code] || DEMO_ITEMS[it.code];
    if (!src) continue;
    const vol = Math.round(it.vol * 100) / 100;
    const price = Math.round((prices[it.code] ?? src.price) * ((pk && pk.factor[src.sub]) || 1));
    const total = vol * price;
    rows.push({
      key: it.code, cat: src.sub, name: src.name, code: src.code, vol, unit: src.unit, price,
      mat: Math.round(total * src.mat), lab: Math.round(total * src.lab), eq: Math.round(total * src.eq), total: Math.round(total),
    });
  }
  rows.sort((a, b) => {
    const ca = ORDER.indexOf(a.cat), cb = ORDER.indexOf(b.cat);
    return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb) || a.code.localeCompare(b.code, undefined, { numeric: true });
  });
  return rows;
}

// Lembar Excel dalam format ekspor RAB_Bangunan.
export function rabSheet(model, rows, project = {}) {
  const data = [];
  data.push(['RENCANA ANGGARAN BIAYA (RAB)']);
  data.push(['Nama Proyek:', project.name || 'Proyek SketchClone']);
  data.push(['Lokasi:', project.location || '-']);
  data.push(['Tanggal:', project.date || new Date().toLocaleDateString('id-ID')]);
  data.push(['Status:', project.status || 'Perencanaan']);
  data.push([]);
  data.push(['No', 'Kategori Pekerjaan', 'Jenis Pekerjaan', 'Kode SNI', 'Volume', 'Satuan', 'Harga Satuan', 'Biaya Material', 'Biaya Tenaga', 'Biaya Alat', 'Total Biaya', 'Standar']);
  let no = 1, grand = 0;
  const cats = [...new Set(rows.map((r) => r.cat))];
  for (const c of cats) {
    data.push([c, '', '', '', '', '', '', '', '', '', '', '']);
    for (const r of rows.filter((x) => x.cat === c)) {
      data.push([no++, r.cat, r.name, r.code, r.vol, r.unit, r.price, r.mat, r.lab, r.eq, r.total, 'SNI 2016']);
      grand += r.total;
    }
    data.push([]);
  }
  data.push(['', '', '', '', '', '', '', '', '', 'TOTAL KESELURUHAN', grand, '']);
  return { data, grand };
}


// ---------- Rekapitulasi, jasa & PPN ----------
const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
export function terbilang(n) {
  n = Math.floor(Math.abs(n));
  if (n < 12) return SATUAN[n];
  if (n < 20) return terbilang(n - 10) + ' belas';
  if (n < 100) return terbilang(Math.floor(n / 10)) + ' puluh' + (n % 10 ? ' ' + terbilang(n % 10) : '');
  if (n < 200) return 'seratus' + (n > 100 ? ' ' + terbilang(n - 100) : '');
  if (n < 1000) return terbilang(Math.floor(n / 100)) + ' ratus' + (n % 100 ? ' ' + terbilang(n % 100) : '');
  if (n < 2000) return 'seribu' + (n > 1000 ? ' ' + terbilang(n - 1000) : '');
  const big = [[1e12, 'triliun'], [1e9, 'miliar'], [1e6, 'juta'], [1e3, 'ribu']];
  for (const [v, w] of big) if (n >= v) return terbilang(Math.floor(n / v)) + ' ' + w + (n % v ? ' ' + terbilang(n % v) : '');
  return '';
}
export const REKAP_DEFAULT = { jasa: 10, ppn: 11 };
export function rekap(model, rows) {
  const o = { ...REKAP_DEFAULT, ...((model.rab && model.rab.rekap) || {}) };
  const cats = [];
  for (const r of rows) {
    let c = cats.find((x) => x.cat === r.cat);
    if (!c) cats.push((c = { cat: r.cat, total: 0 }));
    c.total += r.total;
  }
  const sub = cats.reduce((a, c) => a + c.total, 0);
  const jasa = Math.round((sub * o.jasa) / 100);
  const dpp = sub + jasa;
  const ppn = Math.round((dpp * o.ppn) / 100);
  const total = dpp + ppn;
  const bulat = Math.ceil(total / 1000) * 1000;
  const words = terbilang(bulat);
  return { cats, sub, jasaPct: o.jasa, jasa, dpp, ppnPct: o.ppn, ppn, total, bulat, terbilang: words.charAt(0).toUpperCase() + words.slice(1) + ' rupiah' };
}

// ---------- Kebutuhan bahan (koefisien SNI) ----------
// Harga bahan dari daftar material RAB_Bangunan (MaterialSeeder); bahan tanpa harga di sana bernilai 0 dan bisa diisi.
export const MATERIALS = {
  semen: { name: 'Semen Portland 50 kg', unit: 'zak', price: 62000, per: 50 },
  pasir: { name: 'Pasir Pasang', unit: 'm³', price: 180000 },
  kerikil: { name: 'Kerikil/Split', unit: 'm³', price: 220000 },
  bata: { name: 'Bata Merah', unit: 'bh', price: 800 },
  besi: { name: 'Besi Beton', unit: 'kg', price: 16000 },
  bendrat: { name: 'Kawat Bendrat', unit: 'kg', price: 25000 },
  keramik: { name: 'Keramik Lantai', unit: 'm²', price: 85000 },
  cat: { name: 'Cat Tembok', unit: 'kg', price: 95000 },
  batukali: { name: 'Batu Kali / Batu Belah', unit: 'm³', price: 0 },
  pasirurug: { name: 'Pasir Urug', unit: 'm³', price: 0 },
  semenwarna: { name: 'Semen Warna (nat)', unit: 'kg', price: 0 },
};
// beton per m³: semen kg, pasir m³, kerikil m³
const BETON = { k100: [247, 0.621, 0.74], k225: [371, 0.499, 0.776], k250: [384, 0.494, 0.77] };
const beton = (mutu, vol) => ({ semen: BETON[mutu][0] * vol, pasir: BETON[mutu][1] * vol, kerikil: BETON[mutu][2] * vol });
// per satuan pekerjaan -> bahan (semen dalam kg)
export const KOEF = {
  '7.1.1.1': { bata: 70, semen: 11.5, pasir: 0.043 },
  '7.2.1.1': { semen: 6.24, pasir: 0.024 },
  '7.2.1.2': { semen: 3.25 },
  '6.6.1.1': { batukali: 1.2, semen: 163, pasir: 0.52 },
  '6.2.1.1': { pasirurug: 1.2 },
  '6.9.1.1': beton('k100', 0.05),
  '18.1.1.1': beton('k225', 0.12),
  '6.8.1.1': beton('k225', 0.0225),
  '6.8.1.2': beton('k225', 0.03),
  sloof: beton('k225', 0.03),
  '6.3.1.3': { ...beton('k250', 1), besi: 80, bendrat: 1.2 },
  '7.4.1.1': { keramik: 1.05, semen: 10, pasir: 0.045, semenwarna: 1.5 },
  '7.4.1.2': { keramik: 1.05, semen: 9.8, pasir: 0.045, semenwarna: 1.3 },
  '9.1.1.1': { semen: 9.6, pasir: 0.045, semenwarna: 1.0 },
  '7.3.1.1': { cat: 0.26 },
  '7.3.1.2': { cat: 0.3 },
};
export function materialTakeoff(model) {
  const q = rabQuantities(model);
  const need = {};
  for (const it of Object.values(q)) {
    const k = KOEF[it.code];
    if (!k) continue;
    for (const [m, c] of Object.entries(k)) need[m] = (need[m] || 0) + c * it.vol;
  }
  if (q._elemConc) need.besi = Math.max(0, (need.besi || 0) - 80 * q._elemConc); // besi elemen sudah di daftar pembesian
  const bb = bbs(model, q);
  if (bb.totalKg > 0) {
    need.besi = (need.besi || 0) + bb.totalKg;
    need.bendrat = (need.bendrat || 0) + bb.totalKg * 0.015;
  }
  const prices = (model.rab && model.rab.matPrices) || {};
  return Object.keys(MATERIALS).filter((k) => need[k] > 1e-6).map((k) => {
    const M = MATERIALS[k];
    const raw = M.per ? need[k] / M.per : need[k];
    const qty = M.unit === 'bh' || M.unit === 'zak' ? Math.ceil(raw) : Math.ceil(raw * 100) / 100;
    const price = prices[k] ?? M.price;
    return { key: k, name: M.name, unit: M.unit, qty, price, total: Math.round(qty * price) };
  });
}

// ---------- Jadwal & Kurva S ----------
// Rentang tiap kategori pekerjaan sebagai pecahan durasi proyek (urutan pembangunan rumah umum).
export const PHASES = {
  'Pekerjaan Bongkaran': [0, 0.08], 'Pekerjaan Besi': [0.1, 0.5], 'Pekerjaan Bekisting': [0.1, 0.5],
  'Pekerjaan Tanah': [0, 0.1], 'Pekerjaan Pondasi': [0.05, 0.2], 'Pekerjaan Beton': [0.12, 0.5], 'Cor Dak': [0.3, 0.5],
  'Pekerjaan Dinding': [0.2, 0.55], 'Pekerjaan Kayu': [0.35, 0.75], 'Konstruksi Baja': [0.45, 0.7], 'Baja Ringan': [0.5, 0.65],
  'Pekerjaan Atap': [0.55, 0.72], 'Pekerjaan Plester': [0.45, 0.75], 'Pekerjaan Plafon': [0.68, 0.85], 'Pekerjaan Lantai': [0.72, 0.9],
  'Pekerjaan Cat': [0.85, 1],
};
const UTIL = [0.3, 0.95];
export function schedule(rows, weeks) {
  weeks = Math.max(2, Math.round(weeks));
  const total = rows.reduce((a, r) => a + r.total, 0) || 1;
  const cats = [];
  for (const r of rows) {
    const name = PHASES[r.cat] ? r.cat : 'Pekerjaan MEP (listrik, air & sanitasi)';
    let c = cats.find((x) => x.cat === name);
    if (!c) cats.push((c = { cat: name, cost: 0 }));
    c.cost += r.total;
  }
  for (const c of cats) {
    const [a, b] = PHASES[c.cat] || UTIL;
    c.w0 = Math.min(weeks - 1, Math.floor(a * weeks));
    c.w1 = Math.max(c.w0 + 1, Math.ceil(b * weeks));
    c.weight = (c.cost / total) * 100;
    c.per = Array(weeks).fill(0);
    for (let w = c.w0; w < c.w1; w++) c.per[w] = c.weight / (c.w1 - c.w0);
  }
  cats.sort((x, y) => x.w0 - y.w0 || x.w1 - y.w1);
  const plan = Array(weeks).fill(0).map((_, w) => cats.reduce((a, c) => a + c.per[w], 0));
  const cum = [];
  plan.reduce((a, v, i) => (cum[i] = a + v), 0);
  return { weeks, cats, plan, cum };
}


// ---------- Struktur: kolom praktis, ring balok, sloof, pondasi ----------
// Titik kolom: tiap sudut + tiap <= 3 m di sepanjang dinding (sama dengan hitungan RAB).
export function columnPoints(w) {
  const P = w.pts.map(V);
  const segs = w.closed ? P.length : P.length - 1;
  const out = P.map((p, i) => {
    const q = P[(i + 1) % P.length], pr = P[(i - 1 + P.length) % P.length];
    const d = (w.closed || i < P.length - 1 ? q.clone().sub(p) : p.clone().sub(pr)).setZ(0).normalize();
    return { p, d };
  });
  for (let i = 0; i < segs; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L = a.distanceTo(b), k = Math.floor(L / 3);
    const d = b.clone().sub(a).setZ(0).normalize();
    for (let j = 1; j <= k; j++) out.push({ p: a.clone().lerp(b, j / (k + 1)), d });
  }
  return out;
}
function openingsOfWall(model, gid) {
  const out = [];
  for (const [k, g] of Object.entries(model.groups)) {
    if (!g.opening?.frame || (g.parent ?? null) !== gid) continue;
    const Mg = new THREE.Matrix4().fromArray(g.m);
    out.push({ o: V(g.opening.frame.o).applyMatrix4(Mg), u: V(g.opening.frame.u).transformDirection(Mg), w: g.opening.w });
  }
  return out;
}
const CONC = '#a9abae', STONE = '#8d8377';
export function buildStructure(model, wallGid, opt = {}) {
  const g = model.groups[wallGid];
  if (!g?.wall) return null;
  const w = g.wall, b = w.colB || 0.15, zb = w.pts[0][2], h = w.h, rh = w.ringH || 0.2;
  // hapus struktur lama dinding ini
  for (const [k, sg] of Object.entries(model.groups)) if (sg.struct?.wall === +wallGid) G.deleteIds(model, G.entitiesInTree(model, +k));
  const start = model.nextId;
  const ops = openingsOfWall(model, +wallGid);
  const cols = columnPoints(w).map(({ p, d }) => {
    // geser kolom keluar dari bukaan pintu/jendela ke samping kusen
    for (const o of ops) {
      const a = p.clone().sub(o.o).setZ(0).dot(o.u);
      const off = p.clone().sub(o.o).setZ(0).addScaledVector(o.u, -a).length();
      if (off < w.t && a > -b / 2 && a < o.w + b / 2) p = o.o.clone().setZ(p.z).addScaledVector(o.u, a < o.w / 2 ? -b / 2 : o.w + b / 2);
    }
    return { p, d };
  });
  for (const { p, d } of cols) {
    const cm = { ...model, faces: [], nextId: model.nextId };
    lbox(cm, 0, -b / 2, -b / 2, 0, b, b, h - rh, CONC);
    G.applyMatrix(cm, new Set(cm.faces.map((f) => f.id)), new THREE.Matrix4().makeRotationZ(Math.atan2(d.y, d.x)).setPosition(p.x, p.y, zb));
    model.nextId = cm.nextId;
    model.faces.push(...cm.faces);
  }
  const band = (z, hh, color) => {
    const fp = G.wallFootprint(w.pts.map((q) => [q[0], q[1], z]), w.t, w.closed);
    if (!fp) return;
    const f = G.makeFace(model, fp.pts, UP, color);
    if (!f) return;
    f.holes = fp.holes;
    model.faces.push(f);
    G.pushPull(model, f.id, hh);
  };
  band(zb + h - rh, rh, CONC); // ring balok
  const ground = opt.ground ?? true;
  let pondVol = 0;
  if (ground) {
    band(zb - 0.2, 0.2, CONC); // sloof
    const pd = pondasiOf(model);
    const P = w.pts.map(V), segs = w.closed ? P.length : P.length - 1;
    const z1 = zb - 0.2, z0 = z1 - pd.h;
    const S = siteOf(model);
    for (let i = 0; i < segs; i++) {
      const a = P[i], c = P[(i + 1) % P.length], L = a.distanceTo(c);
      const cm = { ...model, faces: [], nextId: model.nextId };
      const dd = c.clone().sub(a).setZ(0).normalize(), nn = new THREE.Vector3(-dd.y, dd.x, 0);
      // pondasi pinggir: di sisi batas tanah muka luar dibuat tegak rata batas, lebar tetap ke dalam
      const eL = Math.min(siteRay(S, a, nn), siteRay(S, c, nn)), eR = Math.min(siteRay(S, a, nn.clone().negate()), siteRay(S, c, nn.clone().negate()));
      let bLo = -pd.bot / 2, bHi = pd.bot / 2, tLo = -pd.top / 2, tHi = pd.top / 2;
      if (bHi > eL + 1e-6) { bHi = eL; bLo = eL - pd.bot; tHi = Math.min(tHi, eL); tLo = tHi - pd.top; }
      else if (-bLo > eR + 1e-6) { bLo = -eR; bHi = -eR + pd.bot; tLo = Math.max(tLo, -eR); tHi = tLo + pd.top; }
      const extA = Math.min(pd.bot / 2, siteRay(S, a, dd.clone().negate())), extB = Math.min(pd.bot / 2, siteRay(S, c, dd));
      const f = G.makeFace(cm, [[-extA, bLo, 0], [-extA, bHi, 0], [-extA, tHi, pd.h], [-extA, tLo, pd.h]], new THREE.Vector3(1, 0, 0), STONE);
      cm.faces.push(f);
      G.pushPull(cm, f.id, L + extA + extB);
      G.applyMatrix(cm, new Set(cm.faces.map((q) => q.id)), new THREE.Matrix4().makeRotationZ(Math.atan2(dd.y, dd.x)).setPosition(a.x, a.y, z0));
      model.nextId = cm.nextId;
      model.faces.push(...cm.faces);
      pondVol += ((pd.top + pd.bot) / 2) * pd.h * L;
    }
  }
  const ids = new Set(model.faces.filter((f) => f.id >= start).map((f) => f.id));
  clampToSite(model, model.faces.filter((f) => ids.has(f.id)));
  for (const f of model.faces) if (ids.has(f.id)) f.group = null;
  const sg = G.makeGroup(model, ids, 'Struktur ' + (g.name || 'Dinding'), false, null);
  model.groups[sg].struct = { colPts: cols.map(({ p, d }) => [+p.x.toFixed(4), +p.y.toFixed(4), +Math.atan2(d.y, d.x).toFixed(4)]), z: zb, wall: +wallGid, cols: cols.length, colB: b, ringH: rh, colH: +(h - rh).toFixed(3), ring: w.len, sloof: ground ? w.len : 0, pondasi: +pondVol.toFixed(3) };
  if (opt.tag != null) model.groups[sg].tag = opt.tag;
  return sg;
}

// ---------- Daftar pembesian (bar bending schedule) ----------
export const BAR_KG = { 'Ø6': 0.222, 'Ø8': 0.395, D10: 0.617, D13: 1.042 };
export function bbs(model, q = null) {
  q ||= rabQuantities(model);
  const v = (c) => (q[c] ? q[c].vol : 0);
  const rows = [];
  const add = (el, kode, bar, desc, len, waste) => {
    if (!(len > 0)) return;
    const tot = len * (1 + waste);
    rows.push({ el, kode, bar, desc, len: +tot.toFixed(2), kg: +(tot * BAR_KG[bar]).toFixed(2), batang: Math.ceil(tot / 12) });
  };
  const kolom = v('6.8.1.1'), ring = v('6.8.1.2'), sloof = v('sloof'), dak = v('18.1.1.1');
  // sengkang: keliling inti (selimut 2 cm) + 2 kait 5 cm, jarak 15 cm
  add('Kolom praktis 15/15', 'K1', 'D10', 'Tulangan utama 4D10', kolom * 4, 0.1);
  add('Kolom praktis 15/15', 'K1', 'Ø6', 'Sengkang Ø6-150 (0,54 m/bh)', (kolom / 0.15) * 0.54, 0.05);
  add('Ring balok 15/20', 'RB', 'D10', 'Tulangan utama 4D10', ring * 4, 0.1);
  add('Ring balok 15/20', 'RB', 'Ø6', 'Sengkang Ø6-150 (0,64 m/bh)', (ring / 0.15) * 0.64, 0.05);
  add('Sloof 15/20', 'S1', 'D10', 'Tulangan utama 4D10', sloof * 4, 0.1);
  add('Sloof 15/20', 'S1', 'Ø6', 'Sengkang Ø6-150 (0,64 m/bh)', (sloof / 0.15) * 0.64, 0.05);
  add('Plat lantai 12 cm', 'PL', 'D10', 'Tulangan bawah D10-150 dua arah', dak * 13.33, 0.1);
  add('Plat lantai 12 cm', 'PL', 'Ø8', 'Tulangan atas Ø8-200 dua arah', dak * 10, 0.1);
  add('Tangga beton', 'TG', 'D10', 'Tulangan pelat tangga (±80 kg/m³)', ((v('6.3.1.3') - (q._elemConc || 0)) * 80) / BAR_KG.D10, 0);
  for (const b of q._bars || []) add(b.el, b.kode, b.bar, b.desc, b.len, 0);
  const sum = {};
  for (const r of rows) {
    sum[r.bar] ||= { bar: r.bar, len: 0, kg: 0 };
    sum[r.bar].len += r.len;
    sum[r.bar].kg += r.kg;
  }
  const perBar = Object.values(sum).map((x) => ({ ...x, len: +x.len.toFixed(2), kg: +x.kg.toFixed(2), batang: Math.ceil(x.len / 12) }));
  return { rows, perBar, totalKg: +perBar.reduce((a, x) => a + x.kg, 0).toFixed(2) };
}

// Irisan model dengan bidang sembarang n·p = c -> segmen 3D (untuk potongan)
export function slicePlane(model, n, c, vis = null) {
  const N = V(n).normalize();
  const segs = [];
  for (const f of model.faces) {
    if (vis && !vis(f)) continue;
    const nf = V(f.n);
    if (Math.abs(nf.dot(N)) > 0.999) continue;
    const dist = (p) => p[0] * N.x + p[1] * N.y + p[2] * N.z - c;
    const ds = f.pts.map(dist);
    if (Math.min(...ds) > 0 || Math.max(...ds) < 0) continue;
    const d = nf.clone().cross(N).normalize();
    const hits = [];
    for (const loop of [f.pts, ...f.holes]) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length], da = dist(a), db = dist(b);
        if (da * db > 0 || da === db) continue;
        const t = da / (da - db);
        hits.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t));
      }
    }
    hits.sort((p, q) => p.dot(d) - q.dot(d));
    for (let i = 0; i + 1 < hits.length; i += 2) segs.push([hits[i], hits[i + 1]]);
  }
  return segs;
}
// Kode kusen: P1, P2.. / J1, J2.. per ukuran
export function openingSchedule(model) {
  const types = [];
  for (const [gid, g] of Object.entries(model.groups)) {
    const o = g.opening;
    if (!o) continue;
    const key = `${o.type}|${o.w}|${o.h}|${o.sill}`;
    let t = types.find((x) => x.key === key);
    if (!t) types.push((t = { key, type: o.type, w: o.w, h: o.h, sill: o.sill, n: 0, gids: [] }));
    t.n++;
    t.gids.push(+gid);
  }
  types.sort((a, b) => (a.type === b.type ? b.w * b.h - a.w * a.h : a.type === 'pintu' ? -1 : 1));
  let np = 0, nj = 0;
  for (const t of types) t.code = t.type === 'pintu' ? 'P' + ++np : 'J' + ++nj;
  return types;
}
