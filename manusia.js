// Figur manusia realistis berpermukaan halus (mesh bergaya Blender, ~20-35 ribu segitiga, normal halus).
// Mesh dipanggang dari Quaternius Universal Base Characters + Modular Character Outfits (CC0) dalam pose berdiri,
// lalu diberi warna kulit sawo matang, rambut hitam, dan pakaian Nusantara (batik, lurik, sarung) + peci/caping/kerudung.
// Bot bawaan diganti sandal jepit atau sepatu pantofel; versi anak dibentuk ulang (kepala lebih besar, badan lebih kecil).
// Koordinat lokal: alas di z = 0, berpusat di sumbu X/Y, wajah menghadap -Y (sama seperti figur pustaka lain).
import * as THREE from 'three';
import * as G from './geometry.js';
import { LIBRARY } from './library.js';
import { MANUSIA_DATA } from './manusia_data.js';

const bytes = (s) => {
  if (typeof atob === 'function') {
    const bin = atob(s), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  return new Uint8Array(Buffer.from(s, 'base64'));
};
const decoded = new Map();
// Mesh dasar terurai: titik (m), segitiga, indeks warna palet, bagian (k kulit, r rambut, m mata, b pakaian)
export function manusiaMesh(base) {
  if (!decoded.has(base)) {
    const d = MANUSIA_DATA[base];
    if (!d) throw new Error('mesh manusia tidak ada: ' + base);
    const v16 = new Int16Array(bytes(d.v).buffer), t = new Uint16Array(bytes(d.t).buffer), c = new Uint16Array(bytes(d.c).buffer);
    const v = Float32Array.from(v16, (x) => x / 10000);
    const p = new TextDecoder('latin1').decode(bytes(d.p));
    decoded.set(base, { v, t, c, p, pal: d.pal.map((h) => new THREE.Color(h)) });
  }
  return decoded.get(base);
}

const lum = (c) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
const hex = (c) => '#' + c.getHexString();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// warna sasaran dengan gelap-terang (bayangan tekstur asli) dipertahankan
const shade = (target, ratio, q = 40) => new THREE.Color(target).multiplyScalar(Math.round(clamp(ratio, 0.35, 1.35) * q) / q);

function meanLum(M, part) {
  let s = 0, n = 0;
  for (let i = 0; i < M.c.length; i++) if (M.p[i] === part) { s += lum(M.pal[M.c[i]]); n++; }
  return n ? s / n : 0.5;
}

// Gelap-terang kulit dihaluskan antar-segitiga bertetangga (bilateral: alis, bibir, kelopak tetap tajam)
// supaya wajah tidak belang-belang oleh sampel tekstur per segitiga.
function skinRatios(M, Lk) {
  if (M.skin) return M.skin;
  const nT = M.c.length, nV = M.v.length / 3;
  const r = new Float32Array(nT), vt = Array.from({ length: nV }, () => []);
  for (let i = 0; i < nT; i++) {
    if (M.p[i] !== 'k') continue;
    r[i] = lum(M.pal[M.c[i]]) / Lk;
    for (let j = 0; j < 3; j++) vt[M.t[i * 3 + j]].push(i);
  }
  let cur = r;
  for (let it = 0; it < 4; it++) {
    const nx = new Float32Array(nT);
    for (let i = 0; i < nT; i++) {
      if (M.p[i] !== 'k') continue;
      let s = cur[i] * 2, n = 2;
      for (let j = 0; j < 3; j++) for (const o of vt[M.t[i * 3 + j]]) if (o !== i && Math.abs(cur[o] - cur[i]) < 0.16) { s += cur[o]; n++; }
      nx[i] = s / n;
    }
    cur = nx;
  }
  return (M.skin = cur);
}

// Titik mesh dibentuk ulang untuk satu figur: kaki tanpa bot, dada anak dirampingkan, proporsi anak, lalu skala.
function shapeVerts(M, s, top) {
  const nV = M.v.length / 3, P = Float32Array.from(M.v);
  const vpart = new Array(nV);
  for (let i = 0; i < M.c.length; i++) for (let j = 0; j < 3; j++) vpart[M.t[i * 3 + j]] ??= M.p[i];
  const kaki = s.kaki || 'sandal';
  if (kaki !== 'bot') {
    // telapak bot dirampingkan menjadi bentuk kaki (lebar 82%), batang bot menjadi ujung celana
    const ctr = { '-1': [0, 0, 0], 1: [0, 0, 0] };
    for (let i = 0; i < nV; i++) if (vpart[i] === 'f' && P[i * 3 + 2] < 0.08) { const c = ctr[Math.sign(P[i * 3]) || 1]; c[0] += P[i * 3]; c[1] += P[i * 3 + 1]; c[2]++; }
    for (let i = 0; i < nV; i++) {
      const z = P[i * 3 + 2];
      if (vpart[i] !== 'f' || z > 0.13) continue;
      const c = ctr[Math.sign(P[i * 3]) || 1], t = 1 - smooth(0.09, 0.13, z);
      if (!c[2]) continue;
      P[i * 3] = c[0] / c[2] + (P[i * 3] - c[0] / c[2]) * (1 - 0.18 * t);
      P[i * 3 + 1] = c[1] / c[2] + (P[i * 3 + 1] - c[1] / c[2]) * (1 - 0.05 * t);
      P[i * 3 + 2] = z * (1 - 0.15 * t);
    }
  }
  const kid = s.anak ? { kh: 0.84 + 0.1 * (s.anak - 1), zn: top - 0.27 } : null;
  if (kid) {
    if (s.base.startsWith('f')) {
      // anak perempuan: tonjolan dada baju dewasa diratakan ke garis perut
      let yRef = 0;
      for (let i = 0; i < nV; i++) if (vpart[i] === 'b' && Math.abs(P[i * 3]) < 0.05 && P[i * 3 + 2] > 1.0 && P[i * 3 + 2] < 1.08) yRef = Math.min(yRef, P[i * 3 + 1]);
      for (let i = 0; i < nV; i++) {
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        if (vpart[i] === 'r' || y >= yRef || z < 1.08 || z > 1.42 || Math.abs(x) > 0.17) continue;
        const w = Math.sin(Math.PI * (z - 1.08) / 0.34) * (1 - smooth(0.12, 0.17, Math.abs(x)));
        P[i * 3 + 1] = yRef + (y - yRef) * (1 - 0.8 * w);
      }
    }
    // kepala sedikit mengecil, badan jauh lebih kecil -> kepala relatif besar seperti anak
    kid.kb = (s.anak - (top - kid.zn) * kid.kh) / kid.zn;
    kid.kw = kid.kb * 1.02;
    for (let i = 0; i < nV; i++) {
      const z = P[i * 3 + 2], w = smooth(kid.zn - 0.05, kid.zn + 0.05, z), f = kid.kw + (kid.kh - kid.kw) * w;
      P[i * 3] *= f;
      P[i * 3 + 1] *= f;
      P[i * 3 + 2] = z < kid.zn ? z * kid.kb : kid.zn * kid.kb + (z - kid.zn) * kid.kh;
    }
  }
  const sc = kid ? 1 : s.scale ?? (s.base.startsWith('f') ? 0.92 : 0.965), H = s.h ?? 1; // tinggi rata-rata orang Indonesia ±1,56 / 1,66 m
  for (let i = 0; i < nV; i++) { P[i * 3] *= sc; P[i * 3 + 1] *= sc; P[i * 3 + 2] *= sc * H; }
  return { P, vpart, hs: sc * (kid ? kid.kh : 1) };
}

// Sumbu tubuh per wilayah (badan, lengan kiri/kanan, kaki kiri/kanan): pusat X/Y tiap irisan 4 cm.
function regionAxes(P, M, regOf) {
  const acc = new Map();
  for (let i = 0; i < M.c.length; i++) {
    const r = regOf[i];
    if (!r) continue;
    let a = acc.get(r);
    if (!a) acc.set(r, (a = { bins: new Map(), rs: 0, n: 0 }));
    for (let j = 0; j < 3; j++) {
      const k = M.t[i * 3 + j], b = Math.round(P[k * 3 + 2] / 0.04);
      const e = a.bins.get(b) || [0, 0, 0];
      e[0] += P[k * 3]; e[1] += P[k * 3 + 1]; e[2]++;
      a.bins.set(b, e);
    }
  }
  for (const a of acc.values()) {
    const near = (b) => {
      for (let d = 0; d < 30; d++) for (const bb of [b - d, b + d]) { const e = a.bins.get(bb); if (e) return [e[0] / e[2], e[1] / e[2]]; }
      return [0, 0];
    };
    // dihaluskan antar-irisan (tanpa loncatan sumbu -> tanpa garis patah pada motif)
    const sm = new Map();
    for (const b of a.bins.keys()) {
      let x = 0, y = 0, n = 0;
      for (let d = -2; d <= 2; d++) if (a.bins.has(b + d)) { const c = near(b + d); x += c[0]; y += c[1]; n++; }
      sm.set(b, [x / n, y / n]);
    }
    const at0 = (b) => sm.get(b) || near(b);
    a.at = (z) => {
      const t = z / 0.04, b = Math.floor(t), f = t - b, c0 = at0(b), c1 = at0(b + 1);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f];
    };
  }
  for (let i = 0; i < M.c.length; i++) {
    const a = regOf[i] && acc.get(regOf[i]);
    if (!a) continue;
    for (let j = 0; j < 3; j++) { const k = M.t[i * 3 + j], c = a.at(P[k * 3 + 2]); a.rs += Math.hypot(P[k * 3] - c[0], P[k * 3 + 1] - c[1]); a.n++; }
  }
  for (const a of acc.values()) a.R = a.rs / Math.max(1, a.n);
  return acc;
}

// Pemetaan tekstur silinder: motif menyambung melingkari badan/lengan/kaki (tidak patah di lipatan kain).
function cylUV(f, ax, c) {
  const N = f.n;
  if (Math.abs(N[2]) > 0.95) return;
  const l = Math.hypot(N[0], N[1]), u = [-N[1] / l, N[0] / l, 0];
  const v = [N[1] * u[2] - N[2] * u[1], N[2] * u[0] - N[0] * u[2], N[0] * u[1] - N[1] * u[0]];
  const a = ax.at(c[2]), dx = c[0] - a[0], dy = c[1] - a[1];
  const X = (u[0] * -dy + u[1] * dx >= 0 ? 1 : -1) * ax.R * Math.atan2(dx, -dy), Y = c[2];
  f.uv = { o: [0, 1, 2].map((k) => c[k] - X * u[k] - Y * v[k]), u };
}

export function buildManusia(m, s) {
  const M = manusiaMesh(s.base);
  const top = M.v.reduce((mx, x, i) => (i % 3 === 2 && x > mx ? x : mx), 0);
  const nT = M.c.length;
  const { P, vpart, hs } = shapeVerts(M, s, top);
  // gelap-terang rata-rata tiap bagian, untuk mempertahankan lipatan/bayangan saat diwarnai ulang
  const L = {};
  for (const k of 'krbalfx') L[k] = meanLum(M, k);
  const shirtL = (L.b * 2 + L.a) / 3, skinR = skinRatios(M, L.k);
  // sabuk, tudung, pelindung bahu: warna senada baju (lebih gelap), tanpa motif
  const aksen = s.aksen || (s.baju ? { color: hex(new THREE.Color(s.baju.color || '#ffffff').multiplyScalar(0.62)) } : null);
  const acc = s.acc || [], kerudung = acc.includes('kerudung'), kaki = s.kaki || 'sandal';
  // ukuran kepala (setelah dibentuk)
  let hz = 0;
  for (let i = 2; i < P.length; i += 3) hz = Math.max(hz, P[i]);
  let hx = 0, hy = 0, hn = 0, ez = 0, en = 0;
  for (let i = 0; i < P.length; i += 3) if (P[i + 2] > hz - 0.2 * hs) { hx += P[i]; hy += P[i + 1]; hn++; }
  hx /= hn; hy /= hn;
  for (let i = 0; i < nT; i++) if (M.p[i] === 'm') { ez += P[M.t[i * 3] * 3 + 2]; en++; }
  ez = en ? ez / en : hz - 0.13 * hs;
  const peci = acc.includes('peci'), r0 = 0.091 * hs, pz0 = hz - 0.118 * hs;
  // rambut yang tertutup peci dibuang agar peci bisa duduk rendah di kepala
  const underPeci = (p) => p[2] > pz0 + 0.006 && Math.hypot(p[0] - hx, (p[1] - hy) / 1.18) < r0 * 1.25;
  // bagian tiap segitiga: kaki di bawah mata kaki = kulit/sandal/sepatu, batang bot = celana
  const zRaw = (i) => (M.v[M.t[i * 3] * 3 + 2] + M.v[M.t[i * 3 + 1] * 3 + 2] + M.v[M.t[i * 3 + 2] * 3 + 2]) / 3;
  const partOf = new Array(nT);
  for (let i = 0; i < nT; i++) {
    let p = M.p[i];
    if (p === 'f' && kaki !== 'bot') p = [0, 1, 2].some((j) => M.v[M.t[i * 3 + j] * 3 + 2] > 0.1) ? '-' : 'F';
    partOf[i] = p;
  }
  const regOf = partOf.map((p, i) => {
    const sx = M.v[M.t[i * 3] * 3] < 0 ? 'k' : 'n';
    return p === 'b' || p === 'x' ? 'T' : p === 'a' ? 'A' + sx : p === 'l' ? 'L' + sx : null;
  });
  const axes = s.baju?.tex || s.celana?.tex ? regionAxes(P, M, regOf) : null;
  const sid = m.nextId++;
  const v = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
  let lzAll = 9;
  for (let k = 0; k < vpart.length; k++) if (vpart[k] === 'l') lzAll = Math.min(lzAll, P[k * 3 + 2]);
  const hem = [0, 0]; // gelap-terang rata-rata ujung celana, agar pipa celana di bawahnya senada
  for (let i = 0; i < nT; i++) {
    const a = v(M.t[i * 3]), b = v(M.t[i * 3 + 1]), c = v(M.t[i * 3 + 2]);
    const n = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).cross(new THREE.Vector3(...c).sub(new THREE.Vector3(...a)));
    if (n.lengthSq() < 1e-16) continue;
    const src = M.pal[M.c[i]], part = partOf[i];
    if (part === '-') continue; // batang bot diganti pipa celana (lihat di bawah)
    if (part === 'r' && (kerudung || (peci && underPeci(a) && underPeci(b) && underPeci(c)))) continue;
    // anak: kumis & jenggot dibuang
    if (part === 'r' && s.anak && Math.max(a[2], b[2], c[2]) < ez - 0.015 * hs && Math.min(a[1], b[1], c[1]) < hy - 0.02 * hs) continue;
    let col = src, tex = null, texScale = 0.3;
    if (part === 'k' && s.skin) col = shade(s.skin, 1 + (skinR[i] - 1) * 0.75, 64);
    else if (part === 'r' && s.hair) col = shade(s.hair, (lum(src) / L.r) * 0.9 + 0.1);
    else if (part === 'F') {
      const ratio = 1 + (lum(src) / L.f - 1) * 0.3;
      if (kaki === 'sepatu') col = shade(s.sepatu || '#211c19', ratio);
      else col = shade(s.skin || '#a8714a', 0.86 + (ratio - 1) * 0.3, 64); // kaki telanjang di atas sandal
    } else {
      const wear = (part === 'b' || part === 'a') ? s.baju : part === 'l' ? s.celana : part === 'f' ? s.sepatu || SEPATU : part === 'x' ? aksen : null;
      if (wear) {
        // lipatan kain dipertahankan tetapi dilunakkan (pola asli hilang)
        const base = M.p[i] === 'f' ? L.f : part === 'l' ? L.l : part === 'f' ? L.f : part === 'x' ? L.x : shirtL;
        const ratio = 1 + (lum(src) / Math.max(0.03, base) - 1) * (M.p[i] === 'f' && part === 'l' ? 0.25 : 0.45);
        col = shade(typeof wear === 'string' ? wear : wear.color || '#ffffff', ratio);
        if (part === 'l' && Math.min(a[2], b[2], c[2]) < lzAll + 0.08 * hs) { hem[0] += clamp(ratio, 0.35, 1.35); hem[1]++; }
        if (wear.tex) [tex, texScale] = [wear.tex, (wear.texScale ?? 0.25) * (s.anak ? 0.8 : 1)];
      }
    }
    const f = G.makeFace(m, [a, c, b], n.negate(), hex(col), sid); // urutan titik mesh asal searah jarum jam
    if (!f) continue;
    f.soft = true;
    f.bp = regOf[i] ? regOf[i][0] : part; // bagian tubuh (A lengan, L kaki, T badan, k kulit, r rambut…) untuk tulang animasi
    if (tex) {
      Object.assign(f, { tex, texScale });
      const ax = axes?.get(regOf[i]);
      if (ax) cylUV(f, ax, [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3));
    }
    m.faces.push(f);
  }
  if (kaki !== 'bot') {
    // kaki celana panjang dari lutut sampai mata kaki (menggantikan batang bot)
    for (const sx of [-1, 1]) {
      const ring = (pick) => {
        const pts = [];
        for (let k = 0; k < vpart.length; k++) if (Math.sign(P[k * 3]) === sx && pick(k)) pts.push([P[k * 3], P[k * 3 + 1], P[k * 3 + 2]]);
        if (!pts.length) return null;
        const c = [0, 1, 2].map((j) => pts.reduce((t, p) => t + p[j], 0) / pts.length);
        return { c, r: pts.reduce((t, p) => t + Math.hypot(p[0] - c[0], p[1] - c[1]), 0) / pts.length };
      };
      let lz = 9;
      for (let k = 0; k < vpart.length; k++) if (vpart[k] === 'l' && Math.sign(P[k * 3]) === sx) lz = Math.min(lz, P[k * 3 + 2]);
      const T = ring((k) => vpart[k] === 'l' && P[k * 3 + 2] < lz + 0.03 * hs), B = ring((k) => vpart[k] === 'f' && M.v[k * 3 + 2] > 0.07 && M.v[k * 3 + 2] < 0.095);
      if (!T || !B) continue;
      const top = [T.c[0], T.c[1], lz + 0.035 * hs], bot = [B.c[0], B.c[1], B.c[2] - 0.006];
      const d = new THREE.Vector3(...top).sub(new THREE.Vector3(...bot)), len = d.length();
      const rt = T.r + 0.004, rb = Math.max(0.042 * hs, B.r + 0.004);
      const { ids } = G.lathe(m, bot, [d.x / len, d.y / len, d.z / len], [[rb * 1.06, 0], [rb * 1.04, 0.02 * hs], [Math.max(rb, rt) * 1.04, len * 0.55], [rt, len]], 28, false, '#000');
      const set = new Set(ids), wear = s.celana || { color: '#2b2b2b' };
      const ax = { R: (rt + rb) / 2, at: (z) => { const t = clamp((z - bot[2]) / (top[2] - bot[2]), 0, 1); return [bot[0] + (top[0] - bot[0]) * t, bot[1] + (top[1] - bot[1]) * t]; } };
      for (const f of m.faces) {
        if (!set.has(f.id)) continue;
        f.soft = true;
        f.color = hex(shade(wear.color || '#2b2b2b', (hem[1] ? hem[0] / hem[1] : 0.92) + 0.06 * f.n[2]));
        if (wear.tex) {
          Object.assign(f, { tex: wear.tex, texScale: (wear.texScale ?? 0.25) * (s.anak ? 0.8 : 1) });
          cylUV(f, ax, [0, 1, 2].map((k) => f.pts.reduce((t, p) => t + p[k], 0) / f.pts.length));
        }
      }
    }
  }
  if (kaki === 'sandal') for (const sx of [-1, 1]) buildSandal(m, P, vpart, M, sx, hs, s.sandal || '#3d2b1f', s.tali || '#1f4e79');
  const rev = (c, prof, color, o = {}) => {
    const { ids } = G.lathe(m, c, [0, 0, 1], prof, o.seg ?? 32, false, color);
    const set = new Set(ids);
    for (const f of m.faces) {
      if (!set.has(f.id)) continue;
      if (o.sy) {
        f.pts = f.pts.map((p) => [p[0], c[1] + (p[1] - c[1]) * o.sy, p[2]]);
        const nv = G.newellNormal(f.pts).normalize();
        f.n = [nv.x, nv.y, nv.z];
      }
      f.soft = true;
    }
  };
  for (const ac of acc) {
    if (ac === 'peci') {
      rev([hx, hy, pz0], [[r0, 0], [r0 * 1.01, 0.085 * hs], [r0 * 0.95, 0.094 * hs], [0, 0.096 * hs]], s.peci || '#151515', { sy: 1.18 });
    } else if (ac === 'caping') {
      const z0 = hz - 0.075 * hs;
      rev([hx, hy, z0], [[0.29 * hs, 0], [0.27 * hs, 0.015 * hs], [0.12 * hs, 0.09 * hs], [0.02 * hs, 0.16 * hs], [0, 0.165 * hs]], '#d8b46a', { seg: 36 });
    } else if (ac === 'kerudung') {
      buildKerudung(m, M, P, partOf, { hx, hy, hz, ez, hs }, s.kerudung || '#2f3e66');
    }
  }
}

// Sandal selop: alas mengikuti garis telapak (selubung cembung) + tali lebar melengkung di punggung kaki.
function buildSandal(m, P, vpart, M, sx, hs, cSol, cTali) {
  const pts = [];
  for (let k = 0; k < vpart.length; k++) if (vpart[k] === 'f' && M.v[k * 3 + 2] < 0.1 && Math.sign(P[k * 3]) === sx) pts.push([P[k * 3], P[k * 3 + 1], P[k * 3 + 2]]);
  if (pts.length < 8) return;
  // selubung cembung telapak (rantai monoton)
  const q = pts.map((p) => [p[0], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of q) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of q.slice().reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  const hull = lo.slice(0, -1).concat(up.slice(0, -1));
  const cx = hull.reduce((t, p) => t + p[0], 0) / hull.length, cy = hull.reduce((t, p) => t + p[1], 0) / hull.length;
  const out = hull.map(([x, y]) => { const l = Math.hypot(x - cx, y - cy) || 1; return [x + ((x - cx) / l) * 0.004, y + ((y - cy) / l) * 0.004]; });
  const th = 0.011 * hs, sid = m.nextId++;
  const add = (ptsF, hint, color, soft) => { const f = G.makeFace(m, ptsF, hint, color, sid); if (f) { f.soft = soft; m.faces.push(f); } };
  add(out.map(([x, y]) => [x, y, th]), new THREE.Vector3(0, 0, 1), cSol, false);
  add(out.map(([x, y]) => [x, y, 0]), new THREE.Vector3(0, 0, -1), cSol, false);
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = out[(i + 1) % out.length];
    add([[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], th], [a[0], a[1], th]], new THREE.Vector3((a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cy, 0), cSol, true);
  }
  // tali: irisan punggung kaki ±1 cm di sepertiga depan telapak
  const ys = pts.map((p) => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys), yt = y0 + (y1 - y0) * 0.33, w = 0.009 * hs;
  const band = pts.filter((p) => Math.abs(p[1] - yt) < 0.014);
  if (band.length < 4) return;
  const xc = band.reduce((t, p) => t + p[0], 0) / band.length, NB = 16, R = new Array(NB + 1).fill(0);
  for (const p of band) {
    const al = Math.atan2(p[2] - th, p[0] - xc);
    if (al < -0.2 || al > Math.PI + 0.2) continue;
    const b = Math.round((clamp(al, 0, Math.PI) / Math.PI) * NB);
    R[b] = Math.max(R[b], Math.hypot(p[0] - xc, p[2] - th));
  }
  for (let i = 0; i <= NB; i++) if (!R[i]) { let a = i, b = i; while (a > 0 && !R[a]) a--; while (b < NB && !R[b]) b++; R[i] = Math.max(R[a], R[b]); }
  const sm = R.map((r, i) => Math.max(r, ((R[i - 1] ?? r) + 2 * r + (R[i + 1] ?? r)) / 4) + 0.0025);
  const P2 = (i, y) => { const al = (Math.PI * i) / NB; return [xc + sm[i] * Math.cos(al), y, th + sm[i] * Math.sin(al)]; };
  for (let i = 0; i < NB; i++) {
    const al = (Math.PI * (i + 0.5)) / NB;
    add([P2(i, yt - w), P2(i + 1, yt - w), P2(i + 1, yt + w), P2(i, yt + w)], new THREE.Vector3(Math.cos(al), 0, Math.sin(al)), cTali, true);
  }
}

// Kerudung: kain yang membungkus kepala (mengikuti bentuk kepala), membingkai wajah, lalu jatuh menutupi leher,
// bahu, dan dada. Bentuknya "dibungkuskan" ke tubuh: jari-jari tiap sudut = titik tubuh terjauh + kelonggaran kain.
function buildKerudung(m, M, P, partOf, h, color) {
  const { hx, hy, hz, ez, hs } = h;
  const NP = 72, DZ = 0.01, zLo = hz - 0.62 * hs, NZt = Math.ceil((hz - zLo) / DZ) + 2;
  const W = Array.from({ length: NZt }, () => new Float32Array(NP));
  const use = new Uint8Array(P.length / 3);
  for (let i = 0; i < partOf.length; i++) if (partOf[i] !== 'r') for (let j = 0; j < 3; j++) use[M.t[i * 3 + j]] = 1;
  for (let k = 0; k < use.length; k++) {
    if (!use[k]) continue;
    const z = P[k * 3 + 2];
    if (z < zLo - 0.02) continue;
    const dx = P[k * 3] - hx, dy = P[k * 3 + 1] - hy, r = Math.hypot(dx, dy);
    const b = Math.round(((Math.atan2(dx, -dy) / (2 * Math.PI)) * NP + NP) % NP) % NP;
    for (let zi = Math.max(0, Math.floor((z - zLo) / DZ) - 1); zi <= Math.min(NZt - 1, Math.ceil((z - zLo) / DZ) + 1); zi++) {
      if (Math.abs(zLo + zi * DZ - z) > 0.013) continue;
      for (const bb of [b - 1, b, b + 1]) { const j = (bb + NP) % NP; if (r > W[zi][j]) W[zi][j] = r; }
    }
  }
  // isi sudut kosong & haluskan (tetap tidak masuk ke dalam tubuh)
  for (const row of W) {
    if (!row.some((x) => x > 0)) continue;
    for (let j = 0; j < NP; j++) if (!row[j]) {
      let a = 1, b = 1;
      while (!row[(j - a + NP) % NP]) a++;
      while (!row[(j + b) % NP]) b++;
      row[j] = (row[(j - a + NP) % NP] * b + row[(j + b) % NP] * a) / (a + b);
    }
    const o = Float32Array.from(row);
    for (let it = 0; it < 3; it++) { const c = Float32Array.from(row); for (let j = 0; j < NP; j++) row[j] = Math.max(o[j], (c[(j + NP - 1) % NP] + 2 * c[j] + c[(j + 1) % NP]) / 4); }
  }
  const Wat = (z, j) => {
    const t = clamp((z - zLo) / DZ, 0, NZt - 1.001), i = Math.floor(t), f = t - i;
    return W[i][j] * (1 - f) + W[i + 1][j] * f;
  };
  const maxW = (z0, z1, j) => { let r = 0; for (let z = z0; z <= z1; z += DZ / 2) r = Math.max(r, Wat(z, j)); return r; };
  // susunan cincin: kepala (puncak -> bawah dagu), lalu kain menjuntai (bawah dagu -> dada; sisi lebih pendek)
  const chin = ez - 0.105 * hs, zcu = chin - 0.025 * hs, NH = 26, ND = 18;
  const zEnd = (phi) => hz - (0.40 + 0.12 * Math.cos(phi) ** 2) * hs;
  const faceTop = ez + 0.04 * hs, faceMid = (faceTop + chin) / 2, faceH = (faceTop - chin) / 2;
  const grid = [];
  for (let j = 0; j < NP; j++) {
    const phi = (2 * Math.PI * j) / NP, col = [];
    const rCu = maxW(zcu, ez, j) + 0.012, zE = zEnd(phi), rE = Wat(zE, j) + 0.02;
    for (let i = 0; i <= NH + ND; i++) {
      let z, r;
      if (i <= NH) {
        const t = i / NH;
        z = hz + 0.008 - (hz + 0.008 - zcu) * (1 - Math.cos((t * Math.PI) / 2)) ** 0.85;
        r = i === 0 ? 0 : Wat(Math.min(z, hz), j) + 0.009 * hs / 0.965;
        if (i === NH) r = Math.max(r, rCu);
      } else {
        const t = (i - NH) / ND;
        z = zcu + (zE - zcu) * t;
        r = Math.max(Wat(z, j) + 0.014, rCu + (rE - rCu) * smooth(0, 1, t));
      }
      col.push([hx + r * Math.sin(phi), hy - r * Math.cos(phi), z, r]);
    }
    grid.push(col);
  }
  // jari-jari antar-cincin dihaluskan sepanjang kain
  for (const col of grid) for (let it = 0; it < 2; it++) for (let i = 2; i < col.length - 1; i++) {
    const r = Math.max(col[i][3], (col[i - 1][3] + 2 * col[i][3] + col[i + 1][3]) / 4 - 0.002);
    const phi = Math.atan2(col[i][0] - hx, -(col[i][1] - hy));
    col[i] = [hx + r * Math.sin(phi), hy - r * Math.cos(phi), col[i][2], r];
  }
  // lubang wajah lonjong: titik kisi di tepi lubang digeser tepat ke garis elips supaya tepinya mulus
  const PH = 0.92, wrapPhi = (j) => { const p = (2 * Math.PI * j) / NP; return p > Math.PI ? p - 2 * Math.PI : p; };
  const Wphi = (z, phi) => {
    const b = ((phi / (2 * Math.PI)) * NP + NP) % NP, j0 = Math.floor(b) % NP, f = b - Math.floor(b);
    return Wat(z, j0) * (1 - f) + Wat(z, (j0 + 1) % NP) * f;
  };
  const S0 = grid.map((col, j) => col.map((p, i) => (i > 0 && i < NH ? Math.hypot(wrapPhi(j) / PH, (p[2] - faceMid) / faceH) : 9)));
  const S = S0.map((c) => c.slice());
  for (let j = 0; j < NP; j++) for (let i = 1; i < NH; i++) {
    const s0 = S0[j][i];
    if (s0 >= 1 || ![-1, 0, 1].some((dj) => [-1, 0, 1].some((di) => S0[(j + dj + NP) % NP][i + di] > 1))) continue;
    const phi = wrapPhi(j) / s0, z = faceMid + (grid[j][i][2] - faceMid) / s0, r = Wphi(z, phi) + 0.009 * hs / 0.965;
    grid[j][i] = [hx + r * Math.sin(phi), hy - r * Math.cos(phi), z, r];
    S[j][i] = 1;
  }
  const isOpen = (...ix) => ix.every(([j, i]) => S[j][i] <= 1 + 1e-9);
  const sid = m.nextId++, sidIn = m.nextId++;
  const inner = hex(new THREE.Color(color).multiplyScalar(0.8));
  const tri = (pts, out) => {
    const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3 - hx, cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3 - hy;
    const hint = new THREE.Vector3(cx, cy, 0).normalize();
    for (const [lay, ins] of [[pts, false], [pts.map((p) => { const l = Math.hypot(p[0] - hx, p[1] - hy) || 1, k = Math.max(0, l - 0.003) / l; return [hx + (p[0] - hx) * k, hy + (p[1] - hy) * k, p[2]]; }), true]]) {
      const hn = hint.lengthSq() ? hint.clone() : new THREE.Vector3(0, 0, 1);
      const f = G.makeFace(m, lay.map((p) => p.slice(0, 3)), ins ? hn.negate() : hn, ins ? inner : color, ins ? sidIn : sid);
      if (!f) continue;
      f.soft = true;
      m.faces.push(f);
    }
    return out;
  };
  for (let j = 0; j < NP; j++) {
    const A = grid[j], j1 = (j + 1) % NP, B = grid[j1];
    for (let i = 0; i < A.length - 1; i++) {
      if (i === 0) { tri([A[0], A[1], B[1]]); continue; }
      if (!isOpen([j, i], [j, i + 1], [j1, i + 1])) tri([A[i], A[i + 1], B[i + 1]]);
      if (!isOpen([j, i], [j1, i + 1], [j1, i])) tri([A[i], B[i + 1], B[i]]);
    }
  }
}

// ---------- Figur siap pakai ----------
const SEPATU = { color: '#4a3424' };
const SAWO = '#a8714a', KUNING = '#c99468', GELAP = '#7f5132', HITAM = '#17110d';
export const MANUSIA = {
  pak_tani: { name: 'Pak Tani (halus)', base: 'm_tani', skin: SAWO, hair: HITAM, baju: { color: '#7a8c5a', tex: 'b:lurik', texScale: 0.13 }, celana: { color: '#2b2b2b' }, acc: ['caping'] },
  mas_batik: { name: 'Mas Batik (halus)', base: 'm_tani_cepak', skin: KUNING, hair: HITAM, baju: { color: '#8a5a2b', tex: 'b:batik_parang', texScale: 0.13 }, celana: { color: '#24282e' }, kaki: 'sepatu' },
  pak_haji: { name: 'Pak Haji (halus)', base: 'm_tani_jenggot', skin: SAWO, hair: '#d8d4cc', baju: { color: '#f1efe8' }, celana: { color: '#3a3f47', tex: 'b:sarung_merah', texScale: 0.16 }, acc: ['peci'] },
  bang_ojek: { name: 'Bang Ojek (halus)', base: 'm_pengembara', skin: GELAP, hair: HITAM, baju: { color: '#2e7d32' }, celana: { color: '#1f2a44' }, kaki: 'sepatu' },
  pak_ronda: { name: 'Pak Ronda (halus)', base: 'm_pemburu', skin: SAWO, hair: HITAM, baju: { color: '#36454f' }, celana: { color: '#2b2b2b' } },
  bu_tani: { name: 'Bu Tani (halus)', base: 'f_tani', skin: SAWO, hair: HITAM, baju: { color: '#b34747', tex: 'b:batik_kawung_merah', texScale: 0.13 }, celana: { color: '#4a3020', tex: 'b:sarung_merah', texScale: 0.16 }, acc: ['caping'] },
  mbak_kebaya: { name: 'Mbak Kebaya (halus)', base: 'f_tani_panjang', skin: KUNING, hair: HITAM, baju: { color: '#e8c9d6' }, celana: { color: '#5a3a22', tex: 'b:batik_parang', texScale: 0.13 }, tali: '#7b1f3a' },
  ibu_warung: { name: 'Ibu Warung (halus)', base: 'f_tani_pendek', skin: SAWO, hair: '#2a1b12', baju: { color: '#d4a017', tex: 'b:batik_kawung_kuning', texScale: 0.13 }, celana: { color: '#3b2a1e' } },
  mbak_kota: { name: 'Mbak Kota (halus)', base: 'f_pengembara', skin: KUNING, hair: '#2a1b12', baju: { color: '#5d6d7e' }, celana: { color: '#1b2631' }, kaki: 'sepatu' },
  mbak_pendaki: { name: 'Mbak Pendaki (halus)', base: 'f_pemburu', skin: GELAP, hair: HITAM, baju: { color: '#a04000' }, celana: { color: '#4b5320' }, kaki: 'bot' },
  bu_guru: { name: 'Bu Guru Berkerudung (halus)', base: 'f_tani_pendek', skin: KUNING, baju: { color: '#7a4a2a', tex: 'b:batik_parang', texScale: 0.13 }, celana: { color: '#2a2a33' }, acc: ['kerudung'], kerudung: '#2f3e66', kaki: 'sepatu' },
  mbak_hijab: { name: 'Mbak Berhijab (halus)', base: 'f_tani_panjang', skin: SAWO, baju: { color: '#efe4d6' }, celana: { color: '#6b4e3d' }, acc: ['kerudung'], kerudung: '#c97b8e', tali: '#6b4e3d' },
  anak_sd_putra: { name: 'Anak SD Putra (halus)', base: 'm_tani_cepak', anak: 1.22, skin: SAWO, hair: HITAM, baju: { color: '#f4f4f0' }, celana: { color: '#b3191f' }, kaki: 'sepatu' },
  anak_sd_putri: { name: 'Anak SD Putri Berkerudung (halus)', base: 'f_tani_pendek', anak: 1.18, skin: KUNING, baju: { color: '#f4f4f0' }, celana: { color: '#b3191f' }, acc: ['kerudung'], kerudung: '#f7f7f4', kaki: 'sepatu' },
  anak_main: { name: 'Anak Main (halus)', base: 'm_tani', anak: 1.1, skin: GELAP, hair: HITAM, baju: { color: '#1e88e5' }, celana: { color: '#a1887f' }, tali: '#e53935' },
  anak_batik: { name: 'Anak Batik (halus)', base: 'f_tani_panjang', anak: 1.15, skin: SAWO, hair: HITAM, baju: { color: '#b34747', tex: 'b:batik_kawung_merah', texScale: 0.13 }, celana: { color: '#3b2a1e' }, tali: '#f06292' },
};
for (const [k, s] of Object.entries(MANUSIA)) LIBRARY['manusia_' + k] = { name: s.name, icon: s.anak ? '🧒' : s.base.startsWith('f') ? '👩' : '👨', grp: 'manusia', build: (m) => buildManusia(m, s) };
