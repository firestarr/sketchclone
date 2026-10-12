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
  const zs = face.pts.map((p) => p[2]);
  const zmin = Math.min(...zs), zmax = Math.max(...zs);
  const along = face.pts.map((p) => V(p).sub(point).dot(u));
  const amin = Math.min(...along), amax = Math.max(...along);
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
    lbox(m, 0, fw, ly, 0.01, w - 2 * fw, lt, h - fw - 0.01, LEAF);
    lbox(m, 0, w - fw - 0.12, ly - 0.03, 1.0, 0.05, 0.03, 0.04, HANDLE);
    lbox(m, 0, w - fw - 0.12, ly + lt, 1.0, 0.05, 0.03, 0.04, HANDLE);
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
  model.groups[gid].opening = { type, w: +w.toFixed(3), h: +h.toFixed(3), sill: +fr.sill.toFixed(3), t: +t.toFixed(3) };
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

// ---------- RAB ----------
const ahspBy = Object.fromEntries(AHSP.map((a) => [a.code, a]));
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
  const pond = { w: 0.8, d: 0.8, sand: 0.05, stone: 0.315, ...(opt.pondasi || {}) };
  for (const [gid, g] of Object.entries(model.groups)) {
    if (g.wall) {
      const sids = new Set(model.faces.filter((f) => (f.group ?? null) === +gid && f.solid != null).map((f) => f.solid));
      let vol = 0;
      for (const s of sids) vol += solidVolume(model, s);
      const area = vol / g.wall.t;
      const L = g.wall.len;
      add('7.1.1.1', area);
      add('7.2.1.1', area * 2);
      add('7.2.1.2', area * 2);
      // dinding keliling tertutup: satu sisi dalam + satu sisi luar; sekat: dua sisi dalam
      add('7.3.1.1', g.wall.closed ? area : area * 2);
      if (g.wall.closed) add('7.3.1.2', area);
      add('6.8.1.2', L);
      const pts = g.wall.pts;
      let cols = pts.length;
      for (let i = 0; i < pts.length - (g.wall.closed ? 0 : 1); i++) cols += Math.floor(V(pts[i]).distanceTo(V(pts[(i + 1) % pts.length])) / 3);
      add('6.8.1.1', cols * g.wall.h);
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
      if (Math.abs(r.z - z0) < 0.1) {
        add('6.9.1.1', r.area);
        add('6.2.1.1', r.area * 0.1);
      } else add('18.1.1.1', r.area);
    }
    if (g.roof) {
      let a = 0;
      for (const f of model.faces) if ((f.group ?? null) === +gid && f.n[2] > 0.1) a += G.faceArea(f);
      add('7.6.1.1', a);
      add('14.2.1.1', a);
    }
  }
  return q;
}

const ORDER = ['Pekerjaan Tanah', 'Pekerjaan Pondasi', 'Pekerjaan Beton', 'Cor Dak', 'Pekerjaan Dinding', 'Pekerjaan Plester', 'Pekerjaan Kayu', 'Pekerjaan Lantai', 'Pekerjaan Plafon', 'Baja Ringan', 'Pekerjaan Atap', 'Pekerjaan Cat'];

export function rabRows(model, opt = {}) {
  const q = rabQuantities(model, opt);
  const prices = (model.rab && model.rab.prices) || {};
  const rows = [];
  for (const it of Object.values(q)) {
    const src = it.code === 'sloof' ? { ...ahspBy['6.8.1.2'], name: 'Sloof beton 15/20 cm' } : ahspBy[it.code];
    if (!src) continue;
    const vol = Math.round(it.vol * 100) / 100;
    const price = prices[it.code] ?? src.price;
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
