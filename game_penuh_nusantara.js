// Komponen tambahan untuk game penuh "Malam Jumat di Kampung Mati" (kerangka G1b) — bisa dipakai di SketchClone.
// Balai desa, makam desa, sawah & kali, penggilingan tebu: kentongan besar gantung, papan pengumuman, nisan 8 bentuk
// (kayu, kayu baru tanpa tulisan, semen bulat, keramik putih, batu kali, nisan anak, nisan bertulisan, kembar), kijing,
// keranda bambu, orang-orangan sawah, patok tanah cat merah, roda pintu air, rel lori + lori tebu.
// Nama pada nisan/papan fiktif. Hormat: tidak ada makam rusak/terbongkar, tidak ada simbol agama.
//
// Konvensi sama dengan kampung.js: f.mat = kunci bahan PBR game; koordinat lokal alas z = 0, depan menghadap -Y;
// fungsi bantu memakai sumbu X "game" (dibalik ke -X SketchClone) sehingga sesuai pipeline ekspor sk_to_glb.mjs.
import * as THREE from 'three';
import * as G from './geometry.js';
import { LIBRARY } from './library.js';

const DISP = {
  kayu: ['#7a5534', 'b:kayu'], kayu_tua: ['#5a4632', 'b:kayu'], kayu_nangka: ['#9a6a34', 'b:kayu'], bambu: ['#a8945c'],
  bambu_kering: ['#b59e62'], beton: ['#9c9a95', 'b:beton'], beton_lumut: ['#7a7c68', 'b:beton'], plester: ['#d8d2c2'],
  keramik: ['#eceae4', 'b:ubin'], batu: ['#77736a', 'b:batu'], besi_karat: ['#6e5a4a'], logam: ['#8d9396'], cat_merah: ['#a8322a'],
  cat_hijau: ['#4f6b4a'], papan_tulis: ['#2c3a30'], kertas: ['#e8e2cf'], kain: ['#8c8270'], kaos: ['#b0a490'], caping: ['#c8a868'],
  plastik: ['#d8d8d0'], tali: ['#8a7a5a'], karet: ['#222222'], tanah: ['#5a4632'],
};
function dispOf(mat) {
  const [base, tint] = mat.split('@');
  const d = DISP[base] || ['#bbbbbb'];
  return { color: tint ? '#' + tint : d[0], tex: d[1] || null };
}
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
  m.faces.push(f);
  return f;
}
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
// balok bertepi tumpul sederhana (chamfer c) — agar nisan/papan tidak terlihat kotak polos
function rbox(m, x0, y0, z0, x1, y1, z1, c, mat, o = {}) {
  const cs = [[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]];
  prism(m, cs, z0, z1, mat, o);
}
// prisma tegak dari poligon cembung (x,y) antara z0..z1 (+ tutup)
function prism(m, poly, z0, z1, mat, o = {}) {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const nx = b[1] - a[1], ny = -(b[0] - a[0]);
    quad(m, [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]], mat, [nx, ny, 0], o);
  }
  if (!o.nobot) quad(m, poly.map(([x, y]) => [x, y, z0]).reverse(), mat, [0, 0, -1], o);
  quad(m, poly.map(([x, y]) => [x, y, z1]), o.topMat || mat, [0, 0, 1], { ...o, part: o.topPart || o.part });
}
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
// benda putar di sekitar sumbu Z: profil [[r, z], ...]
function lathe(m, c, prof, mat, seg = 18, o = {}) {
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, z0] = prof[i], [r1, z1] = prof[i + 1];
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
      const p = (r, z, a) => [c[0] + r * Math.cos(a) * (o.sx ?? 1), c[1] + r * Math.sin(a) * (o.sy ?? 1), c[2] + z];
      const pts = [p(r0, z0, a0), p(r0, z0, a1), p(r1, z1, a1), p(r1, z1, a0)].filter((q, j, arr) => arr.findIndex((w) => w.every((v, n) => Math.abs(v - q[n]) < 1e-9)) === j);
      if (pts.length < 3) continue;
      quad(m, pts, mat, [Math.cos(am) * (z1 - z0), Math.sin(am) * (z1 - z0), -(r1 - r0)], { ...o, soft: true });
    }
  }
}
const rng = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

// ------------------------------------------------------------------ balai desa
export function buildKentonganBesar(m) {
  // gantungan: dua tiang kayu + palang, kentongan kayu nangka 1,3 m tergantung tali, celah memanjang, pemukul
  for (const x of [-0.75, 0.75]) box(m, x - 0.05, -0.05, 0, x + 0.05, 0.05, 2.3, 'kayu_tua');
  box(m, -0.85, -0.06, 2.3, 0.85, 0.06, 2.42, 'kayu_tua');
  for (const x of [-0.4, 0.4]) cyl(m, [x, 0, 2.3], [x, 0, 2.0], 0.012, 'tali', 6);
  // badan kentongan: tabung horizontal dari x -0.65..0.65, diameter 0.32
  const seg = 16, R = 0.16, zc = 1.84;
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    if (Math.abs(Math.sin(am) + 1) < 0.08 && Math.cos(am) > -0.5) continue; // celah depan
    const q = (x, a) => [x, Math.sin(a) * R, zc + Math.cos(a) * R];
    quad(m, [q(-0.65, a0), q(0.65, a0), q(0.65, a1), q(-0.65, a1)], 'kayu_nangka', [0, Math.sin(am), Math.cos(am)], { soft: true });
  }
  for (const x of [-0.65, 0.65]) {
    const ring = [...Array(seg)].map((_, k) => { const a = (k / seg) * Math.PI * 2; return [x, Math.sin(a) * R, zc + Math.cos(a) * R]; });
    quad(m, x < 0 ? ring.slice().reverse() : ring, 'kayu_nangka', [Math.sign(x), 0, 0]);
  }
  box(m, -0.5, -R - 0.002, zc - 0.03, 0.5, -R + 0.01, zc + 0.03, 'kayu_tua', { part: 'CELAH' });
  cyl(m, [0.85, -0.12, 1.2], [0.95, -0.12, 1.75], 0.025, 'kayu', 8, { part: 'PEMUKUL' });
}
export function buildPapanPengumuman(m) {
  for (const x of [-0.65, 0.65]) box(m, x - 0.04, -0.04, 0, x + 0.04, 0.04, 2.0, 'kayu_tua');
  rbox(m, -0.75, -0.05, 1.0, 0.75, 0.0, 1.9, 0.02, 'kayu');
  box(m, -0.7, -0.056, 1.05, 0.7, -0.05, 1.85, 'papan_tulis', { part: 'TEXT' });
  // atap kecil seng di atas papan
  quad(m, [[-0.85, -0.2, 1.98], [0.85, -0.2, 1.98], [0.85, 0.15, 2.08], [-0.85, 0.15, 2.08]], 'besi_karat', [0, -0.3, 1]);
  quad(m, [[-0.85, -0.2, 1.97], [-0.85, 0.15, 2.07], [0.85, 0.15, 2.07], [0.85, -0.2, 1.97]], 'besi_karat', [0, 0.3, -1]);
  // kertas pengumuman tertempel (fiktif)
  const r = rng(7);
  for (let i = 0; i < 4; i++) {
    const x = -0.55 + i * 0.32 + r() * 0.05, z = 1.35 + r() * 0.3;
    box(m, x - 0.1, -0.06, z - 0.14, x + 0.1, -0.057, z + 0.14, 'kertas', { part: 'KERTAS_' + i });
  }
}

// ------------------------------------------------------------------ makam desa
function nisanKepala(m, x, y, o) {
  const t = o.t ?? 0.05, w = o.w ?? 0.2, h = o.h ?? 0.55, mat = o.mat ?? 'beton';
  if (o.bentuk === 'bulat') {
    const poly = [];
    for (let i = 0; i <= 10; i++) { const a = Math.PI * i / 10; poly.push([x + Math.cos(a) * w / 2, h - w / 2 + Math.sin(a) * w / 2]); }
    poly.push([x - w / 2, 0], [x + w / 2, 0]);
    // poligon pada bidang XZ diekstrusi sepanjang Y
    const pts = poly.slice(0, 11).concat([[x - w / 2, 0], [x + w / 2, 0]]);
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      quad(m, [[a[0], y - t / 2, a[1]], [b[0], y - t / 2, b[1]], [b[0], y + t / 2, b[1]], [a[0], y + t / 2, a[1]]], mat, [b[1] - a[1], 0, -(b[0] - a[0])], { soft: true });
    }
    quad(m, pts.map(([u, v]) => [u, y - t / 2, v]), mat, [0, -1, 0], { part: o.part });
    quad(m, pts.map(([u, v]) => [u, y + t / 2, v]).reverse(), mat, [0, 1, 0]);
  } else {
    rbox(m, x - w / 2, y - t / 2, 0, x + w / 2, y + t / 2, h, 0.012, mat, { topPart: o.part });
    if (o.part) box(m, x - w / 2 + 0.02, y - t / 2 - 0.003, h * 0.3, x + w / 2 - 0.02, y - t / 2, h * 0.85, mat, { part: o.part });
  }
}
function gundukan(m, L, W, h, mat = 'tanah') {
  // gundukan tanah memanjang (penampang lengkung)
  const ns = 8;
  for (let i = 0; i < ns; i++) {
    const a0 = Math.PI * i / ns, a1 = Math.PI * (i + 1) / ns;
    const p = (a, y) => [Math.cos(a) * W / 2, y, Math.sin(a) * h];
    quad(m, [p(a0, -L / 2), p(a1, -L / 2), p(a1, L / 2), p(a0, L / 2)].map(([x, y, z]) => [x, y, z]), mat, [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)], { soft: true });
  }
}
export function buildNisan(m, o = {}) {
  const v = o.varian || 'semen';
  if (v === 'kayu' || v === 'kayu_baru') {
    gundukan(m, 1.8, 0.7, v === 'kayu_baru' ? 0.22 : 0.12);
    for (const y of [-0.85, 0.85]) {
      box(m, -0.06, y - 0.02, 0, 0.06, y + 0.02, v === 'kayu_baru' ? 0.62 : 0.5, v === 'kayu_baru' ? 'kayu' : 'kayu_tua');
      // puncak runcing
      const z = v === 'kayu_baru' ? 0.62 : 0.5;
      quad(m, [[-0.06, y - 0.021, z], [0.06, y - 0.021, z], [0, y - 0.021, z + 0.07]], 'kayu', [0, -1, 0]);
      quad(m, [[0.06, y + 0.021, z], [-0.06, y + 0.021, z], [0, y + 0.021, z + 0.07]], 'kayu', [0, 1, 0]);
    }
  } else if (v === 'batu') {
    gundukan(m, 1.8, 0.7, 0.12);
    const r = rng(3);
    for (const y of [-0.85, 0.85]) lathe(m, [0, y, 0], [[0.13, 0], [0.15, 0.1], [0.12 + r() * 0.02, 0.22], [0.06, 0.3], [0, 0.32]], 'batu', 9, { sx: 1, sy: 0.7 });
  } else if (v === 'anak') {
    gundukan(m, 1.0, 0.45, 0.1);
    for (const y of [-0.48, 0.48]) nisanKepala(m, 0, y, { w: 0.14, h: 0.32, bentuk: 'bulat', mat: 'keramik', part: y < 0 ? 'TEXT' : null });
  } else if (v === 'keramik') {
    box(m, -0.4, -0.95, 0, 0.4, 0.95, 0.18, 'keramik');
    for (const y of [-0.92, 0.92]) nisanKepala(m, 0, y, { w: 0.24, h: 0.6, mat: 'keramik', part: y < 0 ? 'TEXT' : null });
  } else if (v === 'tulisan') {
    gundukan(m, 1.8, 0.7, 0.12);
    for (const y of [-0.85, 0.85]) nisanKepala(m, 0, y, { w: 0.22, h: 0.55, mat: 'beton', part: y < 0 ? 'TEXT' : null });
  } else if (v === 'kembar') {
    box(m, -0.75, -0.95, 0, 0.75, 0.95, 0.15, 'beton_lumut');
    for (const x of [-0.37, 0.37]) for (const y of [-0.9, 0.9]) nisanKepala(m, x, y, { w: 0.2, h: 0.5, bentuk: 'bulat', mat: 'beton_lumut' });
  } else {
    gundukan(m, 1.8, 0.7, 0.12);
    for (const y of [-0.85, 0.85]) nisanKepala(m, 0, y, { w: 0.22, h: 0.55, bentuk: 'bulat', mat: 'beton' });
  }
}
export function buildKijing(m) {
  // kijing semen berundak dua + nisan kepala
  box(m, -0.5, -1.05, 0, 0.5, 1.05, 0.15, 'beton');
  box(m, -0.4, -0.95, 0.15, 0.4, 0.95, 0.27, 'beton', { mats: { z1: 'tanah' } });
  for (const y of [-0.9, 0.9]) nisanKepala(m, 0, y, { w: 0.24, h: 0.65, mat: 'beton', part: y < 0 ? 'TEXT' : null });
}
export function buildKerandaBambu(m) {
  // keranda bambu terbuka (tanpa penutup): dua pikulan panjang, alas bilah, rangka sisi rendah
  for (const x of [-0.3, 0.3]) cyl(m, [x, -1.25, 0.55], [x, 1.25, 0.55], 0.03, 'bambu_kering', 10);
  for (let i = 0; i < 9; i++) { const y = -0.9 + i * 0.225; cyl(m, [-0.32, y, 0.57], [0.32, y, 0.57], 0.018, 'bambu_kering', 8); }
  for (const x of [-0.3, 0.3]) cyl(m, [x, -0.95, 0.75], [x, 0.95, 0.75], 0.016, 'bambu_kering', 8);
  for (const y of [-0.95, -0.3, 0.3, 0.95]) for (const x of [-0.3, 0.3]) cyl(m, [x, y, 0.55], [x, y, 0.76], 0.014, 'bambu_kering', 6);
  for (const [x, y] of [[-0.3, -0.95], [0.3, -0.95], [-0.3, 0.95], [0.3, 0.95]]) cyl(m, [x, y, 0], [x, y, 0.55], 0.02, 'bambu_kering', 8);
}

// ------------------------------------------------------------------ sawah & kali
export function buildOrangOrangan(m, o = {}) {
  const v = o.varian ?? 0;
  cyl(m, [0, 0, 0], [0, 0, 1.8], 0.025, 'bambu_kering', 8);
  cyl(m, [-0.6, 0, 1.35], [0.6, 0, 1.35], 0.02, 'bambu_kering', 8);
  // kepala karung + caping
  lathe(m, [0, 0, 1.55], [[0, 0], [0.1, 0.03], [0.12, 0.12], [0.09, 0.22], [0, 0.25]], 'kain', 10);
  if (v !== 2) lathe(m, [0, 0, 1.76], [[0.3, 0], [0.28, 0.012], [0.13, 0.08], [0.02, 0.15], [0, 0.155]], 'caping', 16);
  // kaos lusuh menggantung pada palang (dua lembar depan/belakang bergelombang)
  for (const s of [-1, 1]) {
    const y = 0.035 * s;
    const pts = [];
    for (let i = 0; i <= 6; i++) { const x = -0.45 + 0.9 * i / 6; pts.push([x, y + 0.01 * Math.sin(i * 1.7) * s, 1.35]); }
    for (let i = 0; i < 6; i++) {
      const a = pts[i], b = pts[i + 1], low = (x) => (Math.abs(x) < 0.25 ? 0.8 : 1.15) + 0.03 * Math.sin(x * 9);
      quad(m, [[a[0], a[1], low(a[0])], [b[0], b[1], low(b[0])], b, a], 'kaos' + (v === 1 ? '@7a3a30' : ''), [0, s, 0], { soft: true });
    }
  }
  // tali plastik berkibar
  for (let i = 0; i < 3; i++) quad(m, [[0.6, 0, 1.36 - i * 0.04], [0.6, 0, 1.33 - i * 0.04], [0.85 + i * 0.05, 0.05, 1.2 - i * 0.05]], 'plastik', [0, -1, 0]);
}
export function buildPatokMerah(m) {
  box(m, -0.03, -0.03, 0, 0.03, 0.03, 0.55, 'kayu', { skip: ['z1'] });
  quad(m, [[-0.03, -0.03, 0.55], [0.03, -0.03, 0.55], [0, 0, 0.62]], 'cat_merah', [0, -1, 0.3]);
  quad(m, [[0.03, -0.03, 0.55], [0.03, 0.03, 0.55], [0, 0, 0.62]], 'cat_merah', [1, 0, 0.3]);
  quad(m, [[0.03, 0.03, 0.55], [-0.03, 0.03, 0.55], [0, 0, 0.62]], 'cat_merah', [0, 1, 0.3]);
  quad(m, [[-0.03, 0.03, 0.55], [-0.03, -0.03, 0.55], [0, 0, 0.62]], 'cat_merah', [-1, 0, 0.3]);
  box(m, -0.032, -0.032, 0.42, 0.032, 0.032, 0.55, 'cat_merah', { skip: ['z0', 'z1'] });
}
export function buildRodaPintuAir(m) {
  // tiang ulir + roda kemudi besi berjari 6 (roda terpisah: part RODA)
  box(m, -0.12, -0.12, 0, 0.12, 0.12, 0.9, 'besi_karat');
  cyl(m, [0, 0, 0.9], [0, 0, 1.25], 0.025, 'logam', 8);
  const R = 0.32, z = 1.1;
  for (let k = 0; k < 24; k++) {
    const a0 = k / 24 * Math.PI * 2, a1 = (k + 1) / 24 * Math.PI * 2;
    cyl(m, [Math.cos(a0) * R, Math.sin(a0) * R, z], [Math.cos(a1) * R, Math.sin(a1) * R, z], 0.018, 'besi_karat', 6, { nocap: true, part: 'RODA' });
  }
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; cyl(m, [0, 0, z], [Math.cos(a) * R, Math.sin(a) * R, z], 0.012, 'besi_karat', 6, { part: 'RODA' }); }
}

// ------------------------------------------------------------------ penggilingan
export function buildRelLori(m, o = {}) {
  const L = o.panjang ?? 2;
  for (let i = 0; i < Math.round(L / 0.5); i++) { const y = -L / 2 + 0.25 + i * 0.5; rbox(m, -0.45, y - 0.08, 0, 0.45, y + 0.08, 0.1, 0.01, 'kayu_tua'); }
  for (const x of [-0.3, 0.3]) {
    box(m, x - 0.03, -L / 2, 0.1, x + 0.03, L / 2, 0.112, 'besi_karat');
    box(m, x - 0.008, -L / 2, 0.112, x + 0.008, L / 2, 0.16, 'besi_karat');
    box(m, x - 0.022, -L / 2, 0.16, x + 0.022, L / 2, 0.175, 'logam');
  }
}
export function buildLoriTebu(m) {
  // rangka besi, 4 roda berflens (flens menyentuh z = 0) untuk rel 0,6 m, tiang pembatas tebu
  for (const y of [-0.55, 0.55]) for (const x of [-0.3, 0.3]) {
    cyl(m, [x - 0.05, y, 0.18], [x + 0.05, y, 0.18], 0.15, 'besi_karat', 14);
    cyl(m, [x + (x < 0 ? 0.05 : -0.06), y, 0.18], [x + (x < 0 ? 0.06 : -0.05), y, 0.18], 0.18, 'besi_karat', 14);
  }
  for (const y of [-0.55, 0.55]) cyl(m, [-0.42, y, 0.18], [0.42, y, 0.18], 0.03, 'logam', 8);
  box(m, -0.55, -0.9, 0.34, 0.55, 0.9, 0.46, 'besi_karat');
  rbox(m, -0.6, -0.95, 0.46, 0.6, 0.95, 0.52, 0.01, 'kayu_tua');
  for (const x of [-0.56, 0.56]) for (const y of [-0.85, 0, 0.85]) box(m, x - 0.025, y - 0.025, 0.52, x + 0.025, y + 0.025, 1.46, 'besi_karat');
  for (const s of [-1, 1]) box(m, -0.6, s * 0.97 - 0.02, 0.36, 0.6, s * 0.97 + 0.02, 0.42, 'besi_karat');
}

const REG = {
  gp_kentongan_besar: ['Kentongan besar gantung (balai desa)', (m) => buildKentonganBesar(m)],
  gp_papan_pengumuman: ['Papan pengumuman desa', (m) => buildPapanPengumuman(m)],
  gp_nisan_semen: ['Nisan semen bulat + gundukan', (m) => buildNisan(m, { varian: 'semen' })],
  gp_nisan_kayu: ['Nisan kayu tua tanpa tulisan', (m) => buildNisan(m, { varian: 'kayu' })],
  gp_nisan_kayu_baru: ['Nisan kayu baru tanpa tulisan', (m) => buildNisan(m, { varian: 'kayu_baru' })],
  gp_nisan_batu: ['Nisan batu kali', (m) => buildNisan(m, { varian: 'batu' })],
  gp_nisan_keramik: ['Makam keramik putih', (m) => buildNisan(m, { varian: 'keramik' })],
  gp_nisan_anak: ['Nisan anak kecil', (m) => buildNisan(m, { varian: 'anak' })],
  gp_nisan_tulisan: ['Nisan bertulisan (nama fiktif)', (m) => buildNisan(m, { varian: 'tulisan' })],
  gp_nisan_kembar: ['Makam kembar berlumut', (m) => buildNisan(m, { varian: 'kembar' })],
  gp_kijing: ['Kijing semen berundak', (m) => buildKijing(m)],
  gp_keranda_bambu: ['Keranda bambu tua (terbuka)', (m) => buildKerandaBambu(m)],
  gp_orang_orangan_caping: ['Orang-orangan sawah bercaping', (m) => buildOrangOrangan(m, { varian: 0 })],
  gp_orang_orangan_kaos: ['Orang-orangan sawah kaos merah', (m) => buildOrangOrangan(m, { varian: 1 })],
  gp_orang_orangan_karung: ['Orang-orangan sawah kepala karung', (m) => buildOrangOrangan(m, { varian: 2 })],
  gp_patok_merah: ['Patok tanah cat merah', (m) => buildPatokMerah(m)],
  gp_roda_pintu_air: ['Roda pintu air', (m) => buildRodaPintuAir(m)],
  gp_rel_lori: ['Rel lori 2 m', (m) => buildRelLori(m)],
  gp_lori_tebu: ['Lori tebu', (m) => buildLoriTebu(m)],
};
for (const [k, [name, build]] of Object.entries(REG)) LIBRARY[k] = { name, icon: '🪦', grp: 'game_penuh', build };
export const GAME_PENUH_KEYS = Object.keys(REG);
