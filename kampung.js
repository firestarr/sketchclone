// Komponen kampung Jawa (Indonesia) — dibuat untuk game "Malam Jumat di Kampung Mati" dan bisa dipakai di SketchClone.
// Rumah kampung modular (dinding bata plester / papan kayu / setengah-setengah, jendela kusen + roster, pintu panel,
// pintu papan geser, pintu PVC kamar mandi, lantai teraso/keramik/semen, plafon eternit/triplek, atap genteng tanah liat
// bergelombang: bidang miring, bubungan, gevel, ujung limasan; pondasi batu kali, umpak, tiang teras, kanopi seng),
// pos ronda, warung, masjid kecil beratap tumpang, tempat wudu, menara pengeras suara, tiang listrik beton + lengan,
// lampu jalan, papan nama kampung, pagar (bambu anyam, bambu belah, tembok bata, besi, gerbang), parit beton,
// jembatan plat, gorong-gorong, gerobak dorong kayu.
//
// Setiap bidang diberi f.mat (kunci bahan PBR untuk ekspor game: 'genteng', 'plester@e3d6b8', ...) selain warna & tekstur
// bawaan SketchClone untuk tampilan di aplikasi. Koordinat lokal: alas z = 0; depan menghadap -Y.
// Catatan sumbu: di dalam berkas ini fungsi bantu memakai sumbu X "game" (X ke kanan bila dilihat dari depan = -X
// SketchClone), sehingga dinding modular memanjang ke +X di Godot setelah diekspor (sk_to_glb.mjs: (x,y,z)->(-x,z,y)).
import * as THREE from 'three';
import * as G from './geometry.js';
import { LIBRARY } from './library.js';

// ------------------------------------------------------------------ bahan -> warna tampilan SketchClone
const DISP = {
  plester: ['#e3dccb'], plester_lumut: ['#8f8c74'], cat: ['#ecebe4'], cat_kilap: ['#e8e8e4'], bata: ['#a5533a', 'b:bata'],
  beton: ['#9c9a95', 'b:beton'], beton_lumut: ['#7a7c68', 'b:beton'], papan_kayu: ['#6e5236', 'b:kayu'], kayu: ['#7a5534', 'b:kayu'],
  kayu_cat: ['#7d8f9a'], papan_lantai: ['#6a4c32', 'b:kayu'], teraso: ['#d8d4cb', 'b:ubin'], keramik: ['#e2e2dc', 'b:ubin'],
  genteng: ['#a8553a', 'b:atap'], seng: ['#9aa0a3'], besi_karat: ['#6e5a4a'], logam: ['#9da3a6'], anyaman_bambu: ['#c2a66e'],
  bambu: ['#7c8a3a'], bambu_kering: ['#b59e62'], batu: ['#77736a', 'b:batu'], kaca: ['#a9cbe6'], kaca_gelap: ['#2a3236'],
  plastik: ['#d8d8d0'], karet: ['#222222'], kabel: ['#111111'], lampu_neon: ['#f4fbff'], lampu_natrium: ['#ffb060'],
  lampu_mati: ['#dddddd'], papan_nama: ['#2a6a44'], tanah: ['#5a4632', 'b:rumput'], genangan: ['#2a3a40', 'b:air'],
  kaca_kusam: ['#e8e8e2'], reflektor: ['#cfd4d6'], keramik_dinding: ['#e8eef0', 'b:ubin'],
};
function dispOf(mat) {
  const [base, tint] = mat.split('@');
  const d = DISP[base] || ['#bbbbbb'];
  return { color: tint ? '#' + tint : d[0], tex: d[1] || null };
}

// ------------------------------------------------------------------ primitif (koordinat "game": x kanan, y dalam (+), z atas)
const P = (p) => [-p[0], p[1], p[2]];
const H = (n) => new THREE.Vector3(-n[0], n[1], n[2]);
function quad(m, pts, mat, hint, o = {}) {
  const d = dispOf(mat);
  const f = G.makeFace(m, pts.map(P), hint ? H(hint) : null, d.color);
  if (!f) return null;
  f.mat = mat;
  if (d.tex) { f.tex = d.tex; f.texScale = 1; }
  if (o.soft) f.soft = true;
  if (o.part) f.part = o.part;
  if (o.finish) f.finish = o.finish;
  if (o.uvFn) f.uvFn = (q) => o.uvFn([-q[0], q[1], q[2]]);   // uvFn menerima koordinat game
  m.faces.push(f);
  return f;
}
// balok sejajar sumbu; o.skip: daftar sisi yang dilewati ('x0','x1','y0','y1','z0','z1'); o.mats: bahan per sisi
function box(m, x0, y0, z0, x1, y1, z1, mat, o = {}) {
  if (x0 > x1) [x0, x1] = [x1, x0];
  if (y0 > y1) [y0, y1] = [y1, y0];
  if (z0 > z1) [z0, z1] = [z1, z0];
  const sk = new Set(o.skip || []), mm = o.mats || {};
  const S = (k, pts, n) => { if (!sk.has(k)) quad(m, pts, mm[k] || mat, n, o); };
  S('z0', [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1]);
  S('z1', [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
  S('y0', [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);
  S('y1', [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0]);
  S('x0', [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], [-1, 0, 0]);
  S('x1', [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0]);
}
// balok bebas: pusat c, ukuran s, diputar (rz di sumbu Z lalu rx di X lokal lalu ry)
function obox(m, c, s, mat, rot = {}, o = {}) {
  const M = new THREE.Matrix4().makeTranslation(c[0], c[1], c[2])
    .multiply(new THREE.Matrix4().makeRotationZ(rot.z || 0))
    .multiply(new THREE.Matrix4().makeRotationY(rot.y || 0))
    .multiply(new THREE.Matrix4().makeRotationX(rot.x || 0));
  const v = (x, y, z) => { const q = new THREE.Vector3(x * s[0] / 2, y * s[1] / 2, z * s[2] / 2).applyMatrix4(M); return [q.x, q.y, q.z]; };
  const n = (x, y, z) => { const q = new THREE.Vector3(x, y, z).transformDirection(M); return [q.x, q.y, q.z]; };
  quad(m, [v(-1, -1, -1), v(1, -1, -1), v(1, 1, -1), v(-1, 1, -1)], mat, n(0, 0, -1), o);
  quad(m, [v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)], mat, n(0, 0, 1), o);
  quad(m, [v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1)], mat, n(0, -1, 0), o);
  quad(m, [v(-1, 1, -1), v(1, 1, -1), v(1, 1, 1), v(-1, 1, 1)], mat, n(0, 1, 0), o);
  quad(m, [v(-1, -1, -1), v(-1, 1, -1), v(-1, 1, 1), v(-1, -1, 1)], mat, n(-1, 0, 0), o);
  quad(m, [v(1, -1, -1), v(1, 1, -1), v(1, 1, 1), v(1, -1, 1)], mat, n(1, 0, 0), o);
}
// balok dari titik a ke b (penampang w x h, sumbu "atas" penampang mendekati up)
function beam(m, a, b, w, h, mat, o = {}) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const t = B.clone().sub(A), L = t.length();
  t.normalize();
  const up = Math.abs(t.z) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const x = new THREE.Vector3().crossVectors(up, t).normalize(), z = new THREE.Vector3().crossVectors(t, x);
  const c = (s, u, v) => A.clone().addScaledVector(t, s).addScaledVector(x, u).addScaledVector(z, v).toArray();
  const r = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  for (let k = 0; k < 4; k++) {
    const [u0, v0] = r[k], [u1, v1] = r[(k + 1) % 4];
    const nn = x.clone().multiplyScalar((u0 + u1) / 2).addScaledVector(z, (v0 + v1) / 2).normalize().toArray();
    quad(m, [c(0, u0, v0), c(0, u1, v1), c(L, u1, v1), c(L, u0, v0)], mat, nn, o);
  }
  if (!o.nocap) {
    quad(m, r.map(([u, v]) => c(0, u, v)), mat, t.clone().negate().toArray(), o);
    quad(m, r.map(([u, v]) => c(L, u, v)), mat, t.toArray(), o);
  }
}
// silinder dari a ke b
function cyl(m, a, b, r, mat, seg = 10, o = {}) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const t = B.clone().sub(A);
  const L = t.length();
  t.normalize();
  const ref = Math.abs(t.z) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const x = new THREE.Vector3().crossVectors(ref, t).normalize(), y = new THREE.Vector3().crossVectors(t, x);
  const r1 = o.r1 ?? r;
  const ring = (s, rr) => [...Array(seg)].map((_, k) => { const an = (k / seg) * Math.PI * 2; return A.clone().addScaledVector(t, s).addScaledVector(x, Math.cos(an) * rr).addScaledVector(y, Math.sin(an) * rr).toArray(); });
  const R0 = ring(0, r), R1 = ring(L, r1);
  for (let k = 0; k < seg; k++) {
    const k2 = (k + 1) % seg, an = ((k + 0.5) / seg) * Math.PI * 2;
    const nn = x.clone().multiplyScalar(Math.cos(an)).addScaledVector(y, Math.sin(an)).toArray();
    quad(m, [R0[k], R0[k2], R1[k2], R1[k]], mat, nn, { ...o, soft: true });
  }
  if (!o.nocap) {
    quad(m, R0.slice().reverse(), mat, t.clone().negate().toArray(), o);
    quad(m, R1, mat, t.toArray(), o);
  }
}
// permukaan grid (s,t) -> titik; dipakai untuk genteng bergelombang, seng, kain
function grid(m, ns, nt, fn, mat, o = {}) {
  const pts = [];
  for (let j = 0; j <= nt; j++) { const row = []; for (let i = 0; i <= ns; i++) row.push(fn(i / ns, j / nt)); pts.push(row); }
  for (let j = 0; j < nt; j++) for (let i = 0; i < ns; i++) {
    const q = [pts[j][i], pts[j][i + 1], pts[j + 1][i + 1], pts[j + 1][i]];
    if (q.some((p) => !p)) continue;
    const a = new THREE.Vector3(...q[0]), b = new THREE.Vector3(...q[1]), c = new THREE.Vector3(...q[2]);
    const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    if (n.lengthSq() < 1e-14) continue;
    const hint = o.hint ? o.hint : (o.flip ? n.negate().toArray() : n.toArray());
    quad(m, [q[0], q[1], q[2]], mat, hint, { ...o, soft: o.soft !== false });
    quad(m, [q[0], q[2], q[3]], mat, hint, { ...o, soft: o.soft !== false });
  }
}
const rng = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

// ------------------------------------------------------------------ konstanta rumah
export const RUMAH = { H: 3.0, T: 0.15, sill: 0.9, head: 2.1, roofPitch: 30, halfSpan: 3.0, overhang: 0.7 };
const CAT_LUAR = { A: 'plester@e6dcc2', B: 'papan_kayu', C: 'plester@d9e0cf' };
const CAT_DALAM = 'cat@ece8dc';
const KUSEN = { A: 'kayu_cat@5d7f8c', B: 'kayu_cat@6f8f5a', C: 'kayu_cat@8a5a44' };

// pita bawah (plin) & tubuh plester satu sisi dinding, dengan lubang [x0,x1,z0,z1]
function plasterFace(m, L, z0, z1, y, side, mat, holes, plinMat) {
  // pecah menjadi kolom-kolom di antara lubang (balok tipis menempel bidang dinding)
  const xs = new Set([0, L]);
  for (const h of holes) { xs.add(h[0]); xs.add(h[1]); }
  const X = [...xs].sort((a, b) => a - b);
  const n = [0, side, 0];
  for (let i = 0; i < X.length - 1; i++) {
    const xa = X[i], xb = X[i + 1];
    const zs = new Set([z0, z1]);
    const cover = holes.filter((h) => h[0] < xb - 1e-6 && h[1] > xa + 1e-6);
    for (const h of cover) { zs.add(Math.max(z0, Math.min(z1, h[2]))); zs.add(Math.max(z0, Math.min(z1, h[3]))); }
    const Z = [...zs].sort((a, b) => a - b);
    for (let k = 0; k < Z.length - 1; k++) {
      const za = Z[k], zb = Z[k + 1];
      if (cover.some((h) => za >= h[2] - 1e-6 && zb <= h[3] + 1e-6)) continue;
      if (plinMat && za < 0.35 - 1e-6) {
        const zc = Math.min(zb, 0.35);
        quad(m, [[xa, y, za], [xb, y, za], [xb, y, zc], [xa, y, zc]], plinMat, n);
        if (zb > zc + 1e-6) quad(m, [[xa, y, zc], [xb, y, zc], [xb, y, zb], [xa, y, zb]], mat, n);
      } else quad(m, [[xa, y, za], [xb, y, za], [xb, y, zb], [xa, y, zb]], mat, n);
    }
  }
}
// kusen kayu di lubang (x0..x1, z0..z1), tebal dinding T: kusen 0,06 x 0,12 di tengah tebal + bidang pipi lubang (reveal)
function kusen(m, x0, x1, z0, z1, T, mat, o = {}) {
  const k = 0.06, d = 0.11;
  box(m, x0, -d / 2, z0, x0 + k, d / 2, z1, mat);
  box(m, x1 - k, -d / 2, z0, x1, d / 2, z1, mat);
  box(m, x0, -d / 2, z1 - k, x1, d / 2, z1, mat);
  if (o.bottom) box(m, x0, -d / 2, z0, x1, d / 2, z0 + k, mat);
  if (o.mid) box(m, (x0 + x1) / 2 - k / 2, -d / 2, z0, (x0 + x1) / 2 + k / 2, d / 2, z1, mat);
  if (o.transom) box(m, x0, -d / 2, o.transom - k / 2, x1, d / 2, o.transom + k / 2, mat);
}
// pipi lubang (tebal dinding) – bidang plester di sisi dalam lubang
function reveal(m, x0, x1, z0, z1, T, mat, bottom = true) {
  quad(m, [[x0, -T / 2, z0], [x0, T / 2, z0], [x0, T / 2, z1], [x0, -T / 2, z1]], mat, [1, 0, 0]);
  quad(m, [[x1, -T / 2, z0], [x1, T / 2, z0], [x1, T / 2, z1], [x1, -T / 2, z1]], mat, [-1, 0, 0]);
  quad(m, [[x0, -T / 2, z1], [x1, -T / 2, z1], [x1, T / 2, z1], [x0, T / 2, z1]], mat, [0, 0, -1]);
  if (bottom) quad(m, [[x0, -T / 2, z0], [x1, -T / 2, z0], [x1, T / 2, z0], [x0, T / 2, z0]], mat, [0, 0, 1]);
}
// roster beton (lubang angin) x0..x1 di ketinggian z0..z1: kisi kotak berlubang tembus
function roster(m, x0, x1, z0, z1, T, mat) {
  const n = Math.max(2, Math.round((x1 - x0) / 0.2)), w = (x1 - x0) / n, bar = 0.025;
  box(m, x0, -T / 2, z0, x1, T / 2, z0 + bar, mat);
  box(m, x0, -T / 2, z1 - bar, x1, T / 2, z1, mat);
  for (let i = 0; i <= n; i++) { const x = x0 + i * w; box(m, Math.max(x0, x - bar / 2), -T / 2, z0 + bar, Math.min(x1, x + bar / 2), T / 2, z1 - bar, mat); }
  // sirip diagonal di tiap sel (pola roster khas)
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * w, cz = (z0 + z1) / 2;
    obox(m, [cx, 0, cz], [0.02, T * 0.9, (z1 - z0) * 0.9], mat, { y: Math.PI / 4 });
  }
}
// daun jendela kaca berbingkai kayu (tertutup), kaca sebagai bagian terpisah 'KACA_JENDELA'
function sash(m, x0, x1, z0, z1, mat, o = {}) {
  const f = 0.045, d = 0.035, y = o.y ?? 0;
  box(m, x0, y - d / 2, z0, x0 + f, y + d / 2, z1, mat);
  box(m, x1 - f, y - d / 2, z0, x1, y + d / 2, z1, mat);
  box(m, x0 + f, y - d / 2, z0, x1 - f, y + d / 2, z0 + f * 1.4, mat);
  box(m, x0 + f, y - d / 2, z1 - f, x1 - f, y + d / 2, z1, mat);
  if (o.rail) box(m, x0 + f, y - d / 2, o.rail - f / 2, x1 - f, y + d / 2, o.rail + f / 2, mat);
  quad(m, [[x0 + f, y, z0 + f * 1.4], [x1 - f, y, z0 + f * 1.4], [x1 - f, y, z1 - f], [x0 + f, y, z1 - f]], o.glass || 'kaca', [0, -1, 0], { part: o.glassPart || 'KACA_JENDELA' });
  // grendel & engsel
  box(m, x1 - f - 0.005, y - d / 2 - 0.012, (z0 + z1) / 2 - 0.05, x1 - f + 0.01, y - d / 2, (z0 + z1) / 2 + 0.05, 'logam@9a9070');
}
// teralis besi (part 'TERALIS') di sisi dalam
function teralis(m, x0, x1, z0, z1, y) {
  const r = 0.007, n = Math.round((x1 - x0) / 0.12);
  for (let i = 1; i < n; i++) cyl(m, [x0 + (i * (x1 - x0)) / n, y, z0], [x0 + (i * (x1 - x0)) / n, y, z1], r, 'besi_karat', 6, { part: 'TERALIS', nocap: true });
  for (const z of [z0 + 0.02, (z0 + z1) / 2, z1 - 0.02]) beam(m, [x0, y, z], [x1, y, z], 0.03, 0.006, 'besi_karat', { part: 'TERALIS' });
}

// ------------------------------------------------------------------ dinding modular
// style A: bata plester (luar cat krem, plin lembab), B: papan kayu di atas plin bata, C: setengah bata plester (bawah) + papan
// open: null | 'window' | 'door' ; L panjang (m)
export function buildDinding(m, o = {}) {
  const L = o.L ?? 2.0, Hh = RUMAH.H, T = RUMAH.T, st = o.style || 'A';
  const outer = o.outer || CAT_LUAR[st], inner = o.inner || CAT_DALAM, km = o.kusen || KUSEN[st];
  const holes = [];
  let win = null, door = null;
  if (o.open === 'window') { const w = o.winW ?? 1.1; win = [(L - w) / 2, (L + w) / 2, RUMAH.sill, RUMAH.head]; holes.push(win); }
  if (o.open === 'door') { const w = o.doorW ?? 0.92; const x0 = o.doorX ?? (L - w) / 2; door = [x0, x0 + w, 0, RUMAH.head]; holes.push(door); }
  // roster di atas lubang (tembus)
  const vent = [];
  for (const h of holes) { vent.push([h[0], h[1], RUMAH.head + 0.08, RUMAH.head + 0.3]); }
  const allHoles = holes.concat(vent);
  const brickTop = st === 'A' ? Hh : st === 'B' ? 0.3 : RUMAH.sill;
  // --- bagian bata plester (z 0..brickTop)
  const clipHoles = (zTop, zBot = 0) => allHoles.map((h) => [h[0], h[1], Math.max(zBot, h[2]), Math.min(zTop, h[3])]).filter((h) => h[3] > h[2] + 1e-6);
  const plin = 'plester_lumut@b8b29a';
  plasterFace(m, L, 0, brickTop, -T / 2, -1, st === 'B' ? 'plester@b9b3a0' : outer, clipHoles(brickTop), plin);
  plasterFace(m, L, 0, brickTop, T / 2, 1, st === 'A' ? inner : 'plester@cfc8b6', clipHoles(brickTop), null);
  // ujung dinding & atas
  quad(m, [[0, -T / 2, 0], [0, T / 2, 0], [0, T / 2, brickTop], [0, -T / 2, brickTop]], 'plester@d8d0bc', [-1, 0, 0]);
  quad(m, [[L, -T / 2, 0], [L, T / 2, 0], [L, T / 2, brickTop], [L, -T / 2, brickTop]], 'plester@d8d0bc', [1, 0, 0]);
  if (st === 'A') quad(m, [[0, -T / 2, Hh], [L, -T / 2, Hh], [L, T / 2, Hh], [0, T / 2, Hh]], 'beton', [0, 0, 1]);
  else {
    // balok kayu (sloof/ambang) di atas bata
    let bx = 0;
    for (const [a, b] of holes.filter((h) => h[2] < brickTop + 0.06).map((h) => [h[0], h[1]]).sort((p, q) => p[0] - q[0]).concat([[L, L]])) {
      if (a - bx > 1e-3) box(m, bx, -T / 2, brickTop, a, T / 2, brickTop + 0.06, 'kayu');
      bx = b;
    }
  }
  // plin menonjol 1 cm (bagian bawah sisi luar) + garis air
  {
    const cuts = holes.filter((h) => h[2] < 0.36).map((h) => [h[0], h[1]]).sort((a, b) => a[0] - b[0]);
    let x = 0;
    for (const [a, b] of cuts.concat([[L, L]])) {
      if (a - x > 1e-3) box(m, x, -T / 2 - 0.012, 0, a, -T / 2, 0.36, plin, { skip: ['y1', 'z0'] });
      x = b;
    }
  }
  // --- bagian papan kayu (B, C)
  if (st !== 'A') {
    const z0 = brickTop + 0.06, bh = 0.2, lap = 0.018;
    // tiang (stud) & balok atas di sisi dalam
    for (const x of [0.04, L / 2, L - 0.04]) {
      if (holes.some((h) => x > h[0] - 0.05 && x < h[1] + 0.05)) continue;
      box(m, x - 0.04, -0.03, z0, x + 0.04, 0.06, Hh, 'kayu');
    }
    for (const h of holes) {
      box(m, h[0] - 0.08, -0.03, z0, h[0], 0.06, Hh, 'kayu');
      box(m, h[1], -0.03, z0, h[1] + 0.08, 0.06, Hh, 'kayu');
    }
    box(m, 0, -0.03, Hh - 0.08, L, 0.06, Hh, 'kayu');
    // papan tumpang (lap siding): tiap papan miring sedikit, tepi bawah menonjol
    const n = Math.ceil((Hh - z0) / bh);
    for (let i = 0; i < n; i++) {
      const za = z0 + i * bh, zb = Math.min(Hh, za + bh + 0.02);
      const segs = [];
      let xs = [0];
      for (const h of allHoles) if (za < h[3] && zb > h[2]) xs.push(h[0], h[1]);
      xs.push(L);
      xs.sort((a, b) => a - b);
      for (let k = 0; k < xs.length - 1; k += 2) segs.push([xs[k], xs[k + 1]]);
      for (const [xa, xb] of segs) {
        if (xb - xa < 0.01) continue;
        const yb = -0.03 - lap, yt = -0.03 - 0.004; // bawah lebih menonjol
        quad(m, [[xa, yb, za], [xb, yb, za], [xb, yt, zb], [xa, yt, zb]], 'papan_kayu', [0, -1, -0.08]);
        quad(m, [[xa, yb, za], [xb, yb, za], [xb, -0.03, za], [xa, -0.03, za]], 'papan_kayu', [0, 0, -1]);
        quad(m, [[xa, -0.03, za], [xb, -0.03, za], [xb, -0.03, zb], [xa, -0.03, zb]], 'papan_kayu@a08a70', [0, 1, 0]);
        quad(m, [[xa, yb, za], [xa, -0.03, za], [xa, -0.03, zb], [xa, yt, zb]], 'papan_kayu', [-1, 0, 0]);
        quad(m, [[xb, yb, za], [xb, -0.03, za], [xb, -0.03, zb], [xb, yt, zb]], 'papan_kayu', [1, 0, 0]);
      }
    }
  }
  // --- lubang: pipi, kusen, roster, daun jendela
  for (const h of holes) {
    const top = h[3];
    if (st === 'A' || h[2] < brickTop) reveal(m, h[0], h[1], h[2], Math.min(top, st === 'A' ? top : brickTop), T, 'plester@d8d0bc', h[2] > 0);
    kusen(m, h[0], h[1], h[2] > 0 ? h[2] : 0, RUMAH.head + 0.3, T, km, { bottom: h[2] > 0, transom: RUMAH.head + 0.03, mid: !!win && h === win });
    roster(m, h[0] + 0.06, h[1] - 0.06, RUMAH.head + 0.06, RUMAH.head + 0.3 - 0.06, 0.1, 'beton@c9c4b8');
    // ambang beton di bawah jendela (luar)
    if (h[2] > 0) box(m, h[0] - 0.05, -T / 2 - 0.05, h[2] - 0.05, h[1] + 0.05, -T / 2 + 0.02, h[2], 'beton@b0aca2');
  }
  if (win) {
    const mid = (win[0] + win[1]) / 2;
    sash(m, win[0] + 0.06, mid - 0.03, win[2] + 0.06, RUMAH.head, km, { y: -0.035, rail: (win[2] + RUMAH.head) / 2 + 0.1 });
    sash(m, mid + 0.03, win[1] - 0.06, win[2] + 0.06, RUMAH.head, km, { y: -0.035, rail: (win[2] + RUMAH.head) / 2 + 0.1 });
    if (o.teralis !== false) teralis(m, win[0] + 0.06, win[1] - 0.06, win[2] + 0.06, RUMAH.head, 0.045);
    // tirai lusuh di balik kaca (memberi kedalaman) — bagian 'TIRAI' bisa disembunyikan
    if (o.tirai !== false) grid(m, 10, 1, (s, t) => [win[0] + 0.1 + s * (mid - win[0] - 0.12), 0.06 + 0.012 * Math.sin(s * 22), win[2] + 0.15 + t * (RUMAH.head - win[2] - 0.2)], 'kain_lusuh', { hint: [0, -1, 0], part: 'TIRAI', uvFn: (q) => [(q[0] - win[0]) / (mid - win[0]), 0.35 + 0.6 * (q[2] - win[2]) / (RUMAH.head - win[2])] });
  }
}

// daun pintu panel (engsel di x=0, membuka ke +X), tebal 0,035
export function buildDaunPintu(m, o = {}) {
  const W = o.W ?? 0.8, Hd = o.H ?? 2.08, d = 0.035, mat = o.mat || 'kayu_cat@5d7f8c', f = 0.1;
  const y0 = -d / 2, y1 = d / 2;
  // rangka: stile & rail
  box(m, 0, y0, 0, f, y1, Hd, mat);
  box(m, W - f, y0, 0, W, y1, Hd, mat);
  box(m, f, y0, Hd - f, W - f, y1, Hd, mat);
  box(m, f, y0, 0, W - f, y1, 0.2, mat);
  box(m, f, y0, 0.95, W - f, y1, 1.08, mat);
  box(m, f, y0, 1.55, W - f, y1, 1.62, mat);
  box(m, W / 2 - 0.035, y0, 0.2, W / 2 + 0.035, y1, Hd - f, mat);
  // panel cekung (lebih tipis) + bingkai profil
  for (const [za, zb] of [[0.2, 0.95], [1.08, 1.55], [1.62, Hd - f]]) for (const [xa, xb] of [[f, W / 2 - 0.035], [W / 2 + 0.035, W - f]]) {
    box(m, xa, -0.008, za, xb, 0.008, zb, mat, { skip: ['x0', 'x1', 'z0', 'z1'] });
    for (const s of [-1, 1]) {
      const yy = s * 0.008;
      beam(m, [xa + 0.012, yy + s * 0.004, za + 0.012], [xb - 0.012, yy + s * 0.004, za + 0.012], 0.02, 0.012, mat);
      beam(m, [xa + 0.012, yy + s * 0.004, zb - 0.012], [xb - 0.012, yy + s * 0.004, zb - 0.012], 0.02, 0.012, mat);
    }
  }
  // gagang, plat kunci, engsel
  for (const s of [-1, 1]) {
    box(m, W - 0.1, s * (d / 2) - (s < 0 ? 0.004 : 0), 0.9, W - 0.055, s * (d / 2) + (s > 0 ? 0.004 : 0), 1.12, 'logam@b8a878');
    beam(m, [W - 0.08, s * (d / 2 + 0.045), 1.0], [W - 0.17, s * (d / 2 + 0.045), 1.0], 0.016, 0.016, 'logam@c9b88a');
    beam(m, [W - 0.08, s * (d / 2), 1.0], [W - 0.08, s * (d / 2 + 0.05), 1.0], 0.016, 0.016, 'logam@c9b88a');
  }
  for (const z of [0.25, Hd - 0.3]) cyl(m, [0, -d / 2 - 0.006, z], [0, -d / 2 - 0.006, z + 0.1], 0.008, 'logam@6a6a60', 8);
}
// pintu papan (dapur/gudang) geser di rel atas
export function buildPintuGeser(m, o = {}) {
  const W = o.W ?? 0.95, Hd = 2.05;
  const n = 6, pw = W / n;
  const r = rng(77);
  for (let i = 0; i < n; i++) {
    const t = 0.02 + r() * 0.004;
    box(m, i * pw + 0.002, -t / 2, 0.01, (i + 1) * pw - 0.002, t / 2, Hd - 0.03 * r(), 'papan_kayu@c8b8a0');
  }
  for (const z of [0.25, 1.0, 1.75]) box(m, 0.03, -0.045, z, W - 0.03, -0.012, z + 0.12, 'papan_kayu@b0a088');
  obox(m, [W / 2, -0.028, 0.62], [Math.hypot(W - 0.12, 0.62), 0.033, 0.1], 'papan_kayu@b0a088', { y: -Math.atan2(0.62, W - 0.12) });
  // rel & roda
  box(m, -0.1, -0.06, Hd + 0.02, W + 0.95, -0.03, Hd + 0.06, 'besi_karat');
  for (const x of [0.15, W - 0.15]) cyl(m, [x, -0.045, Hd + 0.0], [x, -0.03, Hd + 0.0], 0.035, 'besi_karat', 10);
  box(m, W - 0.12, -0.06, 1.0, W - 0.07, -0.025, 1.15, 'besi_karat');
}
// pintu kamar mandi PVC (bergaris mendatar + kisi angin bawah)
export function buildPintuKM(m, o = {}) {
  const W = o.W ?? 0.7, Hd = 1.95, d = 0.03, mat = o.mat || 'plastik@a9c6d4';
  box(m, 0, -d / 2, 0, W, d / 2, Hd, mat, { skip: ['y0', 'y1'] });
  const n = 26;
  for (let i = 0; i < n; i++) {
    const za = 0.3 + (i * (Hd - 0.42)) / n, zb = za + (Hd - 0.42) / n;
    for (const s of [-1, 1]) {
      const y = s * d / 2;
      quad(m, [[0.06, y, za], [W - 0.06, y, za], [W - 0.06, y + s * 0.004, (za + zb) / 2], [0.06, y + s * 0.004, (za + zb) / 2]], mat, [0, s, -0.3]);
      quad(m, [[0.06, y + s * 0.004, (za + zb) / 2], [W - 0.06, y + s * 0.004, (za + zb) / 2], [W - 0.06, y, zb], [0.06, y, zb]], mat, [0, s, 0.3]);
    }
  }
  for (const s of [-1, 1]) {
    const y = s * d / 2;
    quad(m, [[0, y, 0], [W, y, 0], [W, y, 0.3], [0, y, 0.3]], mat, [0, s, 0]);
    quad(m, [[0, y, Hd - 0.12], [W, y, Hd - 0.12], [W, y, Hd], [0, y, Hd]], mat, [0, s, 0]);
    quad(m, [[0, y, 0.3], [0.06, y, 0.3], [0.06, y, Hd - 0.12], [0, y, Hd - 0.12]], mat, [0, s, 0]);
    quad(m, [[W - 0.06, y, 0.3], [W, y, 0.3], [W, y, Hd - 0.12], [W - 0.06, y, Hd - 0.12]], mat, [0, s, 0]);
  }
  // kisi angin
  for (let i = 0; i < 5; i++) obox(m, [W / 2, -d / 2 - 0.004, 0.08 + i * 0.035], [W * 0.6, 0.006, 0.025], 'plastik@8aa6b4', { x: 0.6 });
  box(m, W - 0.09, -d / 2 - 0.02, 0.95, W - 0.05, -d / 2, 1.0, 'logam@c0c0c0');
  box(m, W - 0.09, d / 2, 0.95, W - 0.05, d / 2 + 0.02, 1.0, 'logam@c0c0c0');
  // noda kerak bawah
  quad(m, [[0.02, -d / 2 - 0.001, 0.0], [W - 0.02, -d / 2 - 0.001, 0.0], [W - 0.02, -d / 2 - 0.001, 0.12], [0.02, -d / 2 - 0.001, 0.12]], 'plester_lumut@9a9a88', [0, -1, 0]);
}

// lantai 2 x 2 m, permukaan atas z = 0 (pelat tebal 0,12 ke bawah)
export function buildLantai(m, o = {}) {
  const W = o.W ?? 2, D = o.D ?? 2, mat = o.mat || 'teraso';
  box(m, 0, 0, -0.12, W, D, 0, 'beton', { mats: { z1: mat } });
}
// plafon 2 x 2 m: lembaran (eternit/triplek) di z = 0 menghadap bawah + list kayu grid 0,6 m (atau 1,2 m untuk triplek)
export function buildPlafon(m, o = {}) {
  const W = o.W ?? 2, D = o.D ?? 2, mat = o.mat || 'cat@eeeae0', step = o.step ?? 0.5;
  quad(m, [[0, 0, 0], [W, 0, 0], [W, D, 0], [0, D, 0]], mat, [0, 0, -1]);
  quad(m, [[0, 0, 0.01], [W, 0, 0.01], [W, D, 0.01], [0, D, 0.01]], 'kayu', [0, 0, 1]);
  const lm = o.list || 'kayu_cat@d8d2c4';
  for (let x = 0; x <= W + 1e-6; x += step) box(m, Math.max(0, x - 0.02), 0, -0.018, Math.min(W, x + 0.02), D, 0, lm);
  for (let y = 0; y <= D + 1e-6; y += step) box(m, 0, Math.max(0, y - 0.02), -0.016, W, Math.min(D, y + 0.02), 0, lm);
  // noda bocor
  if (o.noda) quad(m, [[W * 0.55, D * 0.3, -0.0005], [W * 0.85, D * 0.35, -0.0005], [W * 0.8, D * 0.7, -0.0005], [W * 0.5, D * 0.6, -0.0005]], 'cat@b8a888', [0, 0, -1]);
}

// ------------------------------------------------------------------ genteng
// permukaan genteng: baris-baris keping (lebar gelombang 0,21 m, baris tampak 0,26 m) di atas bidang miring
// frame: titik asal o (sudut tepi bawah/teritis kiri), ex (arah sepanjang teritis, satuan), es (arah naik lereng, satuan),
// en (normal ke atas). xr(s) -> [xmin, xmax] rentang di sepanjang teritis pada jarak lereng s (untuk segitiga limasan).
function gentengSurface(m, o, ex, es, en, W, S, xr = null, opt = {}) {
  const pw = 0.21, rh = 0.26, amp = 0.028, lip = 0.018;
  const V = (a, s, h) => [o[0] + ex[0] * a + es[0] * s + en[0] * h, o[1] + ex[1] * a + es[1] * s + en[1] * h, o[2] + ex[2] * a + es[2] * s + en[2] * h];
  const prof = (a) => { const t = (a / pw) * Math.PI * 2; return amp * (0.5 + 0.5 * Math.sin(t)) * (0.8 + 0.2 * Math.cos(2 * t)); };
  const nrow = Math.ceil(S / rh);
  const per = opt.per ?? 6;
  const r = rng(opt.seed ?? 5);
  for (let j = 0; j < nrow; j++) {
    const s0 = j * rh, s1 = Math.min(S, s0 + rh + 0.03);
    const range = (s) => (xr ? xr(s) : [0, W]);
    const [ra0, ra1] = range(s0), [rb0, rb1] = range(s1);
    const a0 = Math.max(ra0, rb0), a1 = Math.min(ra1, rb1);
    const aLo = Math.min(ra0, rb0), aHi = Math.max(ra1, rb1);
    if (aHi - aLo < 0.02) continue;
    const ns = Math.max(2, Math.round(((aHi - aLo) / pw) * per));
    const tilt = lip; // tepi bawah baris lebih tinggi (menumpang baris di bawahnya)
    const jit = (r() - 0.5) * 0.006;
    grid(m, ns, 2, (u, v) => {
      const a = aLo + u * (aHi - aLo);
      const s = s0 + v * (s1 - s0);
      const [ca, cb] = range(s);
      if (a < ca - 1e-4 || a > cb + 1e-4) return null;
      return V(a, s, prof(a) + tilt * (1 - v) + jit);
    }, 'genteng', { hint: en, part: opt.part });
    // bibir depan keping (bidang tegak kecil) – menutup celah tumpangan
    for (let i = 0; i < ns; i++) {
      const aa = aLo + (i / ns) * (aHi - aLo), ab = aLo + ((i + 1) / ns) * (aHi - aLo);
      const [ca, cb] = range(s0);
      if (aa < ca - 1e-4 || ab > cb + 1e-4) continue;
      quad(m, [V(aa, s0, prof(aa) + tilt + jit), V(ab, s0, prof(ab) + tilt + jit), V(ab, s0, prof(ab) - 0.004), V(aa, s0, prof(aa) - 0.004)], 'genteng', [-es[0], -es[1], -es[2]], { part: opt.part });
    }
  }
}
// bubungan: deretan wuwung setengah silinder dari a ke b (titik di garis bubungan), dilapis spesi
function bubungan(m, a, b, o = {}) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const L = A.distanceTo(B), t = B.clone().sub(A).normalize();
  const up = new THREE.Vector3(0, 0, 1);
  const x = new THREE.Vector3().crossVectors(t, up);
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
  x.normalize();
  const z = new THREE.Vector3().crossVectors(x, t).normalize();
  const n = Math.max(1, Math.round(L / 0.36)), seg = 8, R = 0.13;
  for (let i = 0; i < n; i++) {
    const s0 = (i * L) / n, s1 = ((i + 1) * L) / n + 0.02;
    const rr = (k, s, rad) => { const an = Math.PI * (k / seg); return A.clone().addScaledVector(t, s).addScaledVector(x, Math.cos(an) * rad).addScaledVector(z, Math.sin(an) * rad * 0.8 - 0.02).toArray(); };
    for (let k = 0; k < seg; k++) {
      const an = Math.PI * ((k + 0.5) / seg);
      const nn = x.clone().multiplyScalar(Math.cos(an)).addScaledVector(z, Math.sin(an)).toArray();
      quad(m, [rr(k, s0, R * 1.04), rr(k + 1, s0, R * 1.04), rr(k + 1, s1, R), rr(k, s1, R)], 'genteng@c8a090', nn, { soft: true, part: o.part });
    }
    // ujung depan wuwung
    const ring = [...Array(seg + 1)].map((_, k) => rr(k, s0, R * 1.04));
    quad(m, ring, 'genteng@a07060', t.clone().negate().toArray(), { part: o.part });
  }
  // spesi di bawah wuwung (bidang miring kiri-kanan)
  for (const sx of [-1, 1]) {
    const p = (s, w, h) => A.clone().addScaledVector(t, s).addScaledVector(x, w * sx).addScaledVector(z, h).toArray();
    quad(m, [p(0, R * 1.0, -0.03), p(L, R * 1.0, -0.03), p(L, R * 1.35, -0.1), p(0, R * 1.35, -0.1)], 'plester@9e9a90', x.clone().multiplyScalar(sx).addScaledVector(z, 0.6).toArray(), { part: o.part });
  }
}

// bidang atap genteng pelana: lebar W (sepanjang bubungan, game +X), dari bubungan (y=0, z=rise) turun ke depan (-Y)
// sampai teritis. Titik asal = garis as bubungan pada ketinggian puncak dinding (z=0). Rangka usuk & reng di bawah, lisplang.
export function buildAtapMiring(m, o = {}) {
  const W = o.W ?? 2.0, half = o.half ?? RUMAH.halfSpan, ov = o.overhang ?? RUMAH.overhang, pitch = ((o.pitch ?? RUMAH.roofPitch) * Math.PI) / 180;
  const run = half + ov, S = run / Math.cos(pitch), rise = half * Math.tan(pitch);
  const zE = rise - S * Math.sin(pitch);       // tinggi teritis relatif puncak dinding (negatif)
  const es = [0, Math.cos(pitch), Math.sin(pitch)], en = [0, -Math.sin(pitch), Math.cos(pitch)];
  const o0 = [0, -run, zE + 0.12];             // permukaan genteng 12 cm di atas sisi atas usuk
  gentengSurface(m, o0, [1, 0, 0], es, en, W, S - 0.04, null, { seed: o.seed ?? 3 });
  // rangka: usuk (5/7) tiap 0,5 m dan reng (2/3) tiap baris, kaso tepi
  const U = (s, h) => [0, -run + es[1] * s + en[1] * h, zE + es[2] * s + en[2] * h];
  for (let x = 0.1; x < W; x += 0.5) {
    const a = U(0, 0.035), b = U(S, 0.035);
    beam(m, [x, a[1], a[2]], [x, b[1], b[2]], 0.05, 0.07, 'kayu@8a6a4a');
  }
  for (let s = 0.13; s < S - 0.05; s += 0.26) {
    const p = U(s, 0.09);
    beam(m, [0, p[1], p[2]], [W, p[1], p[2]], 0.03, 0.02, 'kayu@9a7a5a');
  }
  // gording mendatar (8/12) di atas dinding & tengah
  for (const yy of [-half, -half / 2]) {
    const s = (yy + run) / Math.cos(pitch);
    const p = U(s, -0.06);
    beam(m, [0, p[1], p[2]], [W, p[1], p[2]], 0.08, 0.12, 'kayu@7a5a3a');
  }
  // lisplang papan di teritis
  const e0 = U(0, 0.0);
  box(m, 0, e0[1] - 0.025, e0[2] - 0.12, W, e0[1], e0[2] + 0.13, 'kayu_cat@e2dccc');
  // talang? tidak (rumah kampung umumnya tanpa talang)
}
// bubungan lurus sepanjang W (di atas pertemuan dua bidang miring), titik asal di as bubungan, z = puncak dinding
export function buildBubungan(m, o = {}) {
  const W = o.W ?? 2.0, half = o.half ?? RUMAH.halfSpan, pitch = ((o.pitch ?? RUMAH.roofPitch) * Math.PI) / 180;
  const rise = half * Math.tan(pitch) + 0.12 / Math.cos(pitch) + 0.02;
  bubungan(m, [0, 0, rise], [W, 0, rise]);
  // nok kayu
  beam(m, [0, 0, rise - 0.22], [W, 0, rise - 0.22], 0.08, 0.15, 'kayu@7a5a3a');
}
// gevel (dinding segitiga ujung atap pelana) setebal 0,15 m + lisplang miring, titik asal di as bubungan pada puncak dinding;
// bidang gevel berada di x = 0 (menghadap -X/luar)
export function buildGevel(m, o = {}) {
  const half = o.half ?? RUMAH.halfSpan, pitch = ((o.pitch ?? RUMAH.roofPitch) * Math.PI) / 180, T = RUMAH.T;
  const rise = half * Math.tan(pitch);
  const mat = o.mat || 'plester@e6dcc2';
  // segitiga di bidang Y-Z, diekstrusi pada X (-T/2..T/2)
  const tri = [[-half, 0], [half, 0], [0, rise]];
  for (const [x, n] of [[-T / 2, -1], [T / 2, 1]]) quad(m, tri.map(([y, z]) => [x, y, z]), n < 0 ? mat : CAT_DALAM, [n, 0, 0]);
  for (let i = 0; i < 3; i++) {
    const [ya, za] = tri[i], [yb, zb] = tri[(i + 1) % 3];
    const nyz = [zb - za, -(yb - ya)];
    const c = [(ya + yb) / 2, (za + zb) / 2];
    const sgn = nyz[0] * (c[0] - 0) + nyz[1] * (c[1] - rise / 3) < 0 ? -1 : 1;
    quad(m, [[-T / 2, ya, za], [T / 2, ya, za], [T / 2, yb, zb], [-T / 2, yb, zb]], 'beton', [0, nyz[0] * sgn, nyz[1] * sgn]);
  }
  // lubang angin bulat/roster di gevel (dekor)
  for (let k = 0; k < 5; k++) box(m, -T / 2 - 0.01, -0.3 + k * 0.15, rise * 0.45, -T / 2, -0.25 + k * 0.15, rise * 0.45 + 0.25, 'beton@6a665e');
  // lisplang miring
  const ov = o.overhang ?? RUMAH.overhang, run = half + ov;
  const zE = rise - run * Math.tan(pitch);
  for (const sy of [-1, 1]) {
    beam(m, [-T / 2 - 0.12, sy * run, zE + 0.05], [-T / 2 - 0.12, 0, rise + 0.17], 0.025, 0.24, 'kayu_cat@e2dccc');
  }
  // tritisan genteng di ujung (genteng menjorok ke luar gevel 0,25 m)
  for (const sy of [-1, 1]) {
    const S = run / Math.cos(pitch);
    const es = [0, -sy * Math.cos(pitch), Math.sin(pitch)], en = [0, sy * Math.sin(pitch), Math.cos(pitch)];
    const o0 = [-T / 2 - 0.25, sy * run, zE + 0.12];
    gentengSurface(m, o0, [1, 0, 0], es, en, 0.25 + T / 2, S - 0.04, null, { seed: 9 + sy });
  }
}
// ujung limasan: bidang segitiga perisai + dua sudut bidang samping, titik asal di ujung bubungan (x=0), z = puncak dinding;
// atap meluas ke -X sejauh half+overhang.
export function buildLimasanUjung(m, o = {}) {
  const half = o.half ?? RUMAH.halfSpan, ov = o.overhang ?? RUMAH.overhang, pitch = ((o.pitch ?? RUMAH.roofPitch) * Math.PI) / 180;
  const run = half + ov, S = run / Math.cos(pitch), rise = half * Math.tan(pitch), zE = rise - S * Math.sin(pitch);
  // tiga bidang: depan (-Y), belakang (+Y) segitiga-trapesium, dan ujung (-X) segitiga
  const planes = [
    { o: [-run, -run, zE + 0.12], ex: [1, 0, 0], es: [0, Math.cos(pitch), Math.sin(pitch)], en: [0, -Math.sin(pitch), Math.cos(pitch)], xr: (s) => { const d = run - s * Math.cos(pitch); return [run - d, run]; } },
    { o: [0, run, zE + 0.12], ex: [-1, 0, 0], es: [0, -Math.cos(pitch), Math.sin(pitch)], en: [0, Math.sin(pitch), Math.cos(pitch)], xr: (s) => { const d = run - s * Math.cos(pitch); return [0, d]; } },
    { o: [-run, run, zE + 0.12], ex: [0, -1, 0], es: [Math.cos(pitch), 0, Math.sin(pitch)], en: [-Math.sin(pitch), 0, Math.cos(pitch)], xr: (s) => { const d = s * Math.cos(pitch); return [d, 2 * run - d]; } },
  ];
  planes.forEach((p, i) => gentengSurface(m, p.o, p.ex, p.es, p.en, 2 * run, S - 0.04, p.xr, { seed: 20 + i, per: 4 }));
  // jurai (bubungan miring) dari ujung bubungan ke dua sudut teritis
  const top = [0, 0, rise + 0.12 / Math.cos(pitch) + 0.02];
  for (const sy of [-1, 1]) bubungan(m, top, [-run, sy * run, zE + 0.14]);
  // lisplang keliling
  const lz = zE - 0.0;
  box(m, -run, -run - 0.025, lz - 0.12, 0, -run, lz + 0.13, 'kayu_cat@e2dccc');
  box(m, -run, run, lz - 0.12, 0, run + 0.025, lz + 0.13, 'kayu_cat@e2dccc');
  box(m, -run - 0.025, -run, lz - 0.12, -run, run, lz + 0.13, 'kayu_cat@e2dccc');
  // rangka jurai & usuk bawah (sebagian)
  for (const sy of [-1, 1]) beam(m, [0, 0, rise - 0.1], [-run + 0.1, sy * (run - 0.1), zE + 0.03], 0.06, 0.12, 'kayu@7a5a3a');
  for (let k = 1; k < 7; k++) {
    const s = k / 7;
    beam(m, [-s * run * 0.95, 0, rise - 0.1 - s * rise * 0.95 + 0.0], [-run + 0.1, 0, zE + 0.03], 0.05, 0.07, 'kayu@8a6a4a');
  }
}
// pondasi batu kali (terlihat di bawah lantai rumah yang ditinggikan), panjang L sepanjang +X, z -0,45..0
export function buildPondasi(m, o = {}) {
  const L = o.L ?? 2.0, T = 0.26;
  box(m, 0, -T / 2, -0.5, L, T / 2, 0.0, 'batu', { mats: { z1: 'beton' } });
  // spesi plester kasar menutupi sebagian (pondasi diplester tapi mengelupas)
  box(m, 0, -T / 2 - 0.008, -0.12, L * 0.62, -T / 2, 0.0, 'plester_lumut@a8a28c', { skip: ['y1'] });
}
// umpak (alas tiang kayu) batu/beton berbentuk limas terpancung
export function buildUmpak(m) {
  const b = 0.17, t = 0.1, h = 0.3;
  const B = [[-b, -b], [b, -b], [b, b], [-b, b]], T2 = [[-t, -t], [t, -t], [t, t], [-t, t]];
  for (let i = 0; i < 4; i++) {
    const a = B[i], c = B[(i + 1) % 4], d = T2[(i + 1) % 4], e = T2[i];
    const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
    quad(m, [[a[0], a[1], 0], [c[0], c[1], 0], [d[0], d[1], h], [e[0], e[1], h]], 'batu@b8b4aa', [mx, my, 0.4]);
  }
  quad(m, T2.map(([x, y]) => [x, y, h]), 'batu@b8b4aa', [0, 0, 1]);
}
// tiang teras kayu di atas umpak, dengan siku penyangga
export function buildTiangTeras(m, o = {}) {
  const h = o.H ?? 2.95, w = 0.12;
  buildUmpak(m);
  box(m, -w / 2, -w / 2, 0.3, w / 2, w / 2, h, o.mat || 'kayu_cat@6a4a32');
  for (const sx of [-1, 1]) obox(m, [sx * 0.2, 0, h - 0.18], [0.42, 0.06, 0.06], o.mat || 'kayu_cat@6a4a32', { y: sx * Math.PI / 4 });
  box(m, -w / 2 - 0.01, -w / 2 - 0.01, h - 0.02, w / 2 + 0.01, w / 2 + 0.01, h, 'kayu@7a5a3a');
}
// lantai teras 2 x 2 keramik dengan bibir & satu anak tangga di depan (-Y); permukaan z=0, tanah z=-0,45
export function buildTerasLantai(m, o = {}) {
  const W = o.W ?? 2, D = o.D ?? 2, mat = o.mat || 'keramik';
  box(m, 0, 0, -0.45, W, D, 0, 'plester@9c968a', { mats: { z1: mat }, skip: ['z0'] });
  box(m, 0, -0.32, -0.45, W, 0, -0.22, 'plester@9c968a', { mats: { z1: mat }, skip: ['z0', 'y1'] });
  // bibir keramik
  box(m, 0, -0.012, -0.03, W, 0.0, 0.0, 'keramik', { skip: ['y1'] });
}
// kanopi seng bergelombang 2 m, menjorok P ke depan (-Y) dari dinding (y=0) dengan kemiringan 12 derajat, titik asal di
// dinding pada ketinggian pemasangan (z=0)
export function buildKanopiSeng(m, o = {}) {
  const W = o.W ?? 2.0, Pj = o.P ?? 1.5, sl = ((o.slope ?? 12) * Math.PI) / 180;
  const drop = Pj * Math.tan(sl);
  const wave = (x) => 0.018 * Math.sin((x / 0.076) * Math.PI * 2);
  const r = rng(o.seed ?? 11);
  const dent = (x, y) => (r() < 0 ? 0 : 0.01 * Math.sin(x * 3.1 + y * 2.3));
  grid(m, Math.round(W / 0.076) * 4, 4, (s, t) => {
    const x = s * W, y = -t * (Pj + 0.1);
    return [x, y, -(-y) * Math.tan(sl) + wave(x) + dent(x, y) + 0.02];
  }, 'seng', { hint: [0, -0.2, 1], part: o.part });
  grid(m, Math.round(W / 0.076) * 2, 2, (s, t) => {
    const x = s * W, y = -t * (Pj + 0.1);
    return [x, y, -(-y) * Math.tan(sl) + wave(x) + 0.017];
  }, 'seng@7a7a70', { hint: [0, 0.2, -1], part: o.part });
  // rangka kayu: balok dinding, balok depan, kasau
  box(m, 0, -0.06, -0.08, W, 0.0, 0.0, 'kayu@7a5a3a');
  beam(m, [0, -Pj, -drop - 0.04], [W, -Pj, -drop - 0.04], 0.06, 0.08, 'kayu@7a5a3a');
  for (const x of [0.05, W / 2, W - 0.05]) beam(m, [x, 0, -0.04], [x, -Pj - 0.05, -drop - 0.05], 0.05, 0.07, 'kayu@8a6a4a');
  // penyangga siku besi ke dinding
  for (const x of [0.15, W - 0.15]) beam(m, [x, -0.02, -0.7], [x, -Pj * 0.8, -drop * 0.8 - 0.06], 0.03, 0.03, 'besi_karat');
}
// kolom sudut / kolom praktis (menutup celah pertemuan dinding)
export function buildKolomSudut(m, o = {}) {
  const w = 0.17, h = o.H ?? RUMAH.H;
  box(m, -w / 2, -w / 2, 0, w / 2, w / 2, h, o.mat || 'plester@e6dcc2', { mats: { z1: 'beton' } });
  box(m, -w / 2 - 0.012, -w / 2 - 0.012, 0, w / 2 + 0.012, w / 2 + 0.012, 0.36, 'plester_lumut@b8b29a', { skip: ['z0'] });
}

// ------------------------------------------------------------------ pos ronda
// panggung kayu 2 x 3 m (lantai papan 0,5 m), 4 tiang + bangku memanjang menyatu, dinding papan setengah tinggi di belakang
// dan samping, atap pelana genteng (o.atap='genteng') atau seng miring satu (o.atap='seng').
export function buildPosRonda(m, o = {}) {
  const W = 3.0, D = 2.0, fz = 0.5, Hp = 2.5;
  const kayu = 'kayu@8a6a4a', papan = 'papan_kayu';
  // umpak + tiang
  const posts = [[0.06, 0.06], [W - 0.06, 0.06], [0.06, D - 0.06], [W - 0.06, D - 0.06]];
  for (const [x, y] of posts) {
    box(m, x - 0.12, y - 0.12, 0, x + 0.12, y + 0.12, 0.22, 'beton@a8a498');
    box(m, x - 0.05, y - 0.05, 0.22, x + 0.05, y + 0.05, Hp + (o.atap === 'seng' && y > 1 ? 0.35 : 0), kayu);
  }
  // balok lantai & papan lantai (celah antar papan)
  for (const y of [0.06, D / 2, D - 0.06]) box(m, 0, y - 0.04, fz - 0.14, W, y + 0.04, fz - 0.03, kayu);
  const r = rng(31);
  for (let x = 0; x < W - 0.01; x += 0.2) box(m, x + 0.004, 0, fz - 0.03, Math.min(W, x + 0.196), D, fz - 0.03 + 0.025 + r() * 0.004, 'papan_lantai');
  // bangku menyatu di sisi belakang & kanan
  const bz = fz + 0.42;
  box(m, 0.12, D - 0.45, bz - 0.04, W - 0.12, D - 0.12, bz, 'papan_lantai');
  for (const x of [0.4, W / 2, W - 0.4]) box(m, x - 0.03, D - 0.4, fz, x + 0.03, D - 0.34, bz - 0.04, kayu);
  // dinding papan setengah (belakang & samping kiri) + palang sandaran
  for (let z = fz; z < fz + 0.9; z += 0.15) box(m, 0.06, D - 0.075, z + 0.005, W - 0.06, D - 0.05, z + 0.14, papan);
  for (let z = fz; z < fz + 0.9; z += 0.15) box(m, 0.05, 0.11, z + 0.005, 0.075, D - 0.08, z + 0.14, papan);
  box(m, 0.06, D - 0.08, fz + 0.9, W - 0.06, D - 0.02, fz + 0.95, kayu);
  // balok atas keliling
  box(m, 0, 0.02, Hp - 0.1, W, 0.1, Hp, kayu);
  box(m, 0, D - 0.1, Hp - 0.1, W, D - 0.02, Hp, kayu);
  box(m, 0.02, 0, Hp - 0.1, 0.1, D, Hp, kayu);
  box(m, W - 0.1, 0, Hp - 0.1, W - 0.02, D, Hp, kayu);
  // tangga satu anak
  box(m, 0.9, -0.35, 0, 2.1, -0.05, 0.22, 'beton@a8a498');
  // gantungan kentongan (paku/kayu) di tiang depan kanan
  box(m, W - 0.12, 0.0, 1.85, W - 0.0, 0.03, 1.88, 'logam@6a6a60');
  if (o.atap === 'seng') {
    // atap seng miring ke depan
    const ov = 0.4;
    const wave = (x) => 0.018 * Math.sin((x / 0.076) * Math.PI * 2);
    grid(m, Math.round((W + 2 * ov) / 0.076) * 3, 4, (s, t) => { const x = -ov + s * (W + 2 * ov); const y = -ov + t * (D + 2 * ov); return [x, y, Hp + 0.06 + (y / D) * 0.35 + wave(x)]; }, 'seng', { hint: [0, -0.17, 1] });
    grid(m, Math.round((W + 2 * ov) / 0.076), 2, (s, t) => { const x = -ov + s * (W + 2 * ov); const y = -ov + t * (D + 2 * ov); return [x, y, Hp + 0.045 + (y / D) * 0.35 + wave(x)]; }, 'seng@6a6a64', { hint: [0, 0.17, -1] });
    for (let x = 0.0; x <= W + 0.01; x += 0.75) beam(m, [x, -ov, Hp + 0.0 - 0.0 + (-ov / D) * 0.35], [x, D + ov, Hp + ((D + ov) / D) * 0.35], 0.05, 0.06, kayu);
  } else {
    // atap pelana genteng (bubungan sejajar X)
    const half = D / 2 + 0.05, pitch = (32 * Math.PI) / 180, ov = 0.45;
    const run = half + ov, S = run / Math.cos(pitch), rise = half * Math.tan(pitch);
    for (const sy of [-1, 1]) {
      const es = [0, -sy * Math.cos(pitch), Math.sin(pitch)], en = [0, sy * Math.sin(pitch), Math.cos(pitch)];
      const zE = Hp + rise - S * Math.sin(pitch);
      gentengSurface(m, [-0.3, D / 2 + sy * run, zE + 0.1], [1, 0, 0], es, en, W + 0.6, S - 0.03, null, { seed: 40 + sy });
      // usuk
      for (let x = -0.25; x <= W + 0.3; x += 0.5) beam(m, [x, D / 2 + sy * run, zE + 0.03], [x, D / 2, Hp + rise + 0.03], 0.05, 0.06, kayu);
      box(m, -0.3, D / 2 + sy * run - (sy < 0 ? 0.02 : 0), zE - 0.1, W + 0.3, D / 2 + sy * run + (sy > 0 ? 0.02 : 0), zE + 0.12, 'kayu_cat@e2dccc');
    }
    bubungan(m, [-0.3, D / 2, Hp + rise + 0.12 / Math.cos(pitch) + 0.02], [W + 0.3, D / 2, Hp + rise + 0.12 / Math.cos(pitch) + 0.02]);
    // kuda-kuda sederhana di kedua ujung
    for (const x of [0.06, W - 0.06]) {
      beam(m, [x, 0.06, Hp], [x, D / 2, Hp + rise], 0.06, 0.08, kayu);
      beam(m, [x, D - 0.06, Hp], [x, D / 2, Hp + rise], 0.06, 0.08, kayu);
      box(m, x - 0.03, D / 2 - 0.03, Hp, x + 0.03, D / 2 + 0.03, Hp + rise, kayu);
    }
    beam(m, [0, D / 2, Hp + rise - 0.06], [W, D / 2, Hp + rise - 0.06], 0.06, 0.1, kayu);
  }
}

// ------------------------------------------------------------------ warung
// bangunan 4 x 3,5 m: depan (-Y) terbuka berjendela etalase (meja papan) + rolling door setengah terbuka (bagian
// 'ROLLING_DOOR'), pintu samping kanan (lubang 0,9 m, daun pintu terpisah), kanopi seng di depan, atap seng miring ke belakang.
export function buildWarung(m, o = {}) {
  const W = 4.0, D = 3.5, Hh = 3.0, T = 0.15;
  const outer = 'plester@d7e3d4', inner = 'cat@ebe6d6';
  // lantai semen (permukaan z=0.15, lantai lebih tinggi dari tanah)
  box(m, -0.1, -0.1, 0, W + 0.1, D + 0.1, 0.15, 'plester@9c968a', { mats: { z1: 'beton' } });
  const fz = 0.15;
  // dinding belakang (utuh)
  box(m, 0, D - T, fz, W, D, fz + Hh, outer, { mats: { y0: inner } });
  // dinding kiri (utuh) & kanan (berlubang pintu 0,9 di y 1.0..1.9)
  box(m, 0, 0, fz, T, D - T, fz + Hh, outer, { mats: { x1: inner } });
  box(m, W - T, 0, fz, W, 1.0, fz + Hh, outer, { mats: { x0: inner } });
  box(m, W - T, 1.92, fz, W, D - T, fz + Hh, outer, { mats: { x0: inner } });
  box(m, W - T, 1.0, fz + 2.1, W, 1.92, fz + Hh, outer, { mats: { x0: inner } });
  kusenSide(m, W - T / 2, 1.0, 1.92, fz, fz + 2.1, 'kayu_cat@3f6a8a');
  // depan: tiang ujung + ambang atas + dinding bawah etalase (meja) 0,9 m
  box(m, 0, 0, fz, 0.3, T, fz + Hh, outer, { mats: { y1: inner } });
  box(m, W - 0.3, 0, fz, W, T, fz + Hh, outer, { mats: { y1: inner } });
  box(m, 0.3, 0, fz + 2.35, W - 0.3, T, fz + Hh, outer, { mats: { y1: inner } });
  box(m, 0.3, 0, fz, W - 0.3, T, fz + 0.85, 'keramik_dinding@e8eef0', { mats: { y1: inner, z1: 'papan_lantai' } });
  // meja etalase papan menjorok
  box(m, 0.3, -0.25, fz + 0.85, W - 0.3, T + 0.05, fz + 0.9, 'papan_lantai');
  // kotak rolling door (atas) + rel samping + daun rolling setengah turun
  box(m, 0.25, -0.12, fz + 2.35, W - 0.25, 0.02, fz + 2.62, 'seng@8a8f90');
  for (const x of [0.3, W - 0.34]) box(m, x, -0.06, fz + 0.9, x + 0.04, -0.02, fz + 2.35, 'besi_karat');
  const rz0 = fz + 1.65;
  grid(m, 2, 24, (s, t) => [0.33 + s * (W - 0.66), -0.04 + 0.006 * Math.sin(t * 24 * Math.PI), rz0 + t * (fz + 2.35 - rz0)], 'seng@9aa0a0', { hint: [0, -1, 0], part: 'ROLLING_DOOR', soft: false });
  grid(m, 2, 2, (s, t) => [0.33 + s * (W - 0.66), -0.03, rz0 + t * (fz + 2.35 - rz0)], 'seng@7a7f80', { hint: [0, 1, 0], part: 'ROLLING_DOOR' });
  box(m, 0.33, -0.06, rz0 - 0.04, W - 0.33, -0.02, rz0, 'besi_karat', { part: 'ROLLING_DOOR' });
  box(m, W / 2 - 0.1, -0.08, rz0 - 0.02, W / 2 + 0.1, -0.06, rz0 + 0.02, 'logam', { part: 'ROLLING_DOOR' });
  // atap seng miring ke belakang di atas dinding, dengan balok kayu
  const ov = 0.3, Hr = fz + Hh;
  const wave = (x) => 0.018 * Math.sin((x / 0.076) * Math.PI * 2);
  grid(m, Math.round((W + 2 * ov) / 0.076) * 3, 5, (s, t) => { const x = -ov + s * (W + 2 * ov); const y = -0.2 + t * (D + 0.2 + ov); return [x, y, Hr + 0.45 - (y / D) * 0.45 + wave(x)]; }, 'seng', { hint: [0, 0.15, 1] });
  grid(m, Math.round((W + 2 * ov) / 0.076), 2, (s, t) => { const x = -ov + s * (W + 2 * ov); const y = -0.2 + t * (D + 0.2 + ov); return [x, y, Hr + 0.435 - (y / D) * 0.45 + wave(x)]; }, 'seng@6a6a64', { hint: [0, -0.15, -1] });
  // ganjal dinding samping (segitiga) agar atap tertutup
  for (const x of [0, W - T]) {
    const poly = [[0, Hr], [D, Hr], [0, Hr + 0.45]];
    for (const [xx, n] of [[x, -1], [x + T, 1]]) quad(m, poly.map(([y, z]) => [xx, y, z]), outer, [n, 0, 0]);
  }
  box(m, 0, 0, Hr, W, T, Hr + 0.45, outer);
  for (let x = 0.1; x < W; x += 0.8) beam(m, [x, -0.2, Hr + 0.43], [x, D + ov, Hr + 0.43 - ((D + ov + 0.2) / D) * 0.45], 0.05, 0.07, 'kayu@7a5a3a');
  // plafon triplek di dalam
  quad(m, [[T, T, fz + 2.8], [W - T, T, fz + 2.8], [W - T, D - T, fz + 2.8], [T, D - T, fz + 2.8]], 'kayu@d6bf98', [0, 0, -1]);
  // kanopi seng depan (menempel di atas kotak rolling)
  const kz = fz + 2.75;
  const Pj = 1.6, sl = 0.2;
  grid(m, Math.round((W + 0.4) / 0.076) * 3, 4, (s, t) => { const x = -0.2 + s * (W + 0.4); const y = -t * Pj; return [x, y, kz - t * Pj * sl + wave(x)]; }, 'seng', { hint: [0, -0.2, 1] });
  grid(m, Math.round((W + 0.4) / 0.076), 2, (s, t) => { const x = -0.2 + s * (W + 0.4); const y = -t * Pj; return [x, y, kz - 0.015 - t * Pj * sl + wave(x)]; }, 'seng@6a6a64', { hint: [0, 0.2, -1] });
  for (const x of [0.0, W]) {
    box(m, x - 0.04, -Pj + 0.05, 0, x + 0.04, -Pj + 0.13, kz - Pj * sl, 'besi_karat');
    box(m, x - 0.12, -Pj - 0.03, 0, x + 0.12, -Pj + 0.21, 0.08, 'beton@a8a498');
  }
  beam(m, [-0.2, -Pj + 0.09, kz - Pj * sl - 0.04], [W + 0.2, -Pj + 0.09, kz - Pj * sl - 0.04], 0.05, 0.06, 'besi_karat');
  // papan nama warung kecil di atas (teks dipasang tekstur di game; di sini papan polos)
  box(m, 0.6, -0.05, fz + 2.62, W - 0.6, -0.02, fz + 2.74, 'kayu_cat@c03a2a');
}
function kusenSide(m, x, y0, y1, z0, z1, mat) {
  const k = 0.06, d = 0.11;
  box(m, x - d / 2, y0, z0, x + d / 2, y0 + k, z1, mat);
  box(m, x - d / 2, y1 - k, z0, x + d / 2, y1, z1, mat);
  box(m, x - d / 2, y0, z1 - k, x + d / 2, y1, z1, mat);
}

// ------------------------------------------------------------------ masjid kecil (langgar) beratap tumpang
// ruang salat 7 x 7 m (dinding plester putih-hijau muda, jendela lengkung berkaca), teras depan 7 x 3 m bertiang,
// atap tumpang dua susun bergenteng dengan mustaka (mahkota) di puncak. Bagian dalam kosong untuk karpet & perabot.
export function buildMasjid(m, o = {}) {
  const S = 7.0, T = 0.2, fz = 0.45, Hw = 3.6, TE = 3.0;
  const outer = 'plester@eef0e6', inner = 'cat@f2f0e8', hijau = 'cat@6e9a7a';
  // pelat lantai ditinggikan (ruang + teras) dengan anak tangga depan
  box(m, -0.1, -TE - 0.1, 0, S + 0.1, S + 0.1, fz, 'plester@bcb6a6', { mats: { z1: 'keramik' } });
  for (let k = 0; k < 2; k++) box(m, 2.3 - k * 0.15, -TE - 0.1 - 0.3 * (2 - k), 0, S - 2.3 + k * 0.15, -TE - 0.1 - 0.3 * (1 - k), fz * (k + 1) / 3, 'plester@bcb6a6', { mats: { z1: 'keramik' } });
  // dinding ruang salat dengan jendela lengkung (3 per sisi samping, pintu tengah depan 1,6 m)
  const winW = 0.9, winZ0 = fz + 0.8, winZ1 = fz + 2.5;
  const side = (axis, fixed, inward) => {
    // axis 'x': dinding sejajar X pada y=fixed; 'y': sejajar Y pada x=fixed
    const openings = axis === 'x' && fixed < 1 ? [[S / 2 - 0.8, S / 2 + 0.8, fz, fz + 2.6], [1.0, 1.0 + winW, winZ0, winZ1], [S - 1.0 - winW, S - 1.0, winZ0, winZ1]]
      : axis === 'x' ? [[S / 2 - 0.6, S / 2 + 0.6, fz, fz + 2.6]] : [[1.0, 1.0 + winW, winZ0, winZ1], [S / 2 - winW / 2, S / 2 + winW / 2, winZ0, winZ1], [S - 1.0 - winW, S - 1.0, winZ0, winZ1]];
    const L = S;
    const xs = new Set([0, L]);
    openings.forEach((h) => { xs.add(h[0]); xs.add(h[1]); });
    const X = [...xs].sort((a, b) => a - b);
    for (let i = 0; i < X.length - 1; i++) {
      const a = X[i], b = X[i + 1];
      const h = openings.find((q) => q[0] <= a + 1e-6 && q[1] >= b - 1e-6);
      const spans = h ? [[fz, h[2]], [h[3], fz + Hw]].filter((s) => s[1] - s[0] > 1e-3) : [[fz, fz + Hw]];
      for (const [z0, z1] of spans) {
        if (axis === 'x') box(m, a, fixed - T / 2, z0, b, fixed + T / 2, z1, outer, { mats: { [inward > 0 ? 'y1' : 'y0']: inner } });
        else box(m, fixed - T / 2, a, z0, fixed + T / 2, b, z1, outer, { mats: { [inward > 0 ? 'x1' : 'x0']: inner } });
      }
    }
    for (const h of openings) {
      const arched = h[2] > fz + 0.1;
      const cx = (h[0] + h[1]) / 2, r = (h[1] - h[0]) / 2;
      const P2 = (u, z, d) => (axis === 'x' ? [u, fixed + d, z] : [fixed + d, u, z]);
      // lengkung: isi bidang di atas lubang sebagai potongan berbentuk busur (mengisi kotak h[3]-r .. h[3])
      const nA = 8;
      for (let k = 0; k < nA; k++) {
        const a0 = Math.PI * (k / nA), a1 = Math.PI * ((k + 1) / nA);
        const u0 = cx + Math.cos(a0) * r, u1 = cx + Math.cos(a1) * r;
        const z0 = h[3] - r + Math.sin(a0) * r, z1 = h[3] - r + Math.sin(a1) * r;
        for (const d of [-T / 2, T / 2]) {
          const nn = axis === 'x' ? [0, Math.sign(d), 0] : [Math.sign(d), 0, 0];
          const mm = (d < 0) === (inward > 0) ? outer : inner;
          quad(m, [P2(u0, z0, d), P2(u1, z1, d), P2(u1, h[3], d), P2(u0, h[3], d)], mm, nn);
        }
        quad(m, [P2(u0, z0, -T / 2), P2(u1, z1, -T / 2), P2(u1, z1, T / 2), P2(u0, z0, T / 2)], 'plester@e0ddd0', axis === 'x' ? [cx - (u0 + u1) / 2, 0, -1] : [0, cx - (u0 + u1) / 2, -1]);
      }
      // pipi lubang
      for (const [u, s] of [[h[0], 1], [h[1], -1]]) quad(m, [P2(u, h[2], -T / 2), P2(u, h[2], T / 2), P2(u, h[3] - r, T / 2), P2(u, h[3] - r, -T / 2)], 'plester@e0ddd0', axis === 'x' ? [s, 0, 0] : [0, s, 0]);
      if (arched) {
        quad(m, [P2(h[0], h[2], -T / 2), P2(h[1], h[2], -T / 2), P2(h[1], h[2], T / 2), P2(h[0], h[2], T / 2)], 'beton@c8c4b8', [0, 0, 1]);
        // kaca berbingkai kayu hijau (dua daun) + kaca warna di lengkung
        const yk = 0;
        for (const [ua, ub] of [[h[0] + 0.04, cx - 0.01], [cx + 0.01, h[1] - 0.04]]) {
          const f = 0.04;
          const fr = (a, b, za, zb) => (axis === 'x' ? box(m, a, fixed - 0.02, za, b, fixed + 0.02, zb, 'kayu_cat@4e7a5e') : box(m, fixed - 0.02, a, za, fixed + 0.02, b, zb, 'kayu_cat@4e7a5e'));
          fr(ua, ua + f, h[2], h[3] - r);
          fr(ub - f, ub, h[2], h[3] - r);
          fr(ua, ub, h[2], h[2] + f);
          fr(ua, ub, h[3] - r - f, h[3] - r);
          fr(ua, ub, (h[2] + h[3] - r) / 2 - f / 2, (h[2] + h[3] - r) / 2 + f / 2);
          quad(m, [P2(ua + f, h[2] + f, yk), P2(ub - f, h[2] + f, yk), P2(ub - f, h[3] - r - f, yk), P2(ua + f, h[3] - r - f, yk)], 'kaca', axis === 'x' ? [0, -1, 0] : [-1, 0, 0], { part: 'KACA' });
        }
        const pts = [...Array(9)].map((_, k) => { const a = Math.PI * (k / 8); return P2(cx + Math.cos(a) * (r - 0.03), h[3] - r + Math.sin(a) * (r - 0.03), 0); });
        quad(m, pts, 'kaca@9ad0b0', axis === 'x' ? [0, -1, 0] : [-1, 0, 0], { part: 'KACA' });
      }
    }
  };
  side('x', 0, 1);
  side('x', S, -1);
  side('y', 0, 1);
  side('y', S, -1);
  // pelipit (list) hijau keliling di puncak dinding & plin
  box(m, -0.14, -0.14, fz + Hw - 0.25, S + 0.14, S + 0.14, fz + Hw, hijau, { skip: ['z1'] });
  box(m, -0.12, -0.12, fz, S + 0.12, S + 0.12, fz + 0.3, 'keramik@6e8a7a', { skip: ['z0', 'z1'] });
  // mihrab: ceruk menjorok di dinding belakang (kiblat)
  box(m, S / 2 - 0.75, S + 0.75, fz, S / 2 + 0.75, S + 0.9, fz + 3.0, inner);
  for (const sx of [-1, 1]) box(m, S / 2 + sx * 0.6, S + T / 2, fz, S / 2 + sx * 0.75, S + 0.75, fz + 3.0, inner);
  box(m, S / 2 - 0.6, S + T / 2, fz + 2.6, S / 2 + 0.6, S + 0.75, fz + 3.0, inner);
  // daun pintu depan kembar (kayu hijau) dalam posisi TERBUKA ke dalam (menempel dinding) – bagian 'PINTU_MASJID'
  for (const sx of [-1, 1]) {
    const x = S / 2 + sx * 0.8;
    const xa = sx < 0 ? x : x - 0.04, xb = sx < 0 ? x + 0.04 : x;
    box(m, xa, T / 2, fz, xb, T / 2 + 0.77, fz + 2.55, 'kayu_cat@4e7a5e', { part: 'PINTU_MASJID' });
    for (const z of [fz + 0.3, fz + 1.4]) box(m, sx < 0 ? xb : xa - 0.01, T / 2 + 0.1, z, sx < 0 ? xb + 0.01 : xa, T / 2 + 0.67, z + 0.9, 'kayu_cat@3e6a4e', { part: 'PINTU_MASJID' });
  }
  // teras: tiang beton bulat bercat hijau-putih, balok, plafon
  for (const x of [0.15, S / 3, (2 * S) / 3, S - 0.15]) {
    cyl(m, [x, -TE + 0.15, fz], [x, -TE + 0.15, fz + 3.2], 0.14, 'cat@f0f0e8', 16);
    cyl(m, [x, -TE + 0.15, fz], [x, -TE + 0.15, fz + 0.5], 0.16, hijau, 16);
  }
  box(m, -0.1, -TE, fz + 3.2, S + 0.1, -TE + 0.3, fz + 3.5, outer, { mats: { z1: 'beton' } });
  quad(m, [[0, -TE + 0.3, fz + 3.3], [S, -TE + 0.3, fz + 3.3], [S, 0, fz + 3.3], [0, 0, fz + 3.3]], 'cat@f2f0e8', [0, 0, -1]);
  // atap teras genteng miring
  {
    const pitch = (25 * Math.PI) / 180, run = TE + 0.5, Sl = run / Math.cos(pitch), z0 = fz + 3.45;
    gentengSurface(m, [-0.4, -TE - 0.5, z0], [1, 0, 0], [0, Math.cos(pitch), Math.sin(pitch)], [0, -Math.sin(pitch), Math.cos(pitch)], S + 0.8, Sl, null, { seed: 61, per: 4 });
    box(m, -0.4, -TE - 0.52, z0 - 0.15, S + 0.4, -TE - 0.5, z0 + 0.08, 'kayu_cat@4e7a5e');
    for (const x of [-0.4, S + 0.4]) {
      const poly = [[-TE - 0.5, z0 - 0.15], [0, z0 - 0.15], [0, z0 + run * Math.tan(pitch)]];
      quad(m, poly.map(([y, z]) => [x, y, z]), 'kayu_cat@4e7a5e', [x < 1 ? -1 : 1, 0, 0]);
    }
  }
  // atap tumpang 2 susun: limas bujur sangkar terpancung + atap atas limas + mustaka
  const roofLimas = (cx, cy, half0, half1, z0, z1, seed) => {
    // empat bidang trapesium bergenteng dari keliling half0 di z0 naik ke half1 di z1
    const dz = z1 - z0, dh = half0 - half1, pitch = Math.atan2(dz, dh), Sl = Math.hypot(dz, dh);
    const faces = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    faces.forEach(([nx, ny], i) => {
      const ex = [-ny, nx, 0];
      const o0 = [cx + nx * half0 - ex[0] * half0, cy + ny * half0 - ex[1] * half0, z0 + 0.1];
      const es = [-nx * Math.cos(pitch), -ny * Math.cos(pitch), Math.sin(pitch)], en = [nx * Math.sin(pitch), ny * Math.sin(pitch), Math.cos(pitch)];
      gentengSurface(m, o0, ex, es, en, 2 * half0, Sl - 0.02, (s) => { const d = s * Math.cos(pitch); return [d, 2 * half0 - d]; }, { seed: seed + i, per: 4 });
      // lisplang
      const a = [cx + nx * half0 - ex[0] * half0, cy + ny * half0 - ex[1] * half0, z0];
      const b = [cx + nx * half0 + ex[0] * half0, cy + ny * half0 + ex[1] * half0, z0];
      beam(m, [a[0] + nx * 0.02, a[1] + ny * 0.02, z0 + 0.02], [b[0] + nx * 0.02, b[1] + ny * 0.02, z0 + 0.02], 0.03, 0.22, 'kayu_cat@4e7a5e');
    });
    // jurai
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bubungan(m, [cx + sx * half1, cy + sy * half1, z1 + 0.14], [cx + sx * half0, cy + sy * half0, z0 + 0.16]);
  };
  const c = S / 2, zr = fz + Hw;
  roofLimas(c, c, S / 2 + 0.9, 1.6, zr, zr + 2.0, 70);
  // dinding lambang sari (celah antara dua susun atap) dengan jendela angin
  const lz0 = zr + 1.9, lz1 = zr + 2.7, lh = 1.7;
  for (const [nx, ny] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const ex = [-ny, nx];
    const P0 = (u, z, d) => [c + nx * (lh + d) + ex[0] * u, c + ny * (lh + d) + ex[1] * u, z];
    quad(m, [P0(-lh, lz0, 0), P0(lh, lz0, 0), P0(lh, lz1, 0), P0(-lh, lz1, 0)], 'plester@eef0e6', [nx, ny, 0]);
    for (let k = -3; k <= 3; k++) quad(m, [P0(k * 0.4 - 0.12, lz0 + 0.2, 0.005), P0(k * 0.4 + 0.12, lz0 + 0.2, 0.005), P0(k * 0.4 + 0.12, lz1 - 0.2, 0.005), P0(k * 0.4 - 0.12, lz1 - 0.2, 0.005)], 'kaca_gelap', [nx, ny, 0]);
  }
  roofLimas(c, c, 2.4, 0.18, lz1 - 0.1, lz1 + 2.3, 80);
  // mustaka (mahkota) tembaga/kuningan di puncak
  const mz = lz1 + 2.3 + 0.1;
  const prof = [[0.22, 0], [0.24, 0.08], [0.16, 0.14], [0.2, 0.3], [0.12, 0.5], [0.05, 0.62], [0.03, 0.9], [0.0, 1.0]];
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, z0] = prof[i], [r1, z1] = prof[i + 1];
    const seg = 16;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
      quad(m, [[c + Math.cos(a0) * r0, c + Math.sin(a0) * r0, mz + z0], [c + Math.cos(a1) * r0, c + Math.sin(a1) * r0, mz + z0], [c + Math.cos(a1) * r1, c + Math.sin(a1) * r1, mz + z1], [c + Math.cos(a0) * r1, c + Math.sin(a0) * r1, mz + z1]], 'logam@b08a3a', [Math.cos(am), Math.sin(am), (r0 - r1) / Math.max(1e-3, z1 - z0) * 0.5], { soft: true, finish: 'metal' });
    }
  }
  // plafon ruang salat (eternit) di bawah atap
  quad(m, [[T / 2, T / 2, fz + Hw - 0.02], [S - T / 2, T / 2, fz + Hw - 0.02], [S - T / 2, S - T / 2, fz + Hw - 0.02], [T / 2, S - T / 2, fz + Hw - 0.02]], 'cat@f4f2ea', [0, 0, -1]);
  quad(m, [[T / 2, T / 2, fz + Hw - 0.01], [S - T / 2, T / 2, fz + Hw - 0.01], [S - T / 2, S - T / 2, fz + Hw - 0.01], [T / 2, S - T / 2, fz + Hw - 0.01]], 'kayu', [0, 0, 1]);
}
// tempat wudu: dinding keramik setinggi 1,4 m dengan deretan keran, bak/talang pembuangan di bawah, atap seng kecil
export function buildTempatWudu(m, o = {}) {
  const L = o.L ?? 3.0, n = o.n ?? 5;
  box(m, 0, 0, 0, L, 1.6, 0.12, 'plester@a8a498', { mats: { z1: 'keramik@c8d4d4' } });
  // dinding pipa belakang
  box(m, 0, 1.2, 0.12, L, 1.4, 1.5, 'keramik_dinding@dfe9ec', { mats: { z1: 'beton' } });
  // talang pembuangan (cekung) di depan dinding
  box(m, 0.05, 0.7, 0.12, L - 0.05, 1.2, 0.2, 'keramik@b8c6c8', { skip: ['z1'] });
  box(m, 0.05, 0.75, 0.12, L - 0.05, 1.15, 0.13, 'genangan', { skip: ['z0', 'x0', 'x1', 'y0', 'y1'] });
  box(m, 0.05, 0.68, 0.12, L - 0.05, 0.75, 0.32, 'keramik@b8c6c8');
  // pipa mendatar & keran
  cyl(m, [0.05, 1.18, 1.0], [L - 0.05, 1.18, 1.0], 0.022, 'plastik@d0d4d0', 10);
  for (let i = 0; i < n; i++) {
    const x = (L * (i + 0.5)) / n;
    cyl(m, [x, 1.18, 1.0], [x, 1.08, 1.0], 0.012, 'logam@c0c4c4', 8);
    cyl(m, [x, 1.08, 1.0], [x, 1.08, 0.92], 0.01, 'logam@c0c4c4', 8);
    box(m, x - 0.03, 1.075, 1.02, x + 0.03, 1.09, 1.03, 'logam@c0c4c4');
    // pijakan batu/keramik tempat kaki
    box(m, x - 0.15, 0.25, 0.12, x + 0.15, 0.5, 0.22, 'keramik@b0bcbc');
  }
  // atap seng di atas (tiang besi)
  const wave = (x) => 0.018 * Math.sin((x / 0.076) * Math.PI * 2);
  grid(m, Math.round((L + 0.4) / 0.076) * 3, 3, (s, t) => { const x = -0.2 + s * (L + 0.4); const y = -0.2 + t * 2.0; return [x, y, 2.35 + y * 0.12 + wave(x)]; }, 'seng', { hint: [0, -0.12, 1] });
  grid(m, Math.round((L + 0.4) / 0.076), 2, (s, t) => { const x = -0.2 + s * (L + 0.4); const y = -0.2 + t * 2.0; return [x, y, 2.335 + y * 0.12 + wave(x)]; }, 'seng@6a6a64', { hint: [0, 0.12, -1] });
  for (const x of [0.05, L - 0.05]) for (const y of [0.1, 1.5]) box(m, x - 0.03, y - 0.03, 0.12, x + 0.03, y + 0.03, 2.35 + y * 0.12, 'besi_karat');
  beam(m, [-0.2, 0.1, 2.33], [L + 0.2, 0.1, 2.33], 0.04, 0.04, 'besi_karat');
  beam(m, [-0.2, 1.5, 2.5], [L + 0.2, 1.5, 2.5], 0.04, 0.04, 'besi_karat');
}
// menara/tiang pengeras suara: tiang besi kisi 7 m + 3 corong (TOA) menghadap berbeda arah
export function buildMenaraToa(m, o = {}) {
  const Ht = o.H ?? 7.0, w = 0.35;
  box(m, -0.35, -0.35, 0, 0.35, 0.35, 0.3, 'beton');
  const legs = [[-w / 2, -w / 2], [w / 2, -w / 2], [w / 2, w / 2], [-w / 2, w / 2]];
  for (const [x, y] of legs) cyl(m, [x * 1.4, y * 1.4, 0.3], [x * 0.6, y * 0.6, Ht], 0.022, 'cat_kilap@d8dcd8', 8);
  for (let z = 0.6; z < Ht; z += 0.55) {
    const s = 1.4 - (0.8 * (z - 0.3)) / (Ht - 0.3);
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = legs[i], [bx, by] = legs[(i + 1) % 4];
      cyl(m, [ax * s, ay * s, z], [bx * s, by * s, z], 0.01, 'cat_kilap@d8dcd8', 6, { nocap: true });
      const s2 = 1.4 - (0.8 * (z + 0.55 - 0.3)) / (Ht - 0.3);
      if (z + 0.55 < Ht) cyl(m, [ax * s, ay * s, z], [bx * s2, by * s2, z + 0.55], 0.008, 'cat_kilap@d8dcd8', 6, { nocap: true });
    }
  }
  // corong pengeras suara (horn) ×3
  const horn = (az, el) => {
    const d = [Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el)];
    const base = [d[0] * 0.15, d[1] * 0.15, Ht - 0.1 + d[2] * 0.15];
    const prof = [[0.05, 0], [0.06, 0.1], [0.09, 0.25], [0.17, 0.42], [0.26, 0.5]];
    const A = new THREE.Vector3(...base), t = new THREE.Vector3(...d).normalize();
    const ref = new THREE.Vector3(0, 0, 1), x = new THREE.Vector3().crossVectors(ref, t).normalize(), y = new THREE.Vector3().crossVectors(t, x);
    const seg = 14;
    for (let i = 0; i < prof.length - 1; i++) {
      for (let k = 0; k < seg; k++) {
        const P2 = (pr, kk) => { const an = (kk / seg) * Math.PI * 2; return A.clone().addScaledVector(t, pr[1]).addScaledVector(x, Math.cos(an) * pr[0]).addScaledVector(y, Math.sin(an) * pr[0]).toArray(); };
        const an = ((k + 0.5) / seg) * Math.PI * 2;
        const nn = x.clone().multiplyScalar(Math.cos(an)).addScaledVector(y, Math.sin(an)).toArray();
        quad(m, [P2(prof[i], k), P2(prof[i], k + 1), P2(prof[i + 1], k + 1), P2(prof[i + 1], k)], 'cat_kilap@e8e8e0', nn, { soft: true });
        quad(m, [P2(prof[i], k), P2(prof[i + 1], k), P2(prof[i + 1], k + 1), P2(prof[i], k + 1)], 'cat@3a3a38', nn.map((v) => -v), { soft: true });
      }
    }
    cyl(m, A.clone().addScaledVector(t, -0.12).toArray(), A.toArray(), 0.07, 'cat_kilap@d0d0c8', 12);
  };
  horn(0, -0.25);
  horn((2 * Math.PI) / 3, -0.25);
  horn((-2 * Math.PI) / 3, -0.25);
  // kabel turun
  cyl(m, [0.05, 0.05, Ht - 0.2], [0.05, 0.05, 0.3], 0.006, 'kabel', 5, { nocap: true });
}

// ------------------------------------------------------------------ utilitas jalan
// tiang listrik beton bulat meruncing 9 m + palang besi siku, 3 isolator, kabel turun; o.trafo menambah trafo tabung
export function buildTiangListrikKampung(m, o = {}) {
  const Ht = o.H ?? 9.0, r0 = 0.15, r1 = 0.095, seg = 14;
  // batang (bentuk putar manual dengan cincin sambungan)
  const prof = [[r0 + 0.02, 0], [r0 + 0.02, 0.05], [r0, 0.06], [r0 - (r0 - r1) * 0.5, Ht * 0.5], [r1, Ht - 0.02], [r1 * 0.8, Ht]];
  for (let i = 0; i < prof.length - 1; i++) {
    const [ra, za] = prof[i], [rb, zb] = prof[i + 1];
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
      const mat = i === 0 ? 'beton_lumut' : 'beton@c8c6c0';
      quad(m, [[Math.cos(a0) * ra, Math.sin(a0) * ra, za], [Math.cos(a1) * ra, Math.sin(a1) * ra, za], [Math.cos(a1) * rb, Math.sin(a1) * rb, zb], [Math.cos(a0) * rb, Math.sin(a0) * rb, zb]], mat, [Math.cos(am), Math.sin(am), 0.02], { soft: true });
    }
  }
  quad(m, [...Array(seg)].map((_, k) => { const a = (k / seg) * Math.PI * 2; return [Math.cos(a) * r1 * 0.8, Math.sin(a) * r1 * 0.8, Ht]; }), 'beton', [0, 0, 1]);
  // garis cat penanda & pelat nomor
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
    const rA = r0 - (r0 - r1) * 0.5 * (1.2 / (Ht * 0.5)) + 0.002, rB = r0 - (r0 - r1) * 0.5 * (1.5 / (Ht * 0.5)) + 0.002;
    quad(m, [[Math.cos(a0) * rA, Math.sin(a0) * rA, 1.2], [Math.cos(a1) * rA, Math.sin(a1) * rA, 1.2], [Math.cos(a1) * rB, Math.sin(a1) * rB, 1.5], [Math.cos(a0) * rB, Math.sin(a0) * rB, 1.5]], k % 2 ? 'cat@c8382a' : 'cat@e8e4da', [Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0], { soft: true });
  }
  box(m, -0.09, -0.148, 2.0, 0.09, -0.136, 2.28, 'cat@e8e2cc');
  // palang (besi siku) + klem + penyangga miring
  const zc = Ht - 0.45;
  box(m, -0.85, -0.2, zc, 0.85, -0.13, zc + 0.07, 'besi_karat');
  box(m, -0.14, -0.2, zc - 0.05, 0.14, 0.14, zc + 0.12, 'besi_karat', { skip: ['y1'] });
  for (const sx of [-1, 1]) beam(m, [sx * 0.6, -0.165, zc], [sx * 0.08, -0.165, zc - 0.55], 0.04, 0.008, 'besi_karat');
  // isolator porselen (pin) di 3 titik
  for (const x of [-0.75, 0, 0.75]) {
    const xx = x === 0 ? 0 : x;
    const yy = x === 0 ? -0.16 : -0.165;
    const zz = x === 0 ? Ht + 0.0 : zc + 0.07;
    const iso = [[0.04, 0], [0.055, 0.04], [0.04, 0.06], [0.06, 0.1], [0.035, 0.13], [0.045, 0.16], [0.0, 0.19]];
    for (let i = 0; i < iso.length - 1; i++) for (let k = 0; k < 10; k++) {
      const a0 = (k / 10) * Math.PI * 2, a1 = ((k + 1) / 10) * Math.PI * 2;
      const [ra, za] = iso[i], [rb, zb] = iso[i + 1];
      quad(m, [[xx + Math.cos(a0) * ra, yy + Math.sin(a0) * ra, zz + za], [xx + Math.cos(a1) * ra, yy + Math.sin(a1) * ra, zz + za], [xx + Math.cos(a1) * rb, yy + Math.sin(a1) * rb, zz + zb], [xx + Math.cos(a0) * rb, yy + Math.sin(a0) * rb, zz + zb]], 'cat_kilap@d8d4c4', [Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0.2], { soft: true });
    }
  }
  // kabel turun (SR) ke rumah & kotak sambungan
  cyl(m, [0.1, -0.16, zc - 0.1], [0.12, -0.16, 3.2], 0.012, 'kabel', 6);
  box(m, 0.03, -0.27, 3.0, 0.21, -0.15, 3.32, 'plastik@c8c4b8');
  // kabel melilit / gulungan kabel sisa (khas kampung)
  for (let k = 0; k < 4; k++) {
    const z = 5.2 + k * 0.03;
    for (let a = 0; a < 12; a++) {
      const a0 = (a / 12) * Math.PI * 2, a1 = ((a + 1) / 12) * Math.PI * 2, R = r0 * 0.75 + 0.03;
      cyl(m, [Math.cos(a0) * R, Math.sin(a0) * R, z], [Math.cos(a1) * R, Math.sin(a1) * R, z + 0.0025], 0.007, 'kabel', 5, { nocap: true });
    }
  }
  if (o.trafo) {
    // trafo distribusi tabung di dudukan
    const tz = 5.6;
    box(m, -0.5, -0.65, tz - 0.06, 0.5, -0.15, tz, 'besi_karat');
    for (const sx of [-1, 1]) beam(m, [sx * 0.45, -0.6, tz - 0.06], [sx * 0.1, -0.16, tz - 0.6], 0.05, 0.05, 'besi_karat');
    const tc = [0, -0.42], tr = 0.24, th = 0.85;
    for (let k = 0; k < 16; k++) {
      const a0 = (k / 16) * Math.PI * 2, a1 = ((k + 1) / 16) * Math.PI * 2, am = (a0 + a1) / 2;
      quad(m, [[tc[0] + Math.cos(a0) * tr, tc[1] + Math.sin(a0) * tr, tz], [tc[0] + Math.cos(a1) * tr, tc[1] + Math.sin(a1) * tr, tz], [tc[0] + Math.cos(a1) * tr, tc[1] + Math.sin(a1) * tr, tz + th], [tc[0] + Math.cos(a0) * tr, tc[1] + Math.sin(a0) * tr, tz + th]], 'cat@8a9088', [Math.cos(am), Math.sin(am), 0], { soft: true });
    }
    quad(m, [...Array(16)].map((_, k) => { const a = (k / 16) * Math.PI * 2; return [tc[0] + Math.cos(a) * tr, tc[1] + Math.sin(a) * tr, tz + th]; }), 'cat@7a8078', [0, 0, 1]);
    for (let k = 0; k < 6; k++) box(m, tc[0] - 0.02 + (k - 2.5) * 0.07, tc[1] - tr - 0.06, tz + 0.1, tc[0] + 0.02 + (k - 2.5) * 0.07, tc[1] - tr + 0.02, tz + th - 0.1, 'cat@7a8078');
    for (const x of [-0.12, 0, 0.12]) cyl(m, [x, tc[1], tz + th], [x, tc[1], tz + th + 0.22], 0.025, 'cat_kilap@6a5040', 8);
  }
}
// lampu jalan: lengan pipa melengkung dipasang di tiang (titik asal = titik pasang di permukaan tiang, menjorok ke -Y),
// kap lampu dengan bohlam/neon. tipe 'neon' (putih) atau 'natrium' (oranye).
export function buildLampuJalan(m, o = {}) {
  const tipe = o.tipe || 'neon', Lr = 1.2;
  const pts = [[0, 0, 0], [0, -0.35, 0.18], [0, -0.8, 0.3], [0, -Lr, 0.28]];
  for (let i = 0; i < pts.length - 1; i++) cyl(m, pts[i], pts[i + 1], 0.024, 'cat_kilap@5a5e5c', 10, { nocap: i > 0 && i < pts.length - 2 });
  // klem ke tiang
  box(m, -0.07, -0.02, -0.07, 0.07, 0.03, 0.07, 'besi_karat');
  beam(m, [0, 0.01, -0.35], [0, -0.45, 0.16], 0.03, 0.006, 'besi_karat');
  // kap (rumah lampu) gaya cobra/tudung
  const hx = 0, hy = -Lr - 0.12, hz = 0.24;
  const kap = [[0.0, 0.1], [0.11, 0.08], [0.17, 0.02], [0.19, -0.04]];
  for (let i = 0; i < kap.length - 1; i++) for (let k = 0; k < 16; k++) {
    const a0 = (k / 16) * Math.PI * 2, a1 = ((k + 1) / 16) * Math.PI * 2;
    const [ra, za] = kap[i], [rb, zb] = kap[i + 1];
    const sy = 1.5;
    quad(m, [[hx + Math.cos(a0) * ra, hy + Math.sin(a0) * ra * sy, hz + za], [hx + Math.cos(a1) * ra, hy + Math.sin(a1) * ra * sy, hz + za], [hx + Math.cos(a1) * rb, hy + Math.sin(a1) * rb * sy, hz + zb], [hx + Math.cos(a0) * rb, hy + Math.sin(a0) * rb * sy, hz + zb]], 'cat_kilap@4a4e4c', [Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0.6], { soft: true });
    quad(m, [[hx + Math.cos(a0) * ra * 0.98, hy + Math.sin(a0) * ra * sy * 0.98, hz + za - 0.005], [hx + Math.cos(a0) * rb * 0.98, hy + Math.sin(a0) * rb * sy * 0.98, hz + zb - 0.005], [hx + Math.cos(a1) * rb * 0.98, hy + Math.sin(a1) * rb * sy * 0.98, hz + zb - 0.005], [hx + Math.cos(a1) * ra * 0.98, hy + Math.sin(a1) * ra * sy * 0.98, hz + za - 0.005]], 'reflektor', [0, 0, -1], { soft: true });
  }
  if (tipe === 'neon') {
    // tabung neon (bagian LAMPU_EMISI) melintang
    cyl(m, [hx, hy - 0.2, hz - 0.03], [hx, hy + 0.2, hz - 0.03], 0.016, 'lampu_neon', 10, { part: 'LAMPU_EMISI' });
  } else {
    const bl = [[0.0, 0.0], [0.05, -0.03], [0.055, -0.09], [0.035, -0.14], [0.0, -0.16]];
    for (let i = 0; i < bl.length - 1; i++) for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * Math.PI * 2, a1 = ((k + 1) / 12) * Math.PI * 2;
      const [ra, za] = bl[i], [rb, zb] = bl[i + 1];
      quad(m, [[hx + Math.cos(a0) * ra, hy + Math.sin(a0) * ra, hz + za], [hx + Math.cos(a0) * rb, hy + Math.sin(a0) * rb, hz + zb], [hx + Math.cos(a1) * rb, hy + Math.sin(a1) * rb, hz + zb], [hx + Math.cos(a1) * ra, hy + Math.sin(a1) * ra, hz + za]], 'lampu_natrium', [Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), -0.5], { soft: true, part: 'LAMPU_EMISI' });
    }
  }
}
// papan nama kampung pada dua tiang besi; muka papan memakai tekstur 'papan_nama' (UV 0..1 diatur di ekspor game)
export function buildPapanNama(m) {
  const W = 1.6, Hb = 0.8, z0 = 1.7;
  for (const x of [-W / 2 + 0.12, W / 2 - 0.12]) {
    cyl(m, [x, 0.03, 0], [x, 0.03, z0 + Hb + 0.05], 0.03, 'besi_karat', 10);
    box(m, x - 0.12, -0.09, 0, x + 0.12, 0.15, 0.12, 'beton_lumut');
  }
  box(m, -W / 2, -0.012, z0, W / 2, 0.0, z0 + Hb, 'besi_karat', { skip: ['y0'], part: 'PAPAN' });
  quad(m, [[-W / 2, -0.012, z0], [W / 2, -0.012, z0], [W / 2, -0.012, z0 + Hb], [-W / 2, -0.012, z0 + Hb]], 'papan_nama', [0, -1, 0], { part: 'PAPAN', uvFn: (q) => [(W / 2 - q[0]) / W, (q[2] - z0) / Hb] });
  box(m, -W / 2 - 0.02, -0.02, z0 - 0.02, W / 2 + 0.02, 0.005, z0, 'besi_karat');
  box(m, -W / 2 - 0.02, -0.02, z0 + Hb, W / 2 + 0.02, 0.005, z0 + Hb + 0.02, 'besi_karat');
}

// ------------------------------------------------------------------ pagar (panjang 2 m sepanjang +X, as di y = 0)
export function buildPagarBambuAnyam(m, o = {}) {
  const L = o.L ?? 2.0, Hp = 1.5;
  for (const x of [0.05, L / 2, L - 0.05]) cyl(m, [x, 0.05, -0.2], [x, 0.05, Hp + 0.12], 0.04, 'bambu_kering', 10);
  for (const z of [0.2, Hp - 0.1]) cyl(m, [0, 0.0, z], [L, 0.0, z], 0.022, 'bambu_kering', 8);
  // gedek anyaman (sedikit bergelombang & robek sebagian di bawah)
  grid(m, 12, 6, (s, t) => [s * L, -0.03 + 0.008 * Math.sin(s * 37) * Math.sin(t * 9), 0.08 + t * (Hp - 0.08)], 'anyaman_bambu', { hint: [0, -1, 0] });
  grid(m, 4, 2, (s, t) => [s * L, -0.022 + 0.008 * Math.sin(s * 37) * Math.sin(t * 9), 0.08 + t * (Hp - 0.08)], 'anyaman_bambu@a89870', { hint: [0, 1, 0] });
}
export function buildPagarBambuBelah(m, o = {}) {
  const L = o.L ?? 2.0, r = rng(o.seed ?? 21);
  for (const x of [0.04, L - 0.04]) cyl(m, [x, 0.04, -0.2], [x, 0.04, 1.35], 0.045, 'bambu_kering', 10);
  for (const z of [0.3, 0.95]) cyl(m, [0, 0.0, z], [L, 0.0, z], 0.025, 'bambu_kering', 8);
  for (let x = 0.1; x < L - 0.05; x += 0.11) {
    const h = 1.0 + r() * 0.25, lean = (r() - 0.5) * 0.04;
    // bilah bambu belah: setengah silinder pipih
    const seg = 5, w = 0.035;
    for (let k = 0; k < seg; k++) {
      const a0 = Math.PI * (k / seg), a1 = Math.PI * ((k + 1) / seg);
      quad(m, [[x + Math.cos(a0) * w, -0.03 - Math.sin(a0) * 0.012, 0.0], [x + Math.cos(a1) * w, -0.03 - Math.sin(a1) * 0.012, 0.0], [x + lean + Math.cos(a1) * w, -0.03 - Math.sin(a1) * 0.012, h], [x + lean + Math.cos(a0) * w, -0.03 - Math.sin(a0) * 0.012, h]], 'bambu_kering', [Math.cos((a0 + a1) / 2), -Math.sin((a0 + a1) / 2), 0], { soft: true });
    }
    quad(m, [[x - w, -0.03, 0], [x + w, -0.03, 0], [x + w + lean, -0.03, h], [x - w + lean, -0.03, h]], 'bambu_kering@a08a58', [0, 1, 0]);
    // ujung runcing
    quad(m, [[x - w + lean, -0.03, h], [x + w + lean, -0.03, h], [x + lean, -0.035, h + 0.08]], 'bambu_kering', [0, -1, 0.3]);
  }
}
export function buildPagarTembok(m, o = {}) {
  const L = o.L ?? 2.0, Hp = o.H ?? 1.6, T = 0.15, rusak = !!o.rusak;
  const r = rng(o.seed ?? 3);
  // badan tembok plester (bagian bata terbuka bila rusak)
  const mat = 'plester_lumut@d4cdb8';
  if (!rusak) box(m, 0.15, -T / 2, 0, L - 0.15, T / 2, Hp, mat, { mats: { z1: 'beton_lumut' } });
  else {
    box(m, 0.15, -T / 2, 0, L - 0.15, T / 2, Hp * 0.6, mat, { mats: { z1: 'bata' } });
    // tepi atas compang-camping (bata menonjol)
    for (let x = 0.15; x < L - 0.2; x += 0.23) {
      const h = Hp * 0.6 + r() * Hp * 0.35;
      box(m, x, -T / 2 + 0.01, Hp * 0.6, x + 0.22, T / 2 - 0.01, h, 'bata');
    }
    // bidang plester mengelupas memperlihatkan bata
    quad(m, [[0.6, -T / 2 - 0.002, 0.3], [1.3, -T / 2 - 0.002, 0.35], [1.2, -T / 2 - 0.002, 0.8], [0.7, -T / 2 - 0.002, 0.75]], 'bata', [0, -1, 0]);
  }
  if (!rusak) quad(m, [[0.5, -T / 2 - 0.002, 0.25], [1.1, -T / 2 - 0.002, 0.3], [1.0, -T / 2 - 0.002, 0.7], [0.55, -T / 2 - 0.002, 0.62]], 'bata', [0, -1, 0]);
  // pilar di kedua ujung (dipakai bersama modul tetangga; separuh lebar di tiap ujung)
  for (const x of [0, L]) {
    const a = x === 0 ? 0 : L - 0.15, b = x === 0 ? 0.15 : L;
    box(m, a, -0.11, 0, b, 0.11, Hp + 0.15, mat, { mats: { z1: 'beton_lumut' } });
  }
  // sloof bawah & kepala tembok (lis) menonjol
  if (!rusak) box(m, 0.15, -T / 2 - 0.025, Hp - 0.06, L - 0.15, T / 2 + 0.025, Hp, 'beton_lumut', { skip: ['z0'] });
  box(m, 0, -T / 2 - 0.02, 0, L, T / 2 + 0.02, 0.18, 'beton_lumut', { skip: ['z0'] });
}
export function buildPagarBesi(m, o = {}) {
  const L = o.L ?? 2.0, Hp = 1.4;
  box(m, 0, -0.1, 0, L, 0.1, 0.3, 'plester_lumut@c8c0aa', { mats: { z1: 'beton_lumut' } });
  for (const x of [0.03, L - 0.03]) box(m, x - 0.025, -0.025, 0.3, x + 0.025, 0.025, Hp + 0.3, 'besi_karat');
  for (const z of [0.38, Hp + 0.22]) box(m, 0, -0.015, z, L, 0.015, z + 0.03, 'besi_karat');
  // kawat harmonika (anyaman belah ketupat) – kisi diagonal
  const n = Math.round(L / 0.06);
  for (let i = -8; i < n + 8; i++) for (const dir of [1, -1]) {
    const x0 = i * 0.06, z0 = 0.4, z1 = Hp + 0.22;
    let xa = x0, xb = x0 + dir * (z1 - z0) * 0.5;
    let za = z0, zb = z1;
    // potong ke rentang [0, L]
    const clip = (x, z, xo, zo) => { if (x < 0) return [0, zo + ((z - zo) * (0 - xo)) / (x - xo)]; if (x > L) return [L, zo + ((z - zo) * (L - xo)) / (x - xo)]; return [x, z]; };
    if ((xa < 0 && xb < 0) || (xa > L && xb > L)) continue;
    [xb, zb] = clip(xb, zb, xa, za);
    [xa, za] = clip(xa, za, xb, zb);
    cyl(m, [xa, 0, za], [xb, 0, zb], 0.0025, 'besi_karat', 4, { nocap: true });
  }
}
// gerbang besi satu daun 1,2 m (engsel di x=0, INTERACT di gagang); bagian 'DAUN_GERBANG'
export function buildGerbangBesi(m, o = {}) {
  const W = o.W ?? 1.2, Hg = 1.5;
  const mat = 'cat_kilap@2f4a3a';
  box(m, 0, -0.02, 0.05, 0.04, 0.02, Hg, mat, { part: 'DAUN_GERBANG' });
  box(m, W - 0.04, -0.02, 0.05, W, 0.02, Hg, mat, { part: 'DAUN_GERBANG' });
  for (const z of [0.05, 0.75, Hg - 0.04]) box(m, 0, -0.02, z, W, 0.02, z + 0.04, mat, { part: 'DAUN_GERBANG' });
  for (let x = 0.12; x < W - 0.05; x += 0.1) {
    cyl(m, [x, 0, 0.09], [x, 0, Hg + 0.12], 0.008, mat, 6, { part: 'DAUN_GERBANG' });
    quad(m, [[x - 0.025, 0, Hg + 0.08], [x + 0.025, 0, Hg + 0.08], [x, 0, Hg + 0.18]], mat, [0, -1, 0], { part: 'DAUN_GERBANG' });
  }
  box(m, W - 0.12, -0.05, 0.95, W - 0.06, 0.05, 1.05, 'besi_karat', { part: 'DAUN_GERBANG' });
  // tiang engsel (pilar tembok) di x<0
  box(m, -0.3, -0.15, 0, 0.0, 0.15, Hg + 0.3, 'plester_lumut@d4cdb8', { mats: { z1: 'beton_lumut' } });
  box(m, -0.33, -0.18, Hg + 0.3, 0.03, 0.18, Hg + 0.38, 'beton_lumut');
}

// ------------------------------------------------------------------ parit, jembatan, gorong-gorong (sepanjang +X)
// parit beton U lebar dalam 0,5 m, dalam 0,6 m; bibir atas di z = 0; air keruh & lumpur di dasar
export function buildParit(m, o = {}) {
  const L = o.L ?? 2.0, w = 0.5, d = 0.6, t = 0.08;
  const yi = w / 2, yo = w / 2 + t;
  for (const s of [-1, 1]) {
    box(m, 0, s * yi, -d, L, s * yo, 0, 'beton_lumut', { mats: { z1: 'beton' } });
  }
  box(m, 0, -yo, -d - t, L, yo, -d, 'beton_lumut');
  // lumpur & air
  quad(m, [[0, -yi, -d + 0.06], [L, -yi, -d + 0.06], [L, yi, -d + 0.06], [0, yi, -d + 0.06]], 'tanah@5a4a3a', [0, 0, 1]);
  quad(m, [[0, -yi, -d + 0.12], [L, -yi, -d + 0.12], [L, yi, -d + 0.12], [0, yi, -d + 0.12]], 'genangan', [0, 0, 1], { part: 'AIR' });
  // garis lumut/air di dinding parit
  for (const s of [-1, 1]) quad(m, [[0, s * (yi - 0.002), -d + 0.12], [L, s * (yi - 0.002), -d + 0.12], [L, s * (yi - 0.002), -d + 0.3], [0, s * (yi - 0.002), -d + 0.3]], 'lumut', [0, -s, 0]);
}
// jembatan/plat beton di atas parit, lebar 1,5 m (sepanjang X), ruang kosong di bawah (untuk kejutan tangan dari kolong)
export function buildJembatanParit(m, o = {}) {
  const W = o.W ?? 1.5, span = 1.2, th = 0.12;
  box(m, 0, -span / 2, -th, W, span / 2, 0, 'beton_lumut', { mats: { z1: 'beton' } });
  // bibir/penahan kecil di tepi + retak
  for (const x of [0, W - 0.1]) box(m, x, -span / 2, 0, x + 0.1, span / 2, 0.08, 'beton_lumut');
  // dinding parit di bawah jembatan (supaya tersambung dengan modul parit; dalam 0,6, lebar 0,5)
  for (const s of [-1, 1]) box(m, 0, s * 0.25, -0.6, W, s * 0.33, -th, 'beton_lumut');
  box(m, 0, -0.33, -0.68, W, 0.33, -0.6, 'beton_lumut');
  quad(m, [[0, -0.25, -0.54], [W, -0.25, -0.54], [W, 0.25, -0.54], [0, 0.25, -0.54]], 'tanah@5a4a3a', [0, 0, 1]);
  quad(m, [[0, -0.25, -0.48], [W, -0.25, -0.48], [W, 0.25, -0.48], [0, 0.25, -0.48]], 'genangan', [0, 0, 1], { part: 'AIR' });
  quad(m, [[0, -0.25, -th - 0.002], [W, -0.25, -th - 0.002], [W, 0.25, -th - 0.002], [0, 0.25, -th - 0.002]], 'beton_lumut@5a5a50', [0, 0, -1]);
}
// gorong-gorong: pipa beton Ø0,8 m sepanjang L (melintang di bawah jalan) + dinding kepala di kedua ujung
export function buildGorongGorong(m, o = {}) {
  const L = o.L ?? 6.0, R = 0.4, t = 0.07, seg = 20, zc = -0.55;
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
    const P2 = (x, a, r) => [x, Math.cos(a) * r, zc + Math.sin(a) * r];
    quad(m, [P2(0, a0, R + t), P2(L, a0, R + t), P2(L, a1, R + t), P2(0, a1, R + t)], 'beton_lumut', [0, Math.cos(am), Math.sin(am)], { soft: true });
    quad(m, [P2(0, a0, R), P2(0, a1, R), P2(L, a1, R), P2(L, a0, R)], 'beton_lumut@6a6a5a', [0, -Math.cos(am), -Math.sin(am)], { soft: true });
    for (const x of [0, L]) quad(m, [P2(x, a0, R), P2(x, a1, R), P2(x, a1, R + t), P2(x, a0, R + t)], 'beton', [x === 0 ? -1 : 1, 0, 0]);
  }
  quad(m, [[0, -R * 0.8, zc - R * 0.6], [L, -R * 0.8, zc - R * 0.6], [L, R * 0.8, zc - R * 0.6], [0, R * 0.8, zc - R * 0.6]], 'tanah@4a3a2a', [0, 0, 1]);
  // dinding kepala (headwall) di kedua ujung dengan sayap
  for (const [x, s] of [[0, -1], [L, 1]]) {
    const x0 = s < 0 ? x - 0.2 : x, x1 = s < 0 ? x : x + 0.2;
    const zb = zc - R - t - 0.1, zt = 0.0;
    const hw = 0.9;
    // badan dinding dengan lubang lingkaran: rakit dari irisan mendatar
    const nz = 14;
    for (let i = 0; i < nz; i++) {
      const za = zb + ((zt - zb) * i) / nz, zbb = zb + ((zt - zb) * (i + 1)) / nz, zm = (za + zbb) / 2;
      const dz = zm - zc;
      if (Math.abs(dz) < R) {
        const hwid = Math.sqrt(R * R - dz * dz);
        box(m, x0, -hw, za, x1, -hwid, zbb, 'beton_lumut');
        box(m, x0, hwid, za, x1, hw, zbb, 'beton_lumut');
      } else box(m, x0, -hw, za, x1, hw, zbb, 'beton_lumut');
    }
  }
}

// ------------------------------------------------------------------ gerobak dorong kayu (roda dua, gagang)
export function buildGerobak(m, o = {}) {
  const L = 1.5, W = 0.9, z0 = 0.55;
  const kayu = 'papan_kayu@b8a080';
  // bak papan
  box(m, 0, -W / 2, z0, L, W / 2, z0 + 0.03, 'papan_lantai');
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) box(m, 0, s * W / 2 - (s > 0 ? 0.025 : 0), z0 + 0.03 + k * 0.17, L, s * W / 2 + (s < 0 ? 0.025 : 0), z0 + 0.03 + k * 0.17 + 0.15, kayu);
  for (const x of [0, L - 0.025]) for (let k = 0; k < 2; k++) box(m, x, -W / 2 + 0.025, z0 + 0.03 + k * 0.17, x + 0.025, W / 2 - 0.025, z0 + 0.03 + k * 0.17 + 0.15, kayu);
  // rangka bawah & gagang
  for (const s of [-1, 1]) {
    beam(m, [-0.05, s * 0.3, z0 - 0.04], [L + 0.75, s * 0.3, z0 + 0.25], 0.05, 0.06, 'kayu@6a4a32');
    box(m, L + 0.65, s * 0.3 - 0.03, z0 + 0.15, L + 0.8, s * 0.3 + 0.03, z0 + 0.3, 'karet');
    box(m, -0.02 + 0.1, s * 0.3 - 0.025, 0, 0.13, s * 0.3 + 0.025, z0 - 0.04, 'kayu@6a4a32');
  }
  // as & roda (ban karet + velg besi berjari)
  const rx = L * 0.62, R = 0.3;
  cyl(m, [rx, -W / 2 - 0.12, R], [rx, W / 2 + 0.12, R], 0.02, 'besi_karat', 8);
  for (const s of [-1, 1]) {
    const y = s * (W / 2 + 0.08);
    const seg = 20;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
      const P2 = (a, r, yy) => [rx + Math.cos(a) * r, yy, R + Math.sin(a) * r];
      quad(m, [P2(a0, R, y - 0.04), P2(a1, R, y - 0.04), P2(a1, R, y + 0.04), P2(a0, R, y + 0.04)], 'karet', [Math.cos(am), 0, Math.sin(am)], { soft: true });
      for (const yy of [y - 0.04, y + 0.04]) quad(m, [P2(a0, R, yy), P2(a1, R, yy), P2(a1, R - 0.05, yy), P2(a0, R - 0.05, yy)], 'karet', [0, yy < y ? -1 : 1, 0]);
    }
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; beam(m, [rx, y, R], [rx + Math.cos(a) * (R - 0.05), y, R + Math.sin(a) * (R - 0.05)], 0.012, 0.012, 'besi_karat'); }
  }
}

// ------------------------------------------------------------------ daftar pustaka
const REG = {
  km_dinding_a_1m: ['Dinding bata plester 1 m', (m) => buildDinding(m, { L: 1, style: 'A' })],
  km_dinding_a_2m: ['Dinding bata plester 2 m', (m) => buildDinding(m, { L: 2, style: 'A' })],
  km_dinding_b_2m: ['Dinding papan kayu 2 m', (m) => buildDinding(m, { L: 2, style: 'B' })],
  km_dinding_c_2m: ['Dinding setengah bata-setengah papan 2 m', (m) => buildDinding(m, { L: 2, style: 'C' })],
  km_dinding_b_1m: ['Dinding papan kayu 1 m', (m) => buildDinding(m, { L: 1, style: 'B' })],
  km_dinding_c_1m: ['Dinding setengah bata-papan 1 m', (m) => buildDinding(m, { L: 1, style: 'C' })],
  km_jendela_a: ['Dinding berjendela (bata plester) 2 m', (m) => buildDinding(m, { L: 2, style: 'A', open: 'window' })],
  km_jendela_b: ['Dinding berjendela (papan kayu) 2 m', (m) => buildDinding(m, { L: 2, style: 'B', open: 'window' })],
  km_jendela_c: ['Dinding berjendela (setengah bata) 2 m', (m) => buildDinding(m, { L: 2, style: 'C', open: 'window' })],
  km_pintu_a: ['Dinding berpintu (bata plester) 1,5 m', (m) => buildDinding(m, { L: 1.5, style: 'A', open: 'door' })],
  km_pintu_b: ['Dinding berpintu (papan kayu) 1,5 m', (m) => buildDinding(m, { L: 1.5, style: 'B', open: 'door' })],
  km_pintu_c: ['Dinding berpintu (setengah bata) 1,5 m', (m) => buildDinding(m, { L: 1.5, style: 'C', open: 'door' })],
  km_daun_pintu: ['Daun pintu panel kayu', (m) => buildDaunPintu(m)],
  km_daun_pintu_hijau: ['Daun pintu panel kayu (hijau)', (m) => buildDaunPintu(m, { mat: 'kayu_cat@6f8f5a' })],
  km_daun_pintu_coklat: ['Daun pintu panel kayu (cokelat)', (m) => buildDaunPintu(m, { mat: 'kayu_cat@8a5a44' })],
  km_pintu_geser: ['Pintu papan geser (dapur/gudang)', (m) => buildPintuGeser(m)],
  km_pintu_km: ['Pintu kamar mandi PVC', (m) => buildPintuKM(m)],
  km_lantai_teraso: ['Lantai teraso 2x2 m', (m) => buildLantai(m, { mat: 'teraso' })],
  km_lantai_keramik: ['Lantai keramik 30x30 2x2 m', (m) => buildLantai(m, { mat: 'keramik' })],
  km_lantai_semen: ['Lantai semen 2x2 m', (m) => buildLantai(m, { mat: 'beton@b8b4ac' })],
  km_plafon_eternit: ['Plafon eternit 2x2 m', (m) => buildPlafon(m, { step: 0.5 })],
  km_plafon_triplek: ['Plafon triplek 2x2 m (bernoda)', (m) => buildPlafon(m, { mat: 'kayu@d6bf98', step: 1.0, list: 'kayu@a88a68', noda: true })],
  km_atap_miring: ['Atap genteng: bidang miring 2 m', (m) => buildAtapMiring(m)],
  km_atap_bubungan: ['Atap genteng: bubungan 2 m', (m) => buildBubungan(m)],
  km_atap_gevel: ['Atap genteng: gevel (ujung pelana) 6 m', (m) => buildGevel(m)],
  km_atap_limasan_ujung: ['Atap genteng: ujung limasan 6 m', (m) => buildLimasanUjung(m)],
  km_pondasi: ['Pondasi batu kali 2 m', (m) => buildPondasi(m)],
  km_umpak: ['Umpak batu', (m) => buildUmpak(m)],
  km_tiang_teras: ['Tiang teras kayu + umpak', (m) => buildTiangTeras(m)],
  km_teras_lantai: ['Lantai teras keramik + anak tangga', (m) => buildTerasLantai(m)],
  km_kanopi_seng: ['Kanopi seng 2 m', (m) => buildKanopiSeng(m)],
  km_kolom_sudut: ['Kolom sudut plester', (m) => buildKolomSudut(m)],
  km_pos_ronda: ['Pos ronda (atap genteng)', (m) => buildPosRonda(m)],
  km_pos_ronda_seng: ['Pos ronda (atap seng)', (m) => buildPosRonda(m, { atap: 'seng' })],
  km_warung: ['Warung (etalase, rolling door, kanopi)', (m) => buildWarung(m)],
  km_masjid: ['Masjid kecil beratap tumpang', (m) => buildMasjid(m)],
  km_tempat_wudu: ['Tempat wudu (5 keran)', (m) => buildTempatWudu(m)],
  km_menara_toa: ['Menara pengeras suara', (m) => buildMenaraToa(m)],
  km_tiang_listrik: ['Tiang listrik beton + palang', (m) => buildTiangListrikKampung(m)],
  km_tiang_trafo: ['Tiang listrik + trafo', (m) => buildTiangListrikKampung(m, { trafo: true })],
  km_lampu_neon: ['Lampu jalan neon (lengan)', (m) => buildLampuJalan(m, { tipe: 'neon' })],
  km_lampu_natrium: ['Lampu jalan natrium (lengan)', (m) => buildLampuJalan(m, { tipe: 'natrium' })],
  km_papan_nama: ['Papan nama kampung', (m) => buildPapanNama(m)],
  km_pagar_bambu_anyam: ['Pagar bambu anyam (gedek) 2 m', (m) => buildPagarBambuAnyam(m)],
  km_pagar_bambu_belah: ['Pagar bambu belah 2 m', (m) => buildPagarBambuBelah(m)],
  km_pagar_tembok: ['Pagar tembok bata plester 2 m', (m) => buildPagarTembok(m)],
  km_pagar_tembok_rusak: ['Pagar tembok rusak 2 m', (m) => buildPagarTembok(m, { rusak: true })],
  km_pagar_besi: ['Pagar besi kawat 2 m', (m) => buildPagarBesi(m)],
  km_gerbang_besi: ['Gerbang besi + pilar', (m) => buildGerbangBesi(m)],
  km_parit: ['Parit beton 2 m', (m) => buildParit(m)],
  km_jembatan_parit: ['Jembatan plat parit 1,5 m', (m) => buildJembatanParit(m)],
  km_gorong_gorong: ['Gorong-gorong beton 6 m', (m) => buildGorongGorong(m)],
  km_gerobak: ['Gerobak dorong kayu', (m) => buildGerobak(m)],
};
for (const [k, [name, build]] of Object.entries(REG)) LIBRARY[k] = { name, icon: '🏘️', grp: 'kampung', build };
export const KAMPUNG_KEYS = Object.keys(REG);
