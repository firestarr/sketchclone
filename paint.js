// Lukis Tekstur (seperti Texture Paint di Blender): bentangan UV otomatis per objek ke satu gambar (atlas),
// lalu kuas melukis di ruang 3D — goresan diproyeksikan ke setiap potongan (chart) di sekitar titik kuas,
// sehingga goresan menyambung melewati sambungan UV. Murni data (tanpa DOM) agar bisa diuji di Node.
import * as THREE from 'three';
import * as G from './geometry.js';

const AXES = [[1, 2], [0, 2], [0, 1]]; // sumbu bidang proyeksi untuk normal dominan X, Y, Z

// Bentangkan bidang-bidang ids (koordinat lokal = inv × dunia) ke atlas size×size.
// Hasil: { s (piksel per meter), charts:[{ ax, sg, umin, vmin, ox, oy }] } dan tiap bidang mendapat f.puv & f.pchart.
export function unwrap(model, ids, inv, size = 2048, pad = 3) {
  const faces = model.faces.filter((f) => ids.has(f.id));
  const loc = (p) => new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(inv);
  const nrm = new THREE.Matrix3().getNormalMatrix(inv);
  // arah dominan normal (6 arah) per bidang
  const dir = new Map();
  for (const f of faces) {
    const n = new THREE.Vector3(...f.n).applyMatrix3(nrm).normalize().toArray();
    const ax = Math.abs(n[0]) >= Math.abs(n[1]) ? (Math.abs(n[0]) >= Math.abs(n[2]) ? 0 : 2) : Math.abs(n[1]) >= Math.abs(n[2]) ? 1 : 2;
    dir.set(f.id, ax * 2 + (n[ax] < 0 ? 1 : 0));
  }
  // potongan = bidang bertetangga (berbagi rusuk) dengan arah dominan sama
  const edgeOwners = new Map();
  for (const f of faces) {
    const L = f.pts;
    for (let i = 0; i < L.length; i++) {
      const a = G.key(L[i]), b = G.key(L[(i + 1) % L.length]), k = a < b ? a + '|' + b : b + '|' + a;
      if (!edgeOwners.has(k)) edgeOwners.set(k, []);
      edgeOwners.get(k).push(f);
    }
  }
  const parent = new Map(faces.map((f) => [f.id, f.id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const arr of edgeOwners.values()) for (let i = 1; i < arr.length; i++) {
    if (dir.get(arr[0].id) !== dir.get(arr[i].id)) continue;
    const a = find(arr[0].id), b = find(arr[i].id);
    if (a !== b) parent.set(a, b);
  }
  const groups = new Map();
  for (const f of faces) {
    const r = find(f.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(f);
  }
  const charts = [];
  for (const fs of groups.values()) {
    const d = dir.get(fs[0].id), ax = d >> 1, sg = d & 1 ? -1 : 1, [i, j] = AXES[ax];
    let umin = Infinity, vmin = Infinity, umax = -Infinity, vmax = -Infinity;
    const uv = (p) => { const q = loc(p).toArray(); return [q[i] * sg, q[j]]; };
    for (const f of fs) for (const p of f.pts) {
      const [u, v] = uv(p);
      umin = Math.min(umin, u), (vmin = Math.min(vmin, v)), (umax = Math.max(umax, u)), (vmax = Math.max(vmax, v));
    }
    charts.push({ fs, ax, sg, umin, vmin, w: umax - umin, h: vmax - vmin, uv });
  }
  // susun rak (shelf packing); kecilkan skala sampai muat
  const area = charts.reduce((t, c) => t + Math.max(c.w, 1e-4) * Math.max(c.h, 1e-4), 0);
  let s = Math.sqrt((size * size * 0.55) / Math.max(area, 1e-9));
  const order = [...charts].sort((a, b) => b.h - a.h);
  for (let tries = 0; tries < 60; tries++) {
    let x = pad, y = pad, rowH = 0, ok = true;
    for (const c of order) {
      const w = Math.ceil(c.w * s) + pad * 2, h = Math.ceil(c.h * s) + pad * 2;
      if (x + w > size) { x = pad; y += rowH; rowH = 0; }
      if (w > size || y + h > size) { ok = false; break; }
      c.ox = x + pad;
      c.oy = y + pad;
      x += w;
      rowH = Math.max(rowH, h);
    }
    if (ok) break;
    s *= 0.92;
  }
  charts.forEach((c, ci) => {
    for (const f of c.fs) {
      f.pchart = ci;
      f.puv = f.pts.map((p) => { const [u, v] = c.uv(p); return [(c.ox + (u - c.umin) * s) / size, 1 - (c.oy + (v - c.vmin) * s) / size]; });
    }
  });
  // pw/ph: ukuran potongan di atlas (piksel) — cap kuas dipotong di kotak ini agar tidak meluber ke potongan tetangga
  return { s, size, charts: charts.map(({ ax, sg, umin, vmin, ox, oy, w, h }) => ({ ax, sg, umin, vmin, ox, oy, pw: Math.ceil(w * s), ph: Math.ceil(h * s) })) };
}

// Titik lokal → piksel pada potongan c
export function chartPixel(layer, c, q) {
  const [i, j] = AXES[c.ax];
  return [c.ox + (q[i] * c.sg - c.umin) * layer.s, c.oy + (q[j] - c.vmin) * layer.s];
}

// Indeks bidang berlapis lukisan dalam koordinat lokal (pusat, jari-jari, normal) — hanya di memori, tidak disimpan.
export function paintIndex(faces, inv) {
  const nrm = new THREE.Matrix3().getNormalMatrix(inv);
  return faces.filter((f) => f.pchart != null).map((f) => {
    const P = f.pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(inv));
    const c = P.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(P.length);
    return { chart: f.pchart, c: c.toArray(), r: Math.max(...P.map((p) => p.distanceTo(c))), n: new THREE.Vector3(...f.n).applyMatrix3(nrm).normalize().toArray() };
  });
}
// Potongan-potongan yang perlu dicap untuk kuas di titik lokal q dengan jari-jari r (m) dan normal lokal n:
// hanya bidang dekat yang menghadap searah (agar sisi belakang benda tipis tidak ikut terlukis).
export function stampTargets(layer, index, q, r, n) {
  const out = new Map();
  for (const e of index) {
    const lim = r * 1.2 + e.r;
    if ((e.c[0] - q[0]) ** 2 + (e.c[1] - q[1]) ** 2 + (e.c[2] - q[2]) ** 2 > lim * lim) continue;
    if (n && e.n[0] * n[0] + e.n[1] * n[1] + e.n[2] * n[2] < 0.05) continue;
    if (!out.has(e.chart)) out.set(e.chart, chartPixel(layer, layer.charts[e.chart], q));
  }
  return out;
}
