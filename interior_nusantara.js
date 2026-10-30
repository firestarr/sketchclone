// Interior & properti rumah kampung Indonesia (grup 'interior'): perabot, elektronik, perlengkapan dapur/kamar/kamar mandi,
// pos ronda, warung, masjid, kebun. Dibuat untuk game "Malam Jumat di Kampung Mati" (diekspor ke glTF lewat
// D:\KampungMati\tools\assets\props_export), tetapi juga bisa ditempatkan langsung dari panel Pustaka.
// Bentuk dibangun dari balok bertepi tumpul (chamfer), bentuk putar (lathe), sapuan pipa dan loft penampang
// sehingga siluetnya tidak kotak-kotak. Koordinat lokal: depan ke -Y, alas di z = 0, berpusat di sumbu X/Y.
// Metadata tambahan pada bidang (diabaikan aplikasi): f.mat = jenis bahan (kayu, plastik, logam, kain, ...),
// f.part = nama bagian (mis. DOOR_L, BLADES, SCREEN), f.uv = koordinat tekstur eksplisit (label/gambar).
// m._meta = { pivots, markers, cols } berisi engsel, titik interaksi & kotak tabrakan untuk ekspor game.
import * as THREE from 'three';
import * as G from './geometry.js';
import { LIBRARY } from './library.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const mk = (c, k) => ({ c, k });

// ---------------------------------------------------------------- bahan (warna tampilan + jenis bahan untuk tekstur)
export const MAT = {
  kayu: mk('#9a6a40', 'kayu'), jati: mk('#8a5634', 'kayu'), kayuGelap: mk('#4a2e1c', 'kayu'), kayuMuda: mk('#c09a6c', 'kayu'),
  kayuHijau: mk('#5f7f62', 'kayu_cat'), kayuBiru: mk('#5a7890', 'kayu_cat'), kayuPutih: mk('#e4ddcc', 'kayu_cat'),
  logam: mk('#a6abb0', 'logam'), krom: mk('#d4d8dc', 'logam'), kuningan: mk('#c9a23a', 'logam'), besiHitam: mk('#2b2c2e', 'logam_cat'),
  catHijau: mk('#4f7a52', 'logam_cat'), catPutih: mk('#e8e6df', 'logam_cat'), catKrem: mk('#d9cfb4', 'logam_cat'), catMerah: mk('#a8322a', 'logam_cat'),
  plMerah: mk('#c0392b', 'plastik'), plHijau: mk('#3d8a4f', 'plastik'), plBiru: mk('#2f68b0', 'plastik'), plPutih: mk('#ecebe6', 'plastik'),
  plHitam: mk('#222326', 'plastik'), plKrem: mk('#ddd2b8', 'plastik'), plAbu: mk('#8e9296', 'plastik'), plKuning: mk('#e2b23a', 'plastik'),
  plOranye: mk('#d9732a', 'plastik'), plBening: mk('#e8f0f2', 'kaca'), plPink: mk('#d98ca0', 'plastik'),
  kaca: mk('#d8e8ec', 'kaca'), cermin: mk('#e9eef0', 'cermin'), layar: mk('#ffffff', 'label_layar'), neon: mk('#fff8e6', 'neon'),
  keramik: mk('#f0efe9', 'keramik'), keramikBiru: mk('#7fa6c4', 'keramik'), email: mk('#e9e6dc', 'keramik'),
  karet: mk('#262626', 'karet'), kain: mk('#8a8070', 'kain'), kainPutih: mk('#ebe7dd', 'kain'), kainMerah: mk('#8c2a2a', 'kain'),
  kainBiru: mk('#3c5878', 'kain'), kainHijau: mk('#4f6a48', 'kain'), kainCoklat: mk('#6d5640', 'kain'), kainHitam: mk('#2a2a2c', 'kain'),
  kainKrem: mk('#cfc3a6', 'kain'), batik: mk('#ffffff', 'motif_batik'), sarung: mk('#ffffff', 'motif_sarung'), bunga: mk('#ffffff', 'motif_bunga'),
  sajadah: mk('#ffffff', 'motif_sajadah'), kasur: mk('#ffffff', 'kasur_garis'), renda: mk('#ffffff', 'renda'),
  kardus: mk('#ffffff', 'kardus'), kertas: mk('#ffffff', 'kertas'), bambu: mk('#c9b27a', 'bambu'), bambuTua: mk('#a88f5c', 'bambu'),
  anyaman: mk('#ffffff', 'anyaman'), goni: mk('#ffffff', 'goni'), tanah: mk('#ffffff', 'tanah'), terakota: mk('#ffffff', 'terakota'),
  ijuk: mk('#2a221c', 'kain'), daun: mk('#4c7a3a', 'daun'), air: mk('#7fb0c8', 'air'),
};
const LBL = (name) => mk('#ffffff', 'label_' + name);

// ---------------------------------------------------------------- pembantu geometri
const key = (p) => G.key(p);
function tag(m, f, mat, o = {}) {
  f.mat = mat.k;
  if (m._part) f.part = m._part;
  f.soft = o.soft ?? true;
  m.faces.push(f);
}
function F(m, pts, hint, mat, sid, o = {}) {
  const f = G.makeFace(m, pts, hint, mat.c, sid);
  if (!f) return null;
  if (o.uv) {
    const ks = pts.map(key);
    f.uv = f.pts.map((p) => o.uv[ks.indexOf(key(p))] ?? [0, 0]);
  }
  tag(m, f, mat, o);
  return f;
}
const cen = (pts) => { const c = [0, 0, 0]; for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } return c.map((v) => v / pts.length); };
const sub = (a, b) => V3(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// sambung cincin (jumlah titik sama) menjadi permukaan; cap = tutup datar kedua ujung
function loft(m, rings, mat, o = {}) {
  const sid = m.nextId++, N = rings[0].length, cs = rings.map(cen);
  for (let k = 0; k < rings.length - 1; k++) {
    const A = rings[k], B = rings[k + 1], cc = cen([cs[k], cs[k + 1]]);
    for (let i = 0; i < N; i++) {
      if (o.open && i === N - 1) continue;
      const i1 = (i + 1) % N, q = [A[i], A[i1], B[i1], B[i]];
      const g = cen(q);
      const hint = o.inward ? sub(cc, g) : sub(g, cc);
      for (const t of [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]) F(m, t, hint, mat, sid, o);
    }
  }
  if (o.cap !== false && !o.open) {
    const ends = [[0, 1], [rings.length - 1, rings.length - 2]];
    for (const [a, b] of ends) F(m, rings[a], sub(cs[a], cs[b]), mat, sid, { ...o, soft: false });
  }
  return sid;
}
// bentuk putar: profil [[r, z], ...] di sekitar sumbu n melalui c
function lat(m, c, n, prof, mat, seg = 16, o = {}) {
  const { ids } = G.lathe(m, c, n, prof, seg, false, mat.c);
  const set = new Set(ids);
  for (const f of m.faces) {
    if (!set.has(f.id)) continue;
    f.mat = mat.k;
    if (m._part) f.part = m._part;
    f.soft = true;
    if (o.sx || o.sy || o.sz) {
      const sx = o.sx ?? 1, sy = o.sy ?? 1, sz = o.sz ?? 1;
      f.pts = f.pts.map((p) => [c[0] + (p[0] - c[0]) * sx, c[1] + (p[1] - c[1]) * sy, c[2] + (p[2] - c[2]) * sz]);
      const nv = G.newellNormal(f.pts).normalize();
      f.n = [nv.x, nv.y, nv.z];
    }
  }
  return ids;
}
// silinder/batang dari a ke b
function rod(m, a, b, r, mat, seg = 10, r2 = null) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d);
  return lat(m, a, d.map((v) => v / L), [[0, 0], [r, 0], [r2 ?? r, L], [0, L]], mat, seg);
}
function ball(m, c, r, mat, seg = 14, o = {}) {
  const prof = [...Array(9)].map((_, i) => { const a = -Math.PI / 2 + (Math.PI * i) / 8; return [Math.max(0, r * Math.cos(a)), r * Math.sin(a)]; });
  return lat(m, c, [0, 0, 1], prof, mat, seg, o);
}
// sapuan lingkaran sepanjang lintasan (pipa, rangka bengkok, tali)
function sweep(m, path, r, mat, seg = 8, o = {}) {
  const rings = [];
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    const t = V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    const up = Math.abs(t.z) < 0.9 ? V3(0, 0, 1) : V3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(t, up).normalize(), v = new THREE.Vector3().crossVectors(t, u).normalize();
    const rr = typeof r === 'function' ? r(i / (path.length - 1)) : r;
    rings.push([...Array(seg)].map((_, k) => { const ang = (TAU * k) / seg; return [path[i][0] + rr * (Math.cos(ang) * u.x + Math.sin(ang) * v.x), path[i][1] + rr * (Math.cos(ang) * u.y + Math.sin(ang) * v.y), path[i][2] + rr * (Math.cos(ang) * u.z + Math.sin(ang) * v.z)]; }));
  }
  return loft(m, rings, mat, o);
}
// cincin persegi bertepi tumpul (8 titik) pada ketinggian z, setengah lebar a,b, chamfer c
function rring(cx, cy, z, a, b, c) {
  c = Math.min(c, a * 0.9, b * 0.9);
  return [[cx - a + c, cy - b, z], [cx + a - c, cy - b, z], [cx + a, cy - b + c, z], [cx + a, cy + b - c, z], [cx + a - c, cy + b, z], [cx - a + c, cy + b, z], [cx - a, cy + b - c, z], [cx - a, cy - b + c, z]];
}
// balok bertepi tumpul dari (x0,y0,z0) ke (x1,y1,z1); b = lebar chamfer; o.taper = skala penampang atas
function rbox(m, x0, y0, z0, x1, y1, z1, mat, b = 0.004, o = {}) {
  [x0, x1] = [Math.min(x0, x1), Math.max(x0, x1)]; [y0, y1] = [Math.min(y0, y1), Math.max(y0, y1)]; [z0, z1] = [Math.min(z0, z1), Math.max(z0, z1)];
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, a = (x1 - x0) / 2, bb = (y1 - y0) / 2, t = o.taper ?? 1;
  b = Math.min(b, a * 0.45, bb * 0.45, (z1 - z0) * 0.45);
  const s = (z) => 1 + (t - 1) * ((z - z0) / (z1 - z0));
  const rings = [
    rring(cx, cy, z0, a - b, bb - b, b), rring(cx, cy, z0 + b, a * s(z0 + b), bb * s(z0 + b), b * 1.4),
    rring(cx, cy, z1 - b, a * s(z1 - b), bb * s(z1 - b), b * 1.4), rring(cx, cy, z1, a * t - b, bb * t - b, b),
  ];
  return loft(m, rings, mat, o);
}
// jalankan fn lalu transformasikan semua bidang baru dengan xf (titik -> titik)
function under(m, xf, fn) {
  const s = m.faces.length;
  fn();
  for (let i = s; i < m.faces.length; i++) {
    const f = m.faces[i];
    f.pts = f.pts.map(xf);
    const nv = G.newellNormal(f.pts).normalize();
    f.n = [nv.x, nv.y, nv.z];
  }
}
const rotP = (ax, ang, pv = [0, 0, 0]) => {
  const q = new THREE.Quaternion().setFromAxisAngle(V3(...ax).normalize(), ang);
  return (p) => { const v = V3(p[0] - pv[0], p[1] - pv[1], p[2] - pv[2]).applyQuaternion(q); return [v.x + pv[0], v.y + pv[1], v.z + pv[2]]; };
};
const trP = (d) => (p) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
const comp = (...fs) => (p) => fs.reduce((q, f) => f(q), p);
// bidang datar berlabel (gambar penuh 0..1), titik p0..p3 berlawanan jarum jam dilihat dari depan (hint)
function decal(m, p0, p1, p2, p3, mat, hint, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
  return F(m, [p0, p1, p2, p3], V3(...hint), mat, null, { uv, soft: false });
}
// panel tegak menghadap -Y berlabel: pusat (x,y,z), lebar w, tinggi h
const decalFront = (m, x, y, z, w, h, mat, uv) => decal(m, [x - w / 2, y, z - h / 2], [x + w / 2, y, z - h / 2], [x + w / 2, y, z + h / 2], [x - w / 2, y, z + h / 2], mat, [0, -1, 0], uv);
const decalTop = (m, x, y, z, w, d, mat, uv) => decal(m, [x - w / 2, y - d / 2, z], [x + w / 2, y - d / 2, z], [x + w / 2, y + d / 2, z], [x - w / 2, y + d / 2, z], mat, [0, 0, 1], uv);

// metadata untuk ekspor game
function meta(m) {
  if (!m._meta) m._meta = { pivots: {}, markers: [], cols: [] };
  return m._meta;
}
const marker = (m, name, p, extra = {}) => meta(m).markers.push({ name, p, ...extra });
const colBox = (m, min, max, part = null) => meta(m).cols.push({ type: 'box', min, max, part });
function part(m, name, pivot, fn) {
  const prev = m._part;
  m._part = name;
  if (pivot) meta(m).pivots[name] = pivot;
  fn();
  m._part = prev;
}

// kaki meruncing bertepi tumpul (penampang a x a di bawah, skala t di atas)
const leg = (m, x, y, z0, z1, w, mat, t = 1.15) => rbox(m, x - w / 2, y - w / 2, z0, x + w / 2, y + w / 2, z1, mat, 0.004, { taper: t });

// ============================================================================ FURNITUR
export function buildKursiKayu(m, o = {}) {
  const c = o.mat ?? MAT.jati, rusak = !!o.rusak, H = 0.45;
  // kaki depan lurus meruncing, kaki belakang menyatu dengan tiang sandaran yang miring ke belakang
  for (const sx of [-1, 1]) {
    leg(m, sx * 0.185, -0.185, 0, H - 0.03, 0.036, c, 1.1);
    const back = (p) => rotP([1, 0, 0], -0.12, [0, 0.185, H])(p);
    if (rusak && sx > 0) {
      leg(m, sx * 0.185, 0.185, 0, H - 0.03, 0.038, c, 1.0);
      under(m, comp(rotP([0, 1, 0], 0.5, [sx * 0.185, 0.185, H + 0.3]), back), () => rbox(m, sx * 0.185 - 0.019, 0.166, H + 0.12, sx * 0.185 + 0.019, 0.204, H + 0.36, c, 0.004));
    } else {
      leg(m, sx * 0.185, 0.185, 0, H - 0.03, 0.038, c, 1.0);
      under(m, back, () => rbox(m, sx * 0.185 - 0.019, 0.166, H - 0.03, sx * 0.185 + 0.019, 0.204, H + 0.46, c, 0.005, { taper: 0.85 }));
    }
  }
  // palang bawah (rangka H) dan rangka bawah dudukan
  for (const sx of [-1, 1]) rbox(m, sx * 0.185 - 0.012, -0.17, 0.14, sx * 0.185 + 0.012, 0.17, 0.165, c, 0.003);
  if (!rusak) rbox(m, -0.17, -0.012, 0.15, 0.17, 0.012, 0.172, c, 0.003);
  rbox(m, -0.18, -0.2, H - 0.085, 0.18, -0.18, H - 0.03, c, 0.003);
  rbox(m, -0.18, 0.18, H - 0.085, 0.18, 0.2, H - 0.03, c, 0.003);
  for (const sx of [-1, 1]) rbox(m, sx * 0.19 - 0.01, -0.17, H - 0.085, sx * 0.19 + 0.01, 0.17, H - 0.03, c, 0.003);
  // dudukan papan dengan tepi depan membulat
  const seat = [[-0.215, -0.225], [0.215, -0.225], [0.22, 0.2], [-0.22, 0.2]];
  const ring = (z, ins) => { const pts = []; for (const [x, y] of seat) pts.push([x - Math.sign(x) * ins, y - Math.sign(y) * ins, z]); return pts; };
  loft(m, [ring(H - 0.03, 0.008), ring(H - 0.022, 0), ring(H - 0.006, 0), ring(H, 0.008)], c);
  // sandaran: dua bilah melengkung (bilah atas lebar), satu jari tengah
  const back = rotP([1, 0, 0], -0.12, [0, 0.185, H]);
  const curvedRail = (z0, z1, broken) => {
    const n = 10, rings = [];
    for (let i = 0; i <= n; i++) {
      const x = -0.17 + (0.34 * i) / n, y = 0.18 + 0.025 * (1 - (x / 0.17) ** 2);
      rings.push([[x, y - 0.012, z0], [x, y + 0.012, z0], [x, y + 0.012, z1], [x, y - 0.012, z1]]);
    }
    under(m, back, () => loft(m, broken ? rings.slice(0, 6) : rings, c));
  };
  curvedRail(H + 0.36, H + 0.45, false);
  curvedRail(H + 0.16, H + 0.21, rusak);
  if (!rusak) under(m, back, () => rbox(m, -0.03, 0.19, H + 0.21, 0.03, 0.212, H + 0.36, c, 0.003));
  colBox(m, [-0.23, -0.23, 0], [0.23, 0.26, H]);
  colBox(m, [-0.22, 0.17, H], [0.22, 0.29, H + 0.46]);
}

// Kursi plastik monoblok (warung/hajatan): dudukan berbibir, kaki serong meruncing, sandaran lengkung berlubang
export function buildKursiPlastik(m, o = {}) {
  const c = o.mat ?? MAT.plMerah, H = 0.45;
  // dudukan: pelat bertepi bulat dengan bibir menurun
  const seatRing = (z, a, b, r) => {
    const pts = [];
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * TAU, ct = Math.cos(t), st = Math.sin(t);
      const se = (v) => Math.sign(v) * Math.abs(v) ** 0.35;
      pts.push([a * se(ct), b * se(st) - 0.01, z]);
    }
    return pts;
  };
  loft(m, [seatRing(H - 0.045, 0.205, 0.2), seatRing(H - 0.012, 0.215, 0.21), seatRing(H, 0.21, 0.205), seatRing(H + 0.004, 0.19, 0.185)], c);
  // kaki: penampang persegi membulat, serong keluar, meruncing ke bawah
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const top = [sx * 0.16, sy * 0.15, H - 0.02], bot = [sx * 0.245, sy * 0.24, 0];
    const rings = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4, p = [bot[0] + (top[0] - bot[0]) * t, bot[1] + (top[1] - bot[1]) * t, bot[2] + (top[2] - bot[2]) * t];
      const w = 0.017 + 0.012 * t;
      rings.push(rring(p[0], p[1], p[2], w, w * 1.15, w * 0.5));
    }
    loft(m, rings, c);
    lat(m, [bot[0], bot[1], 0], [0, 0, 1], [[0, 0], [0.02, 0], [0.02, 0.012], [0, 0.012]], MAT.plAbu, 8);   // sepatu kaki
  }
  // sandaran: rangka lengkung (dua tiang + tiga bilah horizontal melengkung)
  const back = rotP([1, 0, 0], -0.2, [0, 0.17, H]);
  under(m, back, () => {
    for (const sx of [-1, 1]) rbox(m, sx * 0.19 - 0.022, 0.155, H - 0.01, sx * 0.19 + 0.022, 0.185, H + 0.4, c, 0.008);
    for (const [z0, z1] of [[H + 0.3, H + 0.4], [H + 0.18, H + 0.24], [H + 0.07, H + 0.12]]) {
      const rings = [];
      for (let i = 0; i <= 12; i++) {
        const x = -0.2 + (0.4 * i) / 12, y = 0.17 + 0.035 * (1 - (x / 0.2) ** 2);
        rings.push([[x, y - 0.013, z0], [x, y + 0.013, z0], [x, y + 0.013, z1], [x, y - 0.013, z1]]);
      }
      loft(m, rings, c);
    }
  });
  colBox(m, [-0.26, -0.25, 0], [0.26, 0.25, H]);
  colBox(m, [-0.22, 0.14, H], [0.22, 0.3, H + 0.4]);
}

// Kursi tamu jati (kursi teras/tamu klasik): rangka jati berukir sederhana, bantalan dudukan & sandaran kain
export function buildKursiTamu(m, o = {}) {
  const c = MAT.jati, kain = o.kain ?? MAT.kainHijau, W = o.w ?? 0.62, a = W / 2, H = 0.42;
  for (const sx of [-1, 1]) {
    leg(m, sx * (a - 0.03), -0.26, 0, 0.62, 0.045, c, 0.9);                                   // kaki depan naik jadi tiang lengan
    leg(m, sx * (a - 0.03), 0.26, 0, H, 0.045, c, 1.0);
    under(m, rotP([1, 0, 0], -0.15, [0, 0.26, H]), () => rbox(m, sx * (a - 0.03) - 0.022, 0.24, H - 0.02, sx * (a - 0.03) + 0.022, 0.284, H + 0.5, c, 0.006, { taper: 0.9 }));
    // sandaran lengan melengkung ke bawah di depan
    const path = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; path.push([sx * (a - 0.03), -0.29 + 0.56 * t, 0.62 + 0.03 * Math.sin(Math.PI * t) - 0.02 * t]); }
    under(m, (p) => p, () => {
      const rings = path.map((p) => [[p[0] - 0.035, p[1], p[2] - 0.03], [p[0] + 0.035, p[1], p[2] - 0.03], [p[0] + 0.03, p[1], p[2] + 0.01], [p[0] - 0.03, p[1], p[2] + 0.01]]);
      loft(m, rings, c);
    });
    rbox(m, sx * (a - 0.03) - 0.015, -0.24, 0.12, sx * (a - 0.03) + 0.015, 0.24, 0.15, c, 0.004);
  }
  rbox(m, -a + 0.03, -0.29, H - 0.08, a - 0.03, -0.26, H - 0.01, c, 0.004);                     // rangka depan berukir (lengkung)
  rbox(m, -a + 0.03, 0.25, H - 0.08, a - 0.03, 0.28, H - 0.01, c, 0.004);
  rbox(m, -a + 0.04, -0.27, H - 0.03, a - 0.04, 0.26, H, c, 0.003);
  // bantalan dudukan (busa berkain, tepi membulat)
  const cush = (z0, z1, x0, x1, y0, y1) => {
    const rings = [];
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, A = (x1 - x0) / 2, B = (y1 - y0) / 2;
    for (const [z, s] of [[z0, 0.92], [z0 + (z1 - z0) * 0.25, 1], [z0 + (z1 - z0) * 0.7, 1], [z1, 0.9]]) {
      const pts = [];
      for (let i = 0; i < 20; i++) { const t = (i / 20) * TAU, se = (v) => Math.sign(v) * Math.abs(v) ** 0.25; pts.push([cx + A * s * se(Math.cos(t)), cy + B * s * se(Math.sin(t)), z]); }
      rings.push(pts);
    }
    loft(m, rings, kain);
  };
  cush(H, H + 0.09, -a + 0.05, a - 0.05, -0.28, 0.24);
  // bantal sandaran tegak (cincin superelips di bidang XZ disambung sepanjang Y), miring ikut tiang
  under(m, rotP([1, 0, 0], -0.15, [0, 0.26, H]), () => {
    const x0 = -a + 0.07, x1 = a - 0.07, z0 = H + 0.1, z1 = H + 0.47, A = (x1 - x0) / 2, Bz = (z1 - z0) / 2, zc = (z0 + z1) / 2, rings = [];
    for (const [y, s] of [[0.17, 0.9], [0.185, 1], [0.225, 1], [0.24, 0.92]]) {
      const pts = [];
      for (let i = 0; i < 20; i++) { const t = (i / 20) * TAU, se = (v) => Math.sign(v) * Math.abs(v) ** 0.25; pts.push([A * s * se(Math.cos(t)), y, zc + Bz * s * se(Math.sin(t))]); }
      rings.push(pts);
    }
    loft(m, rings, kain);
  });
  colBox(m, [-a, -0.3, 0], [a, 0.3, H + 0.09]);
  colBox(m, [-a, 0.22, H], [a, 0.36, H + 0.5]);
  for (const sx of [-1, 1]) colBox(m, [sx > 0 ? a - 0.07 : -a, -0.3, H], [sx > 0 ? a : -a + 0.07, 0.3, 0.64]);
}

// Meja tamu kayu rendah (+ taplak renda di atasnya, bagian TAPLAK terpisah agar bisa disembunyikan)
export function buildMejaTamu(m, o = {}) {
  const c = MAT.jati, W = 1.0, D = 0.55, H = 0.45, a = W / 2, b = D / 2;
  rbox(m, -a, -b, H - 0.03, a, b, H, c, 0.008);
  rbox(m, -a + 0.04, -b + 0.04, H - 0.1, a - 0.04, b - 0.04, H - 0.03, c, 0.004);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) leg(m, sx * (a - 0.06), sy * (b - 0.06), 0, H - 0.03, 0.045, c, 1.25);
  rbox(m, -a + 0.06, -b + 0.06, 0.1, a - 0.06, b - 0.06, 0.12, c, 0.003);                       // rak bawah
  if (o.taplak !== false) part(m, 'TAPLAK', null, () => {
    // taplak renda menjuntai sedikit di tepi
    const tw = 0.7, td = 0.45;
    decalTop(m, 0, 0, H + 0.002, tw, td, MAT.renda, [[0, 0], [3, 0], [3, 2], [0, 2]]);
  });
  colBox(m, [-a, -b, 0], [a, b, H]);
}

// Meja makan kayu 4 kursi (1,2 x 0,75 x 0,75)
export function buildMejaMakan(m) {
  const c = MAT.kayu, W = 1.2, D = 0.75, H = 0.75, a = W / 2, b = D / 2;
  rbox(m, -a, -b, H - 0.028, a, b, H, c, 0.006);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * (a - 0.06), y = sy * (b - 0.06);
    // kaki bubutan: profil putar
    lat(m, [x, y, 0], [0, 0, 1], [[0, 0], [0.022, 0], [0.026, 0.05], [0.02, 0.1], [0.024, 0.35], [0.03, 0.5], [0.024, 0.58], [0.03, 0.6], [0.03, H - 0.11], [0, H - 0.11]], c, 12);
    rbox(m, x - 0.028, y - 0.028, H - 0.11, x + 0.028, y + 0.028, H - 0.028, c, 0.003);
  }
  for (const sy of [-1, 1]) rbox(m, -a + 0.08, sy * (b - 0.06) - 0.012, H - 0.1, a - 0.08, sy * (b - 0.06) + 0.012, H - 0.03, c, 0.003);
  for (const sx of [-1, 1]) rbox(m, sx * (a - 0.06) - 0.012, -b + 0.08, H - 0.1, sx * (a - 0.06) + 0.012, b - 0.08, H - 0.03, c, 0.003);
  colBox(m, [-a, -b, H - 0.11], [a, b, H]);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) colBox(m, [sx * (a - 0.06) - 0.03, sy * (b - 0.06) - 0.03, 0], [sx * (a - 0.06) + 0.03, sy * (b - 0.06) + 0.03, H - 0.11]);
}

// pintu berbingkai (kayu/kaca) dengan engsel di tepi; dibuat di bagian `name`
function cabDoor(m, name, x0, x1, y, z0, z1, frame, panel, hingeLeft, handle = MAT.kuningan, glass = false) {
  const hx = hingeLeft ? x0 : x1;
  part(m, name, [hx, y, z0], () => {
    const t = 0.02, fw = glass ? 0.045 : 0.06;
    rbox(m, x0, y - t, z0, x0 + fw, y, z1, frame, 0.003);
    rbox(m, x1 - fw, y - t, z0, x1, y, z1, frame, 0.003);
    rbox(m, x0 + fw, y - t, z0, x1 - fw, y, z0 + fw, frame, 0.003);
    rbox(m, x0 + fw, y - t, z1 - fw, x1 - fw, y, z1, frame, 0.003);
    if (glass) rbox(m, x0 + fw, y - t * 0.6, z0 + fw, x1 - fw, y - t * 0.4, z1 - fw, MAT.kaca, 0.001);
    else rbox(m, x0 + fw, y - t * 0.8, z0 + fw, x1 - fw, y - t * 0.2, z1 - fw, panel, 0.002);
    const gx = hingeLeft ? x1 - 0.035 : x0 + 0.035, gz = (z0 + z1) / 2;
    rbox(m, gx - 0.006, y - t - 0.018, gz - 0.05, gx + 0.006, y - t, gz + 0.05, handle, 0.003);
  });
}

// Lemari kaca / bufet: badan bawah berpintu kayu, atas berpintu kaca (bisa dibuka), rak berisi piring/gelas pajangan
export function buildBufet(m) {
  const c = MAT.jati, W = 1.2, D = 0.42, H = 1.75, a = W / 2, b = D / 2;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) leg(m, sx * (a - 0.04), sy * (b - 0.04), 0, 0.1, 0.05, c, 1.0);
  rbox(m, -a, -b + 0.02, 0.1, a, b, 0.12, c, 0.003);            // alas
  for (const sx of [-1, 1]) rbox(m, sx * a - 0.02, -b + 0.02, 0.1, sx * a + (sx > 0 ? 0 : 0.02) - (sx > 0 ? 0 : 0), b, H - 0.05, c, 0.003);
  rbox(m, -a, b - 0.015, 0.1, a, b, H - 0.05, c, 0.002);          // punggung
  rbox(m, -a - 0.02, -b, H - 0.05, a + 0.02, b + 0.01, H - 0.02, c, 0.004);
  rbox(m, -a - 0.01, -b + 0.01, H - 0.02, a + 0.01, b, H, c, 0.004);  // mahkota
  rbox(m, -a, -b + 0.02, 0.78, a, b, 0.8, c, 0.003);            // batas badan bawah/atas
  rbox(m, -a, -b + 0.02, 1.25, a, b, 1.265, MAT.kaca, 0.001);   // rak kaca
  // pintu bawah (kayu) & atas (kaca), engsel di sisi luar
  cabDoor(m, 'DOOR_BAWAH_L', -a + 0.02, -0.005, -b + 0.02, 0.13, 0.77, c, MAT.kayuGelap, true);
  cabDoor(m, 'DOOR_BAWAH_R', 0.005, a - 0.02, -b + 0.02, 0.13, 0.77, c, MAT.kayuGelap, false);
  cabDoor(m, 'DOOR_L', -a + 0.02, -0.005, -b + 0.02, 0.81, H - 0.06, c, null, true, MAT.kuningan, true);
  cabDoor(m, 'DOOR_R', 0.005, a - 0.02, -b + 0.02, 0.81, H - 0.06, c, null, false, MAT.kuningan, true);
  // pajangan: piring berdiri, gelas, teko
  for (const x of [-0.4, -0.15, 0.15, 0.4]) under(m, comp(rotP([1, 0, 0], 1.35, [0, 0, 0]), trP([x, b - 0.06, 0.92])), () => piringShape(m, 0.11, MAT.keramik));
  for (const x of [-0.42, -0.3, -0.18, 0.2, 0.32, 0.44]) gelasShape(m, x, -0.02, 1.265, MAT.kaca);
  lat(m, [0, 0, 1.265], [0, 0, 1], [[0, 0], [0.06, 0], [0.075, 0.06], [0.06, 0.13], [0.03, 0.15], [0, 0.16]], MAT.email, 16);
  colBox(m, [-a - 0.02, -b, 0], [a + 0.02, b + 0.01, H]);
  marker(m, 'INTERACT', [0, -b - 0.05, 1.3]);
}

// Lemari pakaian dua pintu — ukuran dalam cukup untuk pemain bersembunyi (dalam 1,14 x 0,62 x 1,85 m)
export function buildLemariPakaian(m) {
  const c = MAT.jati, W = 1.2, D = 0.7, H = 2.05, a = W / 2, b = D / 2, t = 0.025;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) leg(m, sx * (a - 0.04), sy * (b - 0.04), 0, 0.1, 0.06, c, 1.0);
  rbox(m, -a, -b + 0.025, 0.1, a, b, 0.1 + t, c, 0.003);               // alas
  for (const sx of [-1, 1]) rbox(m, sx > 0 ? a - t : -a, -b + 0.025, 0.1, sx > 0 ? a : -a + t, b, H - 0.08, c, 0.003);
  rbox(m, -a, b - 0.015, 0.1, a, b, H - 0.08, c, 0.002);                // punggung
  rbox(m, -a, -b + 0.025, H - 0.08 - t, a, b, H - 0.08, c, 0.003);       // atap dalam
  rbox(m, -a - 0.025, -b - 0.01, H - 0.08, a + 0.025, b + 0.015, H - 0.03, c, 0.005);
  rbox(m, -a - 0.01, -b + 0.0, H - 0.03, a + 0.01, b, H, c, 0.004);
  rbox(m, -a, -b + 0.025, 0.1, a, -b + 0.06, 0.2, c, 0.003);             // papan kaki depan
  rod(m, [-a + t, 0.0, H - 0.25], [a - t, 0.0, H - 0.25], 0.012, MAT.krom, 10);   // gantungan baju
  for (const x of [-0.35, -0.2, 0.25]) {   // beberapa hanger kosong
    sweep(m, [[x, 0, H - 0.25], [x, -0.0, H - 0.22], [x, 0.0, H - 0.28]], 0.003, MAT.logam, 5);
    under(m, trP([x, 0, H - 0.33]), () => sweep(m, [[-0.2, 0, 0], [-0.1, 0, 0.04], [0, 0, 0.055], [0.1, 0, 0.04], [0.2, 0, 0]], 0.006, MAT.plHitam, 6));
  }
  // dua pintu panel kayu, engsel di sisi luar
  const z0 = 0.2, z1 = H - 0.1;
  for (const [name, x0, x1, hl] of [['DOOR_L', -a + 0.005, -0.004, true], ['DOOR_R', 0.004, a - 0.005, false]]) {
    part(m, name, [hl ? x0 : x1, -b + 0.025, z0], () => {
      const y = -b + 0.025;
      rbox(m, x0, y - 0.022, z0, x1, y, z1, c, 0.004);
      const pz = (z1 - z0);
      rbox(m, x0 + 0.07, y - 0.034, z0 + 0.08, x1 - 0.07, y - 0.022, z0 + pz * 0.42, MAT.kayuGelap, 0.006);
      rbox(m, x0 + 0.07, y - 0.034, z0 + pz * 0.5, x1 - 0.07, y - 0.022, z1 - 0.08, MAT.kayuGelap, 0.006);
      const gx = hl ? x1 - 0.045 : x0 + 0.045;
      rbox(m, gx - 0.007, y - 0.05, z0 + pz * 0.45, gx + 0.007, y - 0.022, z0 + pz * 0.45 + 0.13, MAT.kuningan, 0.003);
      // lubang kunci kecil
      if (!hl) lat(m, [gx, y - 0.022, z0 + pz * 0.42], [0, -1, 0], [[0, 0], [0.008, 0], [0.008, 0.004], [0, 0.004]], MAT.kuningan, 8);
      colBox(m, [x0, y - 0.035, z0], [x1, y, z1], name);
    });
  }
  // tabrakan berongga: alas, dua sisi, punggung, atap (pemain bisa masuk saat pintu dibuka)
  colBox(m, [-a, -b, 0], [a, b, 0.2]);
  colBox(m, [-a - 0.02, -b, 0.2], [-a + t, b, H]);
  colBox(m, [a - t, -b, 0.2], [a + 0.02, b, H]);
  colBox(m, [-a, b - 0.02, 0.2], [a, b + 0.015, H]);
  colBox(m, [-a, -b, H - 0.105], [a, b, H]);
  marker(m, 'INTERACT', [0, -b - 0.06, 1.1]);
  marker(m, 'HIDE_SPOT', [0, 0.02, 0.2]);
}

// Dipan kayu + kasur kapuk bergaris + seprai, bantal, guling, selimut motif terlipat
export function buildDipan(m, o = {}) {
  const c = MAT.jati, W = 1.2, L = 2.0, a = W / 2, l = L / 2, Hk = 0.4;
  // rangka: empat tiang, papan kepala tinggi berpanel, papan kaki rendah, balok samping
  for (const [sx, sy] of [[-1, -1], [1, -1]]) lat(m, [sx * (a + 0.02), sy * (l + 0.02), 0], [0, 0, 1], [[0, 0], [0.035, 0], [0.035, 0.6], [0.03, 0.62], [0.04, 0.66], [0, 0.7]], c, 12);
  for (const [sx, sy] of [[-1, 1], [1, 1]]) lat(m, [sx * (a + 0.02), sy * (l + 0.02), 0], [0, 0, 1], [[0, 0], [0.035, 0], [0.035, 1.0], [0.03, 1.02], [0.042, 1.06], [0, 1.12]], c, 12);
  rbox(m, -a, l - 0.0, 0.42, a, l + 0.04, 1.0, c, 0.006);                 // papan kepala
  rbox(m, -a + 0.08, l - 0.012, 0.5, a - 0.08, l, 0.9, MAT.kayuGelap, 0.006);
  rbox(m, -a, -l - 0.04, 0.3, a, -l, 0.6, c, 0.006);                       // papan kaki
  for (const sx of [-1, 1]) rbox(m, sx * (a + 0.02) - 0.02, -l, 0.18, sx * (a + 0.02) + 0.02, l, 0.32, c, 0.004);
  rbox(m, -a, -l, 0.25, a, l, 0.27, MAT.kayuMuda, 0.002);                  // papan alas (ram)
  // kasur kapuk: tebal 13 cm, tepi menggembung
  const mat = o.polos ? MAT.kainKrem : MAT.kasur;
  const pad = (x0, x1, y0, y1, z0, z1, mt, bulge = 0.012, n = 24) => {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, A = (x1 - x0) / 2, B = (y1 - y0) / 2, rings = [];
    for (const [z, s] of [[z0, -bulge * 0.6], [z0 + (z1 - z0) * 0.3, 0], [z0 + (z1 - z0) * 0.5, bulge * 0.3], [z0 + (z1 - z0) * 0.75, 0], [z1, -bulge * 1.2]]) {
      const pts = [];
      for (let i = 0; i < n; i++) { const t = (i / n) * TAU, se = (v) => Math.sign(v) * Math.abs(v) ** 0.18; pts.push([cx + (A + s) * se(Math.cos(t)), cy + (B + s) * se(Math.sin(t)), z]); }
      rings.push(pts);
    }
    loft(m, rings, mt);
  };
  pad(-a + 0.02, a - 0.02, -l + 0.02, l - 0.02, 0.27, Hk + 0.0, mat, 0.015);
  // selimut motif terlipat di kaki kasur
  pad(-a + 0.1, a - 0.1, -l + 0.12, -l + 0.5, Hk, Hk + 0.06, o.selimut ?? MAT.bunga, 0.01, 20);
  // bantal & guling
  for (const x of [-0.27, 0.27]) bantalShape(m, x, l - 0.25, Hk, MAT.kainPutih);
  gulingShape(m, 0.35, 0.1, Hk, MAT.kainPutih, Math.PI / 2 - 0.15);
  colBox(m, [-a - 0.06, -l - 0.06, 0], [a + 0.06, l + 0.06, Hk + 0.02]);
  colBox(m, [-a - 0.06, l, Hk], [a + 0.06, l + 0.06, 1.12]);
}
function bantalShape(m, x, y, z, mt, w = 0.5, d = 0.32, h = 0.12) {
  const rings = [], n = 22;
  for (const [zz, s] of [[0, 0.55], [0.15, 0.85], [0.5, 1.0], [0.85, 0.85], [1, 0.55]]) {
    const pts = [];
    for (let i = 0; i < n; i++) { const t = (i / n) * TAU, se = (v) => Math.sign(v) * Math.abs(v) ** 0.35; const pinch = 1 - 0.08 * Math.abs(Math.sin(2 * t)); pts.push([x + (w / 2) * s * se(Math.cos(t)) * pinch, y + (d / 2) * s * se(Math.sin(t)) * pinch, z + h * zz]); }
    rings.push(pts);
  }
  loft(m, rings, mt);
}
function gulingShape(m, x, y, z, mt, ang = 0, L = 0.9, r = 0.085) {
  under(m, comp(rotP([0, 0, 1], ang), trP([x, y, z + r * 0.9])), () => {
    const prof = [[0, -L / 2], [r * 0.6, -L / 2 + 0.005], [r * 0.95, -L / 2 + 0.05], [r, -L / 2 + 0.12], [r * 0.97, 0], [r, L / 2 - 0.12], [r * 0.95, L / 2 - 0.05], [r * 0.6, L / 2 - 0.005], [0, L / 2]];
    lat(m, [0, 0, 0], [1, 0, 0], prof, mt, 14, { sz: 0.85 });
  });
}
export const buildBantal = (m) => { bantalShape(m, 0, 0, 0, MAT.kainPutih); colBox(m, [-0.26, -0.17, 0], [0.26, 0.17, 0.12]); };
export const buildGuling = (m) => gulingShape(m, 0, 0, 0, MAT.kainPutih, 0);

// Meja TV kayu rendah dengan dua laci & rak terbuka
export function buildMejaTV(m) {
  const c = MAT.jati, W = 1.0, D = 0.42, H = 0.55, a = W / 2, b = D / 2;
  rbox(m, -a, -b, H - 0.025, a, b, H, c, 0.005);
  rbox(m, -a, -b, 0.06, a, b, 0.08, c, 0.003);
  for (const sx of [-1, 1]) rbox(m, sx > 0 ? a - 0.025 : -a, -b, 0.06, sx > 0 ? a : -a + 0.025, b, H - 0.025, c, 0.003);
  rbox(m, -a, b - 0.012, 0.08, a, b, H - 0.025, c, 0.002);
  rbox(m, -0.012, -b, 0.08, 0.012, b, H - 0.025, c, 0.002);
  for (const sx of [-1, 1]) leg(m, sx * (a - 0.04), 0, 0, 0.06, 0.05, c, 1.0);
  // laci kiri, rak kanan berisi kaset/buku
  part(m, 'LACI', [0, 0, 0], () => {
    rbox(m, -a + 0.03, -b - 0.005, H - 0.2, -0.015, -b + 0.015, H - 0.03, c, 0.004);
    rbox(m, -a / 2 - 0.05, -b - 0.022, H - 0.12, -a / 2 + 0.05, -b - 0.005, H - 0.105, MAT.kuningan, 0.003);
  });
  rbox(m, 0.015, -b + 0.01, 0.25, a - 0.025, b - 0.012, 0.27, c, 0.002);
  for (let k = 0; k < 9; k++) rbox(m, 0.04 + k * 0.045, -0.1, 0.27, 0.075 + k * 0.045, 0.1, 0.27 + 0.16 + (k % 3) * 0.02, [MAT.kainMerah, MAT.kainBiru, MAT.kainKrem][k % 3], 0.003);
  colBox(m, [-a, -b, 0], [a, b, H]);
}

// Rak piring kayu bersusun berisi piring berdiri, gelas terbalik, mangkuk
export function buildRakPiring(m) {
  const c = MAT.kayuHijau, W = 0.7, D = 0.3, H = 0.9, a = W / 2, b = D / 2;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rbox(m, sx * a - 0.015, sy * b - 0.015, 0, sx * a + 0.015, sy * b + 0.015, H, c, 0.003);
  for (const z of [0.05, 0.42, 0.78]) {
    for (const sy of [-1, 1]) rbox(m, -a, sy * b - 0.012, z, a, sy * b + 0.012, z + 0.025, c, 0.003);
    for (let k = 0; k < 9; k++) rod(m, [-a + 0.035 + k * 0.079, -b, z + 0.012], [-a + 0.035 + k * 0.079, b, z + 0.012], 0.007, c, 6);
  }
  for (let k = 0; k < 6; k++) under(m, comp(rotP([1, 0, 0], Math.PI / 2 - 0.12), trP([-0.23 + (k % 3) * 0.23, -0.07 + Math.floor(k / 3) * 0.12, 0.445 + 0.118])), () => piringShape(m, 0.115, k % 2 ? MAT.keramik : MAT.email));
  for (let k = 0; k < 5; k++) under(m, comp(rotP([1, 0, 0], Math.PI), trP([-0.25 + k * 0.12, -0.03, 0.08 + 0.12])), () => gelasShape(m, 0, 0, 0, MAT.kaca));
  colBox(m, [-a - 0.02, -b - 0.02, 0], [a + 0.02, b + 0.02, H]);
}

// Bale-bale / dipan bambu (teras, pos): rangka bambu beruas, alas bilah bambu
export function buildBaleBambu(m) {
  const W = 1.8, D = 1.0, H = 0.45, a = W / 2, b = D / 2;
  const bamboo = (p0, p1, r) => { bambuShape(m, p0, p1, r, MAT.bambu); };
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) bamboo([sx * (a - 0.05), sy * (b - 0.05), 0], [sx * (a - 0.05), sy * (b - 0.05), H - 0.02], 0.035);
  for (const sy of [-1, 1]) bamboo([-a, sy * (b - 0.05), H - 0.08], [a, sy * (b - 0.05), H - 0.08], 0.04);
  for (const sx of [-1, 0, 1]) bamboo([sx * (a - 0.05), -b, H - 0.12], [sx * (a - 0.05), b, H - 0.12], 0.035);
  for (const sy of [-1, 1]) bamboo([-a, sy * (b - 0.05), 0.12], [a, sy * (b - 0.05), 0.12], 0.025);
  for (let k = 0; k < 22; k++) {   // bilah alas
    const y = -b + 0.04 + k * ((D - 0.08) / 21);
    rbox(m, -a + 0.02, y - 0.02, H - 0.04, a - 0.02, y + 0.02, H - 0.025, MAT.bambuTua, 0.004);
  }
  colBox(m, [-a, -b, 0], [a, b, H]);
}
// batang bambu beruas: silinder dengan cincin buku tiap ±30 cm
function bambuShape(m, p0, p1, r, mt) {
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], L = Math.hypot(...d), n = d.map((v) => v / L);
  const prof = [[0, 0], [r * 0.95, 0]];
  const nodes = Math.max(1, Math.round(L / 0.3));
  for (let i = 0; i < nodes; i++) {
    const z0 = (L * i) / nodes, z1 = (L * (i + 1)) / nodes;
    prof.push([r, z0 + 0.01], [r * 0.97, (z0 + z1) / 2], [r, z1 - 0.012], [r * 1.07, z1 - 0.004]);
  }
  prof.push([r * 0.95, L], [0, L]);
  lat(m, p0, n, prof, mt, 10);
}

// Bangku panjang kayu (pos ronda): papan tebal, kaki berpalang
export function buildBangkuPanjang(m) {
  const c = MAT.kayu, W = 1.8, a = W / 2, H = 0.45;
  rbox(m, -a, -0.14, H - 0.04, a, 0.14, H, c, 0.006);
  for (const x of [-a + 0.15, a - 0.15]) {
    for (const sy of [-1, 1]) under(m, rotP([1, 0, 0], sy * 0.08, [x, sy * 0.1, H - 0.04]), () => rbox(m, x - 0.025, sy * 0.1 - 0.025, 0, x + 0.025, sy * 0.1 + 0.025, H - 0.04, c, 0.004));
    rbox(m, x - 0.02, -0.12, 0.12, x + 0.02, 0.12, 0.16, c, 0.003);
    rbox(m, x - 0.03, -0.13, H - 0.09, x + 0.03, 0.13, H - 0.04, c, 0.003);
  }
  rbox(m, -a + 0.15, -0.02, 0.13, a - 0.15, 0.02, 0.17, c, 0.003);
  colBox(m, [-a, -0.15, 0], [a, 0.15, H]);
}

// Rak Al-Qur'an kayu kecil dua susun berisi mushaf & buku Iqra
export function buildRakAlquran(m) {
  const c = MAT.kayuGelap, W = 0.6, D = 0.25, H = 0.8, a = W / 2, b = D / 2;
  for (const sx of [-1, 1]) rbox(m, sx > 0 ? a - 0.02 : -a, -b, 0, sx > 0 ? a : -a + 0.02, b, H, c, 0.004);
  rbox(m, -a, b - 0.01, 0.0, a, b, H, c, 0.002);
  for (const z of [0.0, 0.38, H - 0.02]) rbox(m, -a + 0.02, -b, z, a - 0.02, b, z + 0.02, c, 0.003);
  rbox(m, -a - 0.01, -b - 0.01, H, a + 0.01, b + 0.01, H + 0.02, c, 0.004);
  const book = (x, z, w, h, mt) => {
    rbox(m, x, -0.1, z, x + w, 0.1, z + h, mt, 0.003);
    decal(m, [x - 0.0005, -0.1 + 0.005, z + 0.005], [x - 0.0005, 0.1 - 0.005, z + 0.005], [x - 0.0005, 0.1 - 0.005, z + h - 0.005], [x - 0.0005, -0.1 + 0.005, z + h - 0.005], LBL('alquran'), [-1, 0, 0]);
  };
  for (let k = 0; k < 8; k++) rbox(m, -0.26 + k * 0.035, -0.1, 0.02, -0.26 + k * 0.035 + 0.03, 0.08, 0.02 + 0.27, [MAT.kainHijau, MAT.kainMerah, MAT.kainBiru][k % 3], 0.003);
  for (let k = 0; k < 5; k++) rbox(m, -0.26 + k * 0.05, -0.1, 0.4, -0.26 + k * 0.05 + 0.045, 0.1, 0.4 + 0.28, MAT.kainHijau, 0.003);
  decalFront(m, -0.16, -0.1005, 0.54, 0.04, 0.26, LBL('alquran'));
  colBox(m, [-a, -b, 0], [a, b, H + 0.02]);
}

// Mimbar kayu sederhana (masjid kampung): kotak berdinding panel, tangga tiga anak, tiang & kubah kecil
export function buildMimbar(m) {
  const c = MAT.jati, W = 0.9, D = 1.3, a = W / 2, b = D / 2, Hp = 0.75;
  rbox(m, -a, -b + 0.4, 0, a, b, Hp, c, 0.006);                        // badan/lantai atas
  for (let k = 0; k < 3; k++) rbox(m, -a + 0.08, -b + k * 0.13, 0, a - 0.08, -b + 0.4, 0.2 + k * 0.2, c, 0.005);   // anak tangga
  for (const sx of [-1, 1]) {
    // pegangan tangga miring + panel samping
    const x = sx * (a - 0.02);
    rbox(m, x - 0.02, -b, 0, x + 0.02, -b + 0.4, 0.75, c, 0.004);
    rod(m, [x, -b, 0.85], [x, -b + 0.4, 1.3], 0.022, c, 10);
    lat(m, [x, -b, 0], [0, 0, 1], [[0, 0], [0.035, 0], [0.035, 0.9], [0.05, 0.95], [0, 1.02]], c, 12);
    rbox(m, x - 0.02, -b + 0.4, Hp, x + 0.02, b, Hp + 0.55, c, 0.004);    // sandaran samping
    rbox(m, x - 0.012, -b + 0.42, Hp + 0.08, x + 0.012, b - 0.02, Hp + 0.48, MAT.kayuGelap, 0.004);
  }
  rbox(m, -a, b - 0.04, Hp, a, b, Hp + 1.0, c, 0.005);                     // sandaran belakang tinggi
  rbox(m, -a + 0.1, b - 0.05, Hp + 0.2, a - 0.1, b - 0.04, Hp + 0.85, MAT.kayuGelap, 0.004);
  // lengkung atas + kubah kecil
  for (let i = 0; i < 1; i++) {
    const rings = [];
    for (let k = 0; k <= 12; k++) { const t = (k / 12) * Math.PI, x = -a * Math.cos(t), z = Hp + 1.0 + 0.18 * Math.sin(t); rings.push([[x, b - 0.045, z - 0.03], [x, b + 0.005, z - 0.03], [x, b + 0.005, z + 0.02], [x, b - 0.045, z + 0.02]]); }
    loft(m, rings, c);
  }
  lat(m, [0, b - 0.02, Hp + 1.2], [0, 0, 1], [[0, 0], [0.06, 0], [0.06, 0.03], [0.05, 0.08], [0.02, 0.13], [0.004, 0.2], [0, 0.21]], MAT.kuningan, 12);
  rbox(m, -a + 0.05, -b + 0.4, Hp, a - 0.05, b - 0.05, Hp + 0.03, MAT.kainHijau, 0.008);     // alas duduk karpet
  colBox(m, [-a, -b, 0], [a, b, Hp]);
  colBox(m, [-a, b - 0.05, Hp], [a, b, Hp + 1.2]);
}

// ============================================================================ ELEKTRONIK
// TV tabung 21": kotak belakang meruncing, bingkai depan, layar cembung terpisah (SCREEN) untuk SubViewport
export function buildTVTabung(m, o = {}) {
  const S = o.s ?? 1, W = 0.62 * S, Hh = 0.5 * S, D = 0.46 * S, body = o.mat ?? MAT.plHitam;
  const a = W / 2, z0 = 0.0;
  // bingkai depan
  rbox(m, -a, -D / 2, z0, a, -D / 2 + 0.09 * S, z0 + Hh, body, 0.012);
  // punggung tabung meruncing
  const rings = [rring(0, -D / 2 + 0.09 * S, z0 + Hh / 2, a - 0.01, 0, 0.02), rring(0, D / 2 - 0.02, z0 + Hh / 2, a * 0.55, 0, 0.04)];
  // cincin vertikal: buat di bidang XZ lalu loft sepanjang Y
  const sec = (y, sx, sz, ch) => {
    const A = sx / 2, B = sz / 2, c = ch, zc = z0 + Hh / 2 + (o.drop ?? 0);
    return [[-A + c, y, zc - B], [A - c, y, zc - B], [A, y, zc - B + c], [A, y, zc + B - c], [A - c, y, zc + B], [-A + c, y, zc + B], [-A, y, zc + B - c], [-A, y, zc - B + c]];
  };
  loft(m, [sec(-D / 2 + 0.09 * S, W - 0.02, Hh - 0.02, 0.03), sec(-D / 2 + 0.2 * S, W * 0.86, Hh * 0.88, 0.04), sec(D / 2 - 0.03, W * 0.5, Hh * 0.55, 0.05), sec(D / 2, W * 0.46, Hh * 0.5, 0.05)], body);
  for (let k = 0; k < 6; k++) rbox(m, -0.12 * S, D / 2 - 0.12 * S + k * 0.0, z0 + Hh * 0.62 + k * 0.025 * S, 0.12 * S, D / 2 - 0.08 * S, z0 + Hh * 0.62 + k * 0.025 * S + 0.008, MAT.plAbu, 0.002);   // kisi
  // panel tombol bawah depan
  rbox(m, -a + 0.04 * S, -D / 2 - 0.004, z0 + 0.015 * S, a - 0.04 * S, -D / 2 + 0.01, z0 + 0.06 * S, MAT.plAbu, 0.004);
  for (let k = 0; k < 4; k++) rbox(m, 0.08 * S + k * 0.035 * S, -D / 2 - 0.01, z0 + 0.025 * S, 0.1 * S + k * 0.035 * S, -D / 2 - 0.002, z0 + 0.045 * S, MAT.plHitam, 0.003);
  lat(m, [-0.18 * S, -D / 2 - 0.004, z0 + 0.037 * S], [0, -1, 0], [[0, 0], [0.008, 0], [0.008, 0.004], [0, 0.004]], MAT.plMerah, 8);   // lampu daya
  // layar cembung (bagian SCREEN): grid lengkung dengan UV 0..1
  const sw = W * 0.78, sh = Hh * 0.72, scz = z0 + Hh * 0.56, sy = -D / 2 - 0.002;
  part(m, 'SCREEN', null, () => {
    const nx = 8, nz = 6;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const P = (u, v) => { const x = -sw / 2 + sw * u, z = scz - sh / 2 + sh * v; const bulge = 0.025 * S * (1 - (2 * u - 1) ** 2) * (1 - (2 * v - 1) ** 2); return [x, sy - bulge, z]; };
      const u0 = i / nx, u1 = (i + 1) / nx, v0 = j / nz, v1 = (j + 1) / nz;
      F(m, [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], V3(0, -1, 0), MAT.layar, null, { uv: [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], soft: true });
    }
  });
  // antena V di atas (TV kampung)
  if (o.antena !== false) {
    lat(m, [0, 0.05 * S, z0 + Hh - 0.02], [0, 0, 1], [[0, 0], [0.04, 0], [0.035, 0.03], [0, 0.035]], MAT.plHitam, 12);
    for (const sx of [-1, 1]) rod(m, [0, 0.05 * S, z0 + Hh + 0.01], [sx * 0.22 * S, 0.12 * S, z0 + Hh + 0.42 * S], 0.003, MAT.krom, 6);
  }
  colBox(m, [-a, -D / 2, 0], [a, D / 2, Hh]);
  marker(m, 'INTERACT', [0, -D / 2 - 0.05, scz]);
  marker(m, 'SCREEN_CENTER', [0, sy - 0.03, scz]);
}

// Radio transistor dua band: badan kotak tumpul, kisi pengeras suara, skala gelombang, kenop, antena teleskop, pegangan
export function buildRadio(m) {
  const W = 0.3, H = 0.17, D = 0.08, a = W / 2;
  rbox(m, -a, -D / 2, 0.0, a, D / 2, H, MAT.plKrem, 0.012);
  rbox(m, -a - 0.002, -D / 2 - 0.002, 0.0, a + 0.002, D / 2 + 0.002, 0.015, MAT.plHitam, 0.006);
  // kisi speaker (lingkaran lubang)
  lat(m, [-0.06, -D / 2 - 0.001, H * 0.45], [0, -1, 0], [[0, 0], [0.062, 0], [0.062, 0.003], [0, 0.003]], MAT.logam, 20);
  for (let k = -4; k <= 4; k++) rbox(m, -0.06 - 0.055, -D / 2 - 0.006, H * 0.45 + k * 0.012 - 0.002, -0.06 + 0.055 * Math.sqrt(1 - (k / 5) ** 2) * 0 + 0.055, -D / 2 - 0.003, H * 0.45 + k * 0.012 + 0.002, MAT.plHitam, 0.001);
  // skala gelombang (label kertas kecil) + kenop
  decalFront(m, 0.07, -D / 2 - 0.0015, H * 0.66, 0.1, 0.04, LBL('timbangan'), [[0.1, 0.4], [0.9, 0.4], [0.9, 0.6], [0.1, 0.6]]);
  for (const x of [0.04, 0.1]) lat(m, [x, -D / 2, H * 0.3], [0, -1, 0], [[0, 0], [0.016, 0], [0.016, 0.014], [0.012, 0.018], [0, 0.018]], MAT.plHitam, 14);
  // pegangan & antena
  sweep(m, [[-a + 0.03, 0, H], [-a + 0.04, 0, H + 0.04], [0, 0, H + 0.05], [a - 0.04, 0, H + 0.04], [a - 0.03, 0, H]], 0.007, MAT.plHitam, 8);
  rod(m, [a - 0.02, 0.025, H], [a + 0.12, 0.03, H + 0.35], 0.003, MAT.krom, 6, 0.0018);
  marker(m, 'INTERACT', [0, -0.12, 0.09]);
  marker(m, 'AUDIO', [-0.06, -0.05, 0.08]);
  colBox(m, [-a, -D / 2, 0], [a, D / 2, H]);
}

// Kipas angin berdiri: dasar bulat, tiang teleskop, rumah motor, kisi pelindung, bilah (BLADES) berputar di sumbu Y
export function buildKipasBerdiri(m) {
  const Hc = 1.15;
  lat(m, [0, 0, 0], [0, 0, 1], [[0, 0], [0.2, 0], [0.205, 0.015], [0.18, 0.04], [0.05, 0.06], [0, 0.065]], MAT.plPutih, 24);
  lat(m, [0, 0, 0.05], [0, 0, 1], [[0, 0], [0.03, 0], [0.025, 0.55], [0, 0.55]], MAT.plPutih, 12);
  rod(m, [0, 0, 0.6], [0, 0, Hc - 0.12], 0.012, MAT.krom, 10);
  // panel tombol di dasar
  for (let k = 0; k < 4; k++) rbox(m, -0.05 + k * 0.026, -0.17, 0.03, -0.032 + k * 0.026, -0.14, 0.045, k === 0 ? MAT.plMerah : MAT.plBiru, 0.003);
  // rumah motor
  lat(m, [0, 0.12, Hc], [0, -1, 0], [[0, 0], [0.06, 0], [0.075, 0.04], [0.075, 0.1], [0.05, 0.13], [0, 0.14]], MAT.plPutih, 16);
  rod(m, [0, 0.05, Hc - 0.12], [0, 0.05, Hc - 0.05], 0.02, MAT.plPutih, 10);
  // kisi pelindung: dua cincin + jari-jari kawat
  const R = 0.21, yc = -0.04;
  for (const [y, r] of [[yc - 0.05, R], [yc + 0.04, R]]) lat(m, [0, y, Hc], [0, 1, 0], [[r - 0.006, -0.004], [r, -0.004], [r, 0.004], [r - 0.006, 0.004]], MAT.plPutih, 32);
  for (let k = 0; k < 24; k++) {
    const t = (k / 24) * TAU, c = Math.cos(t), s = Math.sin(t);
    sweep(m, [[c * R, yc + 0.04, Hc + s * R], [c * R * 0.6, yc + 0.07, Hc + s * R * 0.6], [c * 0.04, yc + 0.08, Hc + s * 0.04]], 0.0016, MAT.krom, 4, { cap: false });
    sweep(m, [[c * R, yc - 0.05, Hc + s * R], [c * R * 0.6, yc - 0.08, Hc + s * R * 0.6], [c * 0.05, yc - 0.09, Hc + s * 0.05]], 0.0016, MAT.krom, 4, { cap: false });
  }
  lat(m, [0, yc - 0.09, Hc], [0, -1, 0], [[0, 0], [0.045, 0], [0.04, 0.008], [0, 0.012]], MAT.plBiru, 16);   // emblem tengah
  // bilah (BLADES), pivot di sumbu
  part(m, 'BLADES', [0, yc, Hc], () => bilah(m, [0, yc, Hc], [0, 1, 0], 0.18, 3, MAT.plBening));
  colBox(m, [-0.21, -0.21, 0], [0.21, 0.21, 0.07]);
  colBox(m, [-0.04, -0.04, 0.07], [0.04, 0.04, Hc - 0.2]);
  colBox(m, [-0.22, -0.15, Hc - 0.22], [0.22, 0.26, Hc + 0.22]);
  marker(m, 'INTERACT', [0, -0.25, 0.1]);
}
// bilah kipas: n daun melengkung di sekitar sumbu ax
function bilah(m, c, ax, R, n, mt, pitch = 0.35) {
  lat(m, [c[0] - ax[0] * 0.02, c[1] - ax[1] * 0.02, c[2] - ax[2] * 0.02], ax, [[0, 0], [0.035, 0], [0.035, 0.04], [0, 0.045]], mt, 14);
  const A = V3(...ax).normalize(), U = Math.abs(A.z) < 0.9 ? new THREE.Vector3().crossVectors(A, V3(0, 0, 1)).normalize() : V3(1, 0, 0), W = new THREE.Vector3().crossVectors(A, U).normalize();
  for (let k = 0; k < n; k++) {
    const t0 = (k / n) * TAU, pts = [];
    const rings = [];
    for (let i = 0; i <= 6; i++) {
      const r = 0.03 + (R - 0.03) * (i / 6), half = 0.25 + 0.35 * Math.sin(Math.PI * (i / 6) * 0.85);
      const ring = [];
      for (const s of [-1, -0.33, 0.33, 1]) {
        const ang = t0 + s * half * (0.07 / Math.max(r, 0.05)) * 2.2;
        const lift = s * pitch * 0.03;
        const p = U.clone().multiplyScalar(Math.cos(ang) * r).add(W.clone().multiplyScalar(Math.sin(ang) * r)).add(A.clone().multiplyScalar(lift + 0.02));
        ring.push([c[0] + p.x, c[1] + p.y, c[2] + p.z]);
      }
      const th = 0.0015;
      const top = ring.map((q) => [q[0] + A.x * th, q[1] + A.y * th, q[2] + A.z * th]);
      rings.push([...ring, ...top.reverse()]);
    }
    loft(m, rings, mt);
  }
}

// Kipas angin langit-langit: batang gantung, rumah motor, 3 bilah kayu (BLADES berputar di sumbu Z). Pivot di plafon (z=0 = langit-langit, menggantung ke bawah)
export function buildKipasPlafon(m) {
  // dibangun terbalik: z=0 di langit-langit, benda di z negatif; ekspor menggeser pivot ke dasar
  const Z = 0.6;
  lat(m, [0, 0, Z - 0.0], [0, 0, -1], [[0, 0], [0.06, 0], [0.06, 0.03], [0.02, 0.06], [0, 0.06]], MAT.catPutih, 16);
  rod(m, [0, 0, Z - 0.05], [0, 0, Z - 0.35], 0.012, MAT.catPutih, 10);
  lat(m, [0, 0, Z - 0.35], [0, 0, -1], [[0, 0], [0.04, 0], [0.09, 0.03], [0.095, 0.08], [0.06, 0.11], [0, 0.12]], MAT.catPutih, 20);
  part(m, 'BLADES', [0, 0, Z - 0.45], () => {
    lat(m, [0, 0, Z - 0.45], [0, 0, -1], [[0, 0], [0.07, 0], [0.065, 0.03], [0, 0.04]], MAT.catPutih, 16);
    for (let k = 0; k < 3; k++) {
      const t = (k / 3) * TAU;
      under(m, comp(rotP([1, 0, 0], 0.12), rotP([0, 0, 1], t), trP([0, 0, Z - 0.47])), () => {
        rbox(m, 0.05, -0.012, -0.004, 0.17, 0.012, 0.004, MAT.logam, 0.002);
        const rings = [];
        for (let i = 0; i <= 4; i++) { const x = 0.16 + (0.56 * i) / 4, w = 0.055 + 0.02 * Math.sin((Math.PI * i) / 4) * 0.5 + (i === 4 ? -0.01 : 0); rings.push([[x, -w, -0.005], [x, w, -0.005], [x, w, 0.005], [x, -w, 0.005]]); }
        loft(m, rings, MAT.kayu);
      });
    }
  });
  marker(m, 'CEILING', [0, 0, Z]);
}

// Lampu neon batang 60 cm + rumah/fitting logam; bagian TUBE emisif; marker LIGHT di tengah tabung
export function buildLampuNeon(m, o = {}) {
  const L = o.L ?? 0.62, a = L / 2;
  rbox(m, -a - 0.03, -0.035, 0.0, a + 0.03, 0.035, 0.035, MAT.catPutih, 0.006);     // rumah (menempel plafon/dinding, alas z=0)
  for (const sx of [-1, 1]) rbox(m, sx * (a + 0.01) - 0.015, -0.022, -0.04, sx * (a + 0.01) + 0.015, 0.022, 0.0, MAT.plPutih, 0.004);   // fitting
  part(m, 'TUBE', null, () => rod(m, [-a, 0, -0.022], [a, 0, -0.022], 0.013, MAT.neon, 12));
  for (const sx of [-1, 1]) rod(m, [sx * a, 0, -0.022], [sx * (a - 0.02), 0, -0.022], 0.0135, MAT.logam, 12);
  marker(m, 'LIGHT', [0, 0, -0.06], { type: 'neon', color: '#f4f6ff', energy: 1.6 });
}
// Bohlam gantung dengan kabel & fitting
export function buildBohlam(m) {
  const Z = 0.6;
  lat(m, [0, 0, Z], [0, 0, -1], [[0, 0], [0.035, 0], [0.035, 0.012], [0, 0.015]], MAT.plPutih, 12);
  sweep(m, [[0, 0, Z - 0.01], [0.004, 0, Z - 0.2], [0, 0, Z - 0.42]], 0.003, MAT.plHitam, 6);
  lat(m, [0, 0, Z - 0.42], [0, 0, -1], [[0, 0], [0.018, 0], [0.018, 0.05], [0.014, 0.06], [0, 0.06]], MAT.plHitam, 12);
  part(m, 'BULB', null, () => lat(m, [0, 0, Z - 0.48], [0, 0, -1], [[0, 0], [0.013, 0], [0.014, 0.012], [0.03, 0.04], [0.032, 0.06], [0.026, 0.08], [0.012, 0.09], [0, 0.092]], MAT.neon, 16));
  marker(m, 'LIGHT', [0, 0, Z - 0.53], { type: 'bulb', color: '#ffd9a0', energy: 1.2 });
  marker(m, 'CEILING', [0, 0, Z]);
}

// TV kecil 14" (warung) di atas papan dinding
export const buildTVKecil = (m) => buildTVTabung(m, { s: 0.68, mat: MAT.plAbu, antena: true });

// ============================================================================ DINDING
export function buildKalender(m) {
  // papan karton menggantung di paku, 0,32 x 0,48 m; menempel dinding (punggung y=0 menghadap +Y), depan -Y
  const w = 0.32, h = 0.48;
  rbox(m, -w / 2, -0.003, 0, w / 2, 0, h, MAT.kertas, 0.0005);
  decalFront(m, 0, -0.0032, h / 2, w, h, LBL('kalender'));
  rbox(m, -w / 2 - 0.005, -0.008, h - 0.012, w / 2 + 0.005, 0.0, h + 0.004, MAT.logam, 0.002);   // penjepit atas
  sweep(m, [[-0.04, -0.004, h], [0, -0.004, h + 0.06], [0.04, -0.004, h]], 0.0012, MAT.kain, 4);
  rod(m, [0, 0.0, h + 0.058], [0, -0.03, h + 0.058], 0.0025, MAT.logam, 6);
  meta(m).wall = true;
}
export function buildJamDinding(m) {
  const R = 0.15;
  lat(m, [0, 0, R], [0, -1, 0], [[0, 0], [R - 0.012, 0], [R, 0.006], [R + 0.004, 0.025], [R - 0.004, 0.04], [R - 0.016, 0.042], [R - 0.016, 0.03], [0, 0.03]], MAT.plKrem, 32);
  const n = 16, pts = [], uv = [];
  part(m, null, null, () => {
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * TAU, t1 = ((i + 1) / n) * TAU, rr = R - 0.016;
      F(m, [[0, -0.0315, R], [Math.cos(t0) * rr, -0.0315, R + Math.sin(t0) * rr], [Math.cos(t1) * rr, -0.0315, R + Math.sin(t1) * rr]], V3(0, -1, 0), LBL('jam'), null,
        { uv: [[0.5, 0.5], [0.5 + 0.5 * Math.cos(t0) * 0.97, 0.5 + 0.5 * Math.sin(t0) * 0.97], [0.5 + 0.5 * Math.cos(t1) * 0.97, 0.5 + 0.5 * Math.sin(t1) * 0.97]], soft: false });
    }
  });
  lat(m, [0, -0.031, R], [0, -1, 0], [[R - 0.017, 0], [R - 0.014, 0.002], [R - 0.016, 0.012]], MAT.kaca, 32);
  meta(m).wall = true;
}
export function buildBingkaiFoto(m, o = {}) {
  const w = o.w ?? 0.4, h = o.h ?? 0.3, f = 0.035;
  const bar = (x0, z0, x1, z1) => rbox(m, x0, -0.02, z0, x1, 0, z1, MAT.kayuGelap, 0.006);
  bar(-w / 2, 0, w / 2, f); bar(-w / 2, h - f, w / 2, h); bar(-w / 2, f, -w / 2 + f, h - f); bar(w / 2 - f, f, w / 2, h - f);
  rbox(m, -w / 2 + f, -0.008, f, w / 2 - f, -0.004, h - f, MAT.kertas, 0.0005);
  decalFront(m, 0, -0.0085, h / 2, w - 2 * f, h - 2 * f, LBL('foto'));
  rbox(m, -w / 2 + f, -0.012, f, w / 2 - f, -0.011, h - f, MAT.kaca, 0.0003);
  // paku + tali, bingkai sedikit miring ke depan
  meta(m).wall = true;
}
export function buildCermin(m) {
  const w = 0.4, h = 0.6;
  lat(m, [0, 0, h / 2], [0, -1, 0], [[0, 0], [0.2, 0], [0.215, 0.008], [0.21, 0.022], [0.19, 0.025], [0.18, 0.012], [0, 0.012]], MAT.kayuGelap, 32, { sz: 1.5 });
  part(m, 'MIRROR', null, () => lat(m, [0, -0.0125, h / 2], [0, -1, 0], [[0, 0], [0.181, 0], [0, 0.0005]], MAT.cermin, 32, { sz: 1.5 }));
  meta(m).wall = true;
}
// Stopkontak dinding + kabel melingkar ke steker
export function buildStopkontak(m) {
  rbox(m, -0.04, -0.015, 0.3, 0.04, 0, 0.38, MAT.plPutih, 0.006);
  for (const x of [-0.012, 0.012]) lat(m, [x, -0.0155, 0.34], [0, -1, 0], [[0, 0], [0.004, 0], [0, 0.001]], MAT.plHitam, 8);
  rbox(m, -0.02, -0.04, 0.32, 0.02, -0.015, 0.36, MAT.plHitam, 0.006);    // steker
  const path = [[0, -0.04, 0.34]];
  for (let i = 1; i <= 16; i++) { const t = i / 16; path.push([0.05 * Math.sin(t * 6), -0.06 - 0.15 * t, 0.34 * (1 - t) ** 2 + 0.004]); }
  for (let i = 1; i <= 20; i++) { const t = i / 20; path.push([0.05 * Math.sin(6) + 0.3 * t, -0.21 - 0.1 * Math.sin(t * 5), 0.004]); }
  sweep(m, path, 0.0035, MAT.plHitam, 6);
  meta(m).wall = true;
}

// ============================================================================ DAPUR
function piringShape(m, r, mt) {
  lat(m, [0, 0, 0], [0, 0, 1], [[0, 0], [r * 0.45, 0], [r * 0.47, 0.006], [r * 0.6, 0.008], [r * 0.95, 0.02], [r, 0.024], [r * 0.97, 0.026], [r * 0.6, 0.012], [0, 0.012]], mt, 24);
}
function gelasShape(m, x, y, z, mt, h = 0.11) {
  // gelas belimbing: penampang bergerigi (rusuk), dinding tebal
  const seg = 16, rings = [], inner = [];
  const R = (zz, i) => (0.03 + 0.008 * (zz / h)) * (1 + 0.04 * Math.cos(i * 1.0 * Math.PI));
  for (const zz of [0, 0.006, h]) rings.push([...Array(seg)].map((_, i) => { const t = (i / seg) * TAU; return [x + Math.cos(t) * R(zz, i), y + Math.sin(t) * R(zz, i), z + zz]; }));
  loft(m, rings, mt, { cap: false });
  lat(m, [x, y, z], [0, 0, 1], [[0, 0], [0.03, 0], [0.03, 0.002], [0, 0.002]], mt, seg);
  const inn = [h - 0.001, 0.008].map((zz) => [...Array(seg)].map((_, i) => { const t = (i / seg) * TAU; const r = R(zz, i) - 0.0025; return [x + Math.cos(t) * r, y + Math.sin(t) * r, z + zz]; }));
  loft(m, inn, mt, { cap: false, inward: true });
  loft(m, [rings[2], inn[0]], mt, { cap: false });
  lat(m, [x, y, z + 0.008], [0, 0, 1], [[0, 0], [0.027, 0], [0, 0.0001]], mt, seg);
}
export const buildPiring = (m) => piringShape(m, 0.12, MAT.keramik);
export const buildGelas = (m) => gelasShape(m, 0, 0, 0, MAT.kaca);
export function buildCangkir(m) {
  lat(m, [0, 0, 0], [0, 0, 1], [[0, 0], [0.025, 0], [0.026, 0.006], [0.038, 0.03], [0.042, 0.07], [0.039, 0.07], [0.035, 0.03], [0.022, 0.012], [0, 0.012]], MAT.keramik, 20);
  sweep(m, [[0.04, 0, 0.058], [0.058, 0, 0.055], [0.062, 0, 0.038], [0.05, 0, 0.022], [0.037, 0, 0.022]], 0.0045, MAT.keramik, 8);
  piringShapeLow(m);
}
function piringShapeLow(m) { lat(m, [0, 0, -0.008], [0, 0, 1], [[0, 0], [0.04, 0], [0.065, 0.006], [0.072, 0.01], [0.06, 0.008], [0, 0.007]], MAT.keramik, 20); }
export function buildTeko(m) {
  lat(m, [0, 0, 0], [0, 0, 1], [[0, 0], [0.06, 0], [0.065, 0.005], [0.085, 0.05], [0.082, 0.1], [0.06, 0.135], [0.045, 0.14], [0.045, 0.145], [0, 0.145]], MAT.email, 24);
  lat(m, [0, 0, 0.145], [0, 0, 1], [[0, 0], [0.047, 0], [0.04, 0.015], [0.012, 0.02], [0.012, 0.03], [0.006, 0.035], [0, 0.035]], MAT.email, 20);
  sweep(m, [[0.07, 0, 0.04], [0.11, 0, 0.08], [0.14, 0, 0.14], [0.155, 0, 0.15]], (t) => 0.016 - 0.01 * t, MAT.email, 10);
  sweep(m, [[-0.075, 0, 0.12], [-0.12, 0, 0.12], [-0.13, 0, 0.07], [-0.08, 0, 0.035]], 0.007, MAT.email, 8);
  // garis biru tepi
  lat(m, [0, 0, 0.098], [0, 0, 1], [[0.0828, 0], [0.0832, 0.006], [0.082, 0.01]], MAT.keramikBiru, 24);
}
export function buildPanci(m) {
  lat(m, [0, 0, 0], [0, 0, 1], [[0, 0], [0.1, 0], [0.105, 0.005], [0.105, 0.13], [0.11, 0.135], [0.1, 0.135], [0.1, 0.008], [0, 0.008]], MAT.logam, 28);
  for (const sx of [-1, 1]) sweep(m, [[sx * 0.105, 0, 0.11], [sx * 0.135, 0, 0.115], [sx * 0.14, 0, 0.1], [sx * 0.105, 0, 0.09]], 0.006, MAT.besiHitam, 8);
  part(m, 'TUTUP', null, () => {
    lat(m, [0, 0, 0.133], [0, 0, 1], [[0, 0], [0.108, 0], [0.1, 0.012], [0.06, 0.025], [0, 0.028]], MAT.logam, 28);
    lat(m, [0, 0, 0.16], [0, 0, 1], [[0, 0], [0.012, 0], [0.018, 0.012], [0.015, 0.02], [0, 0.022]], MAT.besiHitam, 12);
  });
}
export function buildWajan(m) {
  lat(m, [0, 0, 0], [0, 0, 1], [[0, 0], [0.07, 0], [0.14, 0.03], [0.17, 0.07], [0.175, 0.078], [0.168, 0.078], [0.135, 0.035], [0.068, 0.007], [0, 0.007]], MAT.besiHitam, 32);
  for (const sx of [-1, 1]) sweep(m, [[sx * 0.165, 0, 0.068], [sx * 0.2, 0, 0.075], [sx * 0.205, 0, 0.09], [sx * 0.18, 0, 0.094]], 0.006, MAT.besiHitam, 8);
}
export function buildSendok(m) {
  const path = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; path.push([0, -0.09 + 0.17 * t, 0.004 + 0.012 * t * t]); }
  sweep(m, path, (t) => 0.0025 + 0.002 * t, MAT.krom, 6);
  lat(m, [0, -0.11, 0.004], [0, 0, 1], [[0, 0], [0.018, 0.001], [0.02, 0.006], [0.016, 0.007], [0, 0.003]], MAT.krom, 14, { sx: 0.75, sy: 1.25 });
}
// Kompor gas 2 tungku (badan baja enamel, tungku kuningan, penyangga besi, kenop)
export function buildKompor(m) {
  const W = 0.68, D = 0.38, H = 0.1, a = W / 2, b = D / 2;
  rbox(m, -a, -b, 0.01, a, b, H, MAT.catKrem, 0.01);
  rbox(m, -a + 0.01, -b + 0.01, H - 0.001, a - 0.01, b - 0.01, H + 0.004, MAT.besiHitam, 0.004);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lat(m, [sx * (a - 0.04), sy * (b - 0.04), 0], [0, 0, 1], [[0, 0], [0.015, 0], [0.015, 0.012], [0, 0.012]], MAT.karet, 8);
  for (const sx of [-1, 1]) {
    const cx = sx * 0.17;
    lat(m, [cx, 0.02, H], [0, 0, 1], [[0, 0], [0.055, 0], [0.055, 0.012], [0.045, 0.02], [0.035, 0.02], [0.035, 0.026], [0, 0.026]], MAT.kuningan, 20);
    lat(m, [cx, 0.02, H + 0.026], [0, 0, 1], [[0, 0], [0.03, 0], [0.028, 0.01], [0, 0.012]], MAT.besiHitam, 16);
    for (let k = 0; k < 5; k++) {   // penyangga panci (kaki laba-laba)
      const t = (k / 5) * TAU, c = Math.cos(t), s = Math.sin(t);
      sweep(m, [[cx + c * 0.06, 0.02 + s * 0.06, H + 0.004], [cx + c * 0.105, 0.02 + s * 0.105, H + 0.004], [cx + c * 0.105, 0.02 + s * 0.105, H + 0.045], [cx + c * 0.07, 0.02 + s * 0.07, H + 0.045]], 0.004, MAT.besiHitam, 6);
    }
    lat(m, [cx, 0.02, H + 0.004], [0, 0, 1], [[0.1, 0], [0.108, 0], [0.108, 0.008], [0.1, 0.008]], MAT.besiHitam, 24);
    lat(m, [cx, -b, 0.055], [0, -1, 0], [[0, 0], [0.022, 0], [0.022, 0.02], [0.016, 0.028], [0, 0.028]], MAT.plHitam, 16);
    rbox(m, cx - 0.004, -b - 0.03, 0.055 - 0.018, cx + 0.004, -b - 0.022, 0.055 + 0.018, MAT.krom, 0.002);
  }
  rod(m, [a, 0.1, 0.05], [a + 0.04, 0.1, 0.05], 0.008, MAT.kuningan, 8);   // nipel selang
  marker(m, 'INTERACT', [0, -b - 0.05, 0.1]);
  marker(m, 'FIRE_L', [-0.17, 0.02, H + 0.03]);
  marker(m, 'FIRE_R', [0.17, 0.02, H + 0.03]);
  colBox(m, [-a, -b, 0], [a, b, H + 0.05]);
}
// Tabung gas 3 kg hijau ("melon"): badan bulat lonjong, kaki cincin, pegangan cincin, katup + regulator & selang
export function buildTabungGas(m, o = {}) {
  lat(m, [0, 0, 0], [0, 0, 1], [[0, 0], [0.09, 0], [0.09, 0.04], [0.085, 0.045], [0, 0.045]], MAT.catHijau, 24);
  lat(m, [0, 0, 0.03], [0, 0, 1], [[0, 0], [0.08, 0], [0.12, 0.03], [0.135, 0.09], [0.135, 0.2], [0.12, 0.26], [0.08, 0.29], [0, 0.3]], MAT.catHijau, 28);
  decalCyl(m, 0, 0, 0.1362, 0.11, 0.19, -0.7, 0.7, LBL('tabung'));
  for (const sx of [-1, 1]) sweep(m, [[sx * 0.06, 0.03, 0.29], [sx * 0.065, 0.03, 0.36], [0, 0.03, 0.38], [-sx * 0.0, 0.03, 0.38]], 0.008, MAT.catHijau, 8);
  lat(m, [0, 0, 0.3], [0, 0, 1], [[0, 0], [0.02, 0], [0.02, 0.04], [0.014, 0.05], [0, 0.05]], MAT.kuningan, 12);
  if (o.regulator !== false) {
    lat(m, [0, 0, 0.345], [0, 0, 1], [[0, 0], [0.03, 0], [0.032, 0.025], [0.02, 0.04], [0, 0.04]], MAT.krom, 16);
    lat(m, [0, -0.02, 0.36], [0, -1, 0], [[0, 0], [0.018, 0], [0.018, 0.008], [0, 0.008]], MAT.plMerah, 12);
    const path = [[0.03, 0, 0.36]];
    for (let i = 1; i <= 14; i++) { const t = i / 14; path.push([0.03 + 0.4 * t, 0.05 * Math.sin(t * 4), 0.36 - 0.34 * Math.sin(t * Math.PI * 0.6) + 0.1 * t]); }
    sweep(m, path, 0.006, MAT.plOranye, 8);
  }
  colBox(m, [-0.135, -0.135, 0], [0.135, 0.135, 0.38]);
}
export function buildMagicCom(m) {
  lat(m, [0, 0, 0], [0, 0, 1], [[0, 0], [0.12, 0], [0.13, 0.01], [0.135, 0.06], [0.135, 0.17], [0.13, 0.19], [0, 0.19]], MAT.plPutih, 28);
  part(m, 'TUTUP', [0, 0.12, 0.19], () => lat(m, [0, 0, 0.19], [0, 0, 1], [[0, 0], [0.13, 0], [0.12, 0.03], [0.08, 0.055], [0, 0.06]], MAT.plPink, 28));
  sweep(m, [[-0.07, 0, 0.24], [-0.06, 0, 0.27], [0.06, 0, 0.27], [0.07, 0, 0.24]], 0.008, MAT.plAbu, 8);
  rbox(m, -0.04, -0.14, 0.05, 0.04, -0.12, 0.11, MAT.plAbu, 0.006);
  lat(m, [0.0, -0.141, 0.09], [0, -1, 0], [[0, 0], [0.005, 0], [0, 0.002]], MAT.plOranye, 8);
  sweep(m, [[0.13, 0.05, 0.05], [0.25, 0.1, 0.01], [0.35, 0.05, 0.004]], 0.003, MAT.plHitam, 6);
  colBox(m, [-0.135, -0.14, 0], [0.135, 0.135, 0.27]);
}
export function buildTermos(m, o = {}) {
  const c = o.mat ?? MAT.plMerah;
  lat(m, [0, 0, 0], [0, 0, 1], [[0, 0], [0.065, 0], [0.068, 0.01], [0.068, 0.25], [0.055, 0.29], [0.04, 0.3], [0, 0.3]], c, 24);
  lat(m, [0, 0, 0.0], [0, 0, 1], [[0.0685, 0.01], [0.0695, 0.03], [0.0695, 0.05], [0.0685, 0.06]], MAT.krom, 24);
  lat(m, [0, 0, 0.3], [0, 0, 1], [[0, 0], [0.042, 0], [0.042, 0.06], [0.036, 0.065], [0, 0.065]], MAT.plPutih, 20);
  sweep(m, [[0.06, 0, 0.27], [0.1, 0, 0.27], [0.1, 0, 0.12], [0.068, 0, 0.12]], 0.008, MAT.plPutih, 8);
  // motif bunga (pita kain) di badan
  colBox(m, [-0.07, -0.07, 0], [0.07, 0.07, 0.36]);
}
// Dispenser air galon atas (dengan galon), dua kran merah/biru
export function buildDispenser(m) {
  const W = 0.3, D = 0.3, H = 0.95, a = W / 2, b = D / 2;
  rbox(m, -a, -b, 0, a, b, H, MAT.plPutih, 0.02);
  rbox(m, -a + 0.04, -b - 0.01, 0.06, a - 0.04, -b + 0.04, 0.32, MAT.plAbu, 0.02);   // ceruk gelas
  rbox(m, -a + 0.05, -b - 0.015, 0.06, a - 0.05, -b + 0.02, 0.075, MAT.plHitam, 0.004);   // nampan tetes
  for (const [sx, mt] of [[-1, MAT.plMerah], [1, MAT.plBiru]]) {
    rbox(m, sx * 0.055 - 0.02, -b - 0.035, 0.36, sx * 0.055 + 0.02, -b, 0.41, mt, 0.008);
    rod(m, [sx * 0.055, -b - 0.025, 0.36], [sx * 0.055, -b - 0.025, 0.33], 0.006, MAT.plAbu, 8);
  }
  lat(m, [0, 0, H], [0, 0, 1], [[0, 0], [0.11, 0], [0.1, 0.02], [0.05, 0.03], [0, 0.03]], MAT.plAbu, 20);
  under(m, comp(rotP([1, 0, 0], Math.PI, [0, 0, 0]), trP([0, 0, H + 0.03 + 0.48])), () => galonShape(m, true));
  colBox(m, [-a, -b, 0], [a, b, H]);
  colBox(m, [-0.14, -0.14, H], [0.14, 0.14, H + 0.5]);
  marker(m, 'INTERACT', [0, -b - 0.05, 0.38]);
}
// label melengkung mengikuti silinder (pusat cx,cy, jari-jari r) dari sudut a0..a1 (0 = -Y/depan), tinggi z0..z1
function decalCyl(m, cx, cy, r, z0, z1, a0, a1, mat, n = 8) {
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n, P = (t, z) => [cx + Math.sin(t) * r, cy - Math.cos(t) * r, z];
    F(m, [P(t0, z0), P(t1, z0), P(t1, z1), P(t0, z1)], V3(Math.sin((t0 + t1) / 2), -Math.cos((t0 + t1) / 2), 0), mat, null, { uv: [[i / n, 0], [(i + 1) / n, 0], [(i + 1) / n, 1], [i / n, 1]], soft: true });
  }
}
function galonShape(m, penuh = true) {
  lat(m, [0, 0, 0], [0, 0, 1], [[0, 0], [0.12, 0], [0.135, 0.015], [0.135, 0.08], [0.128, 0.09], [0.135, 0.1], [0.135, 0.2], [0.128, 0.21], [0.135, 0.22], [0.135, 0.32], [0.12, 0.37], [0.06, 0.41], [0.03, 0.42], [0.03, 0.47], [0.034, 0.48], [0, 0.48]], mk('#9fc6e8', 'kaca'), 28);
  if (penuh) part(m, 'AIR', null, () => lat(m, [0, 0, 0.004], [0, 0, 1], [[0, 0], [0.128, 0], [0.128, 0.33], [0.1, 0.37], [0, 0.375]], MAT.air, 24));
  lat(m, [0, 0, 0.455], [0, 0, 1], [[0, 0], [0.036, 0], [0.036, 0.03], [0, 0.03]], MAT.plBiru, 16);
  decalCyl(m, 0, 0, 0.1362, 0.23, 0.31, -0.75, 0.75, LBL('galon'));
}
export const buildGalon = (m, o = {}) => { galonShape(m, o.penuh !== false); colBox(m, [-0.135, -0.135, 0], [0.135, 0.135, 0.48]); };

// ============================================================================ KAMAR MANDI & RUMAH TANGGA
export function buildEmber(m, o = {}) {
  const c = o.mat ?? MAT.plHitam;
  lat(m, [0, 0, 0], [0, 0, 1], [[0, 0], [0.12, 0], [0.122, 0.008], [0.15, 0.25], [0.158, 0.26], [0.158, 0.27], [0.15, 0.27], [0.142, 0.26], [0.115, 0.015], [0, 0.015]], c, 32);
  for (const z of [0.08, 0.17]) lat(m, [0, 0, z], [0, 0, 1], [[0.128 + z * 0.11, 0], [0.132 + z * 0.11, 0.004], [0.13 + z * 0.11, 0.01]], c, 32);
  // gagang kawat
  const path = [];
  for (let i = 0; i <= 16; i++) { const t = (i / 16) * Math.PI; path.push([-0.158 * Math.cos(t), 0, 0.24 + 0.14 * Math.sin(t)]); }
  sweep(m, path, 0.0025, MAT.logam, 6);
  lat(m, [0, 0, 0.38], [1, 0, 0], [[0.008, -0.05], [0.008, 0.05]], MAT.plHitam, 8);
  colBox(m, [-0.158, -0.158, 0], [0.158, 0.158, 0.27]);
}
export function buildGayung(m, o = {}) {
  const c = o.mat ?? MAT.plBiru;
  lat(m, [0, 0, 0], [0, 0, 1], [[0, 0], [0.065, 0], [0.068, 0.005], [0.075, 0.11], [0.07, 0.11], [0.062, 0.01], [0, 0.01]], c, 24);
  rbox(m, -0.012, 0.06, 0.07, 0.012, 0.24, 0.09, c, 0.006, {});
  under(m, rotP([1, 0, 0], 0.25, [0, 0.07, 0.08]), () => rbox(m, -0.014, 0.07, 0.072, 0.014, 0.24, 0.088, c, 0.006));
}
// Bak mandi keramik putih-biru (bangunan bata berlapis keramik), berisi air
export function buildBakMandi(m) {
  const W = 0.8, D = 0.6, H = 0.8, a = W / 2, b = D / 2, t = 0.08;
  // dinding berlapis ubin 20 cm: dibuat dari balok-balok ubin kecil bercelah nat
  const tileRow = (x0, x1, y0, y1, z0, z1, n) => { for (let i = 0; i < n; i++) { const xa = x0 + ((x1 - x0) * i) / n, xb = x0 + ((x1 - x0) * (i + 1)) / n; rbox(m, xa + 0.002, y0, z0 + 0.002, xb - 0.002, y1, z1 - 0.002, (i + Math.round(z0 * 5)) % 5 === 0 ? MAT.keramikBiru : MAT.keramik, 0.003); } };
  rbox(m, -a + 0.004, -b + 0.004, 0, a - 0.004, b - 0.004, H - 0.004, mk('#9a958a', 'keramik'), 0.002);
  for (let r = 0; r < 4; r++) {
    const z0 = r * 0.2, z1 = z0 + 0.2;
    tileRow(-a, a, -b - 0.008, -b + 0.0, z0, z1, 4);
    under(m, rotP([0, 0, 1], Math.PI / 2), () => tileRow(-b, b, -a - 0.008, -a, z0, z1, 3));
    under(m, rotP([0, 0, 1], -Math.PI / 2), () => tileRow(-b, b, -a - 0.008, -a, z0, z1, 3));
  }
  rbox(m, -a - 0.01, -b - 0.01, H - 0.01, a + 0.01, b + 0.01, H + 0.01, MAT.keramik, 0.006);
  // rongga berisi air (permukaan air bagian AIR)
  rbox(m, -a + t, -b + t, H - 0.002, a - t, b - t, H + 0.012, mk('#5c6e74', 'keramik'), 0.002);
  part(m, 'AIR', null, () => decalTop(m, 0, 0, H + 0.013, W - 2 * t, D - 2 * t, MAT.air));
  colBox(m, [-a - 0.01, -b - 0.01, 0], [a + 0.01, b + 0.01, H + 0.01]);
}
// Kloset jongkok keramik (dipasang rata lantai, tinggi pijakan 4 cm)
export function buildKlosetJongkok(m) {
  const pts = (z, s) => { const r = []; for (let i = 0; i < 24; i++) { const t = (i / 24) * TAU; r.push([0.21 * s * Math.sign(Math.cos(t)) * Math.abs(Math.cos(t)) ** 0.5, 0.29 * s * Math.sign(Math.sin(t)) * Math.abs(Math.sin(t)) ** 0.5 - 0.0, z]); } return r; };
  loft(m, [pts(0, 1.0), pts(0.03, 0.98), pts(0.04, 0.95)], MAT.keramik);
  // cekungan
  lat(m, [0, -0.05, 0.041], [0, 0, -1], [[0.11, 0], [0.09, 0.05], [0.04, 0.09], [0, 0.095]], mk('#e4e2dc', 'keramik'), 20, { sy: 1.6 });
  for (const sx of [-1, 1]) { // pijakan kaki bergerigi
    for (let k = 0; k < 5; k++) rbox(m, sx * 0.15 - 0.035, 0.05 + k * 0.03, 0.04, sx * 0.15 + 0.035, 0.065 + k * 0.03, 0.046, MAT.keramik, 0.003);
  }
  part(m, 'AIR', null, () => lat(m, [0, -0.13, 0.0], [0, 0, 1], [[0, 0], [0.04, 0], [0, 0.0005]], MAT.air, 16, { sy: 1.3 }));
}
// Sapu ijuk: gagang kayu bercat, kepala plastik, serat ijuk hitam
export function buildSapuIjuk(m) {
  rod(m, [0, 0, 0.12], [0, 0, 1.2], 0.013, MAT.kayuHijau, 10);
  lat(m, [0, 0, 1.2], [0, 0, 1], [[0, 0], [0.013, 0], [0.01, 0.015], [0, 0.016]], MAT.plMerah, 10);
  rbox(m, -0.13, -0.025, 0.1, 0.13, 0.025, 0.15, MAT.plMerah, 0.012, { taper: 0.6 });
  // serat: berkas pipih melebar ke bawah
  const rings = [];
  for (const [z, w, d] of [[0.105, 0.125, 0.02], [0.06, 0.14, 0.03], [0.0, 0.16, 0.04]]) rings.push(rring(0, 0, z, w, d, 0.015));
  loft(m, rings.reverse(), MAT.ijuk);
  for (let k = 0; k < 14; k++) rod(m, [-0.15 + k * 0.023, 0.04 * ((k % 3) - 1) * 0.3, 0.06], [-0.165 + k * 0.025 + 0.004, 0.012 * ((k % 3) - 1), 0], 0.004, MAT.ijuk, 4);
  meta(m).lean = true;
}
export function buildKemoceng(m) {
  rod(m, [0, 0, 0], [0, 0, 0.45], 0.008, MAT.bambu, 8);
  // bulu: gumpalan berlapis
  for (let k = 0; k < 7; k++) {
    const z = 0.3 + k * 0.06, r = 0.05 + 0.03 * Math.sin((k / 6) * Math.PI);
    lat(m, [0, 0, z], [0, 0, 1], [[0, 0], [r, 0.02], [r * 0.6, 0.07], [0, 0.08]], [MAT.kainCoklat, MAT.kainHitam, mk('#8a6a3a', 'kain')][k % 3], 10);
  }
}
export function buildKeset(m) {
  const W = 0.6, D = 0.4;
  rbox(m, -W / 2, -D / 2, 0, W / 2, D / 2, 0.012, MAT.goni, 0.005);
  decalTop(m, 0, 0, 0.0125, W - 0.04, D - 0.04, MAT.goni, [[0, 0], [2, 0], [2, 1.3], [0, 1.3]]);
}
// Sandal jepit (satu sisi): sol berlapis + tali V. kiri/kanan dicerminkan
export function buildSandal(m, o = {}) {
  const side = o.side ?? 1, sole = o.mat ?? MAT.plBiru;
  // garis tepi sol berbentuk telapak: tumit sempit, pinggang, bantalan jari lebar, ujung jari membulat (miring ke arah jempol)
  const W = (u) => { const k = [[0, 0.012], [0.04, 0.03], [0.15, 0.037], [0.38, 0.033], [0.62, 0.046], [0.82, 0.047], [0.94, 0.036], [1, 0.012]]; for (let i = 0; i + 1 < k.length; i++) if (u <= k[i + 1][0]) { const f = (u - k[i][0]) / (k[i + 1][0] - k[i][0]); return k[i][1] + (k[i + 1][1] - k[i][1]) * (0.5 - 0.5 * Math.cos(Math.PI * f)); } return 0.012; };
  const ring = (z, s) => { const r = [], n = 14; for (let i = 0; i <= n; i++) { const u = i / n, y = 0.125 - 0.25 * u; r.push([(W(u) * s) + side * 0.008 * u * u, y * (0.98 + 0.02 * s), z]); } for (let i = n; i >= 0; i--) { const u = i / n, y = 0.125 - 0.25 * u; r.push([-(W(u) * s) + side * 0.008 * u * u, y * (0.98 + 0.02 * s), z]); } return r; };
  loft(m, [ring(0, 0.97), ring(0.004, 1), ring(0.009, 1)], MAT.karet);
  loft(m, [ring(0.009, 1), ring(0.016, 1), ring(0.018, 0.97)], sole);
  const toe = [side * 0.008, -0.075, 0.018];
  for (const s2 of [-1, 1]) sweep(m, [[toe[0], toe[1], 0.03], [toe[0] + s2 * 0.018, -0.05, 0.042], [toe[0] + s2 * 0.034, -0.02, 0.036], [s2 * 0.043 + side * 0.003, 0.005, 0.019]], (t) => 0.0042 + 0.0012 * t, MAT.plPutih, 6);
  rod(m, [toe[0], toe[1], 0.012], [toe[0], toe[1], 0.032], 0.004, MAT.plPutih, 6);
}
// Sajadah tergelar (0,65 x 1,15 m) — tepi sedikit terangkat/terlipat di ujung
export function buildSajadah(m, o = {}) {
  const W = 0.65, L = 1.15, n = 10;
  for (let i = 0; i < n; i++) {
    const y0 = -L / 2 + (L * i) / n, y1 = y0 + L / n, zz = (y) => 0.004 + (y > L / 2 - 0.12 ? 0.02 * (y - (L / 2 - 0.12)) / 0.12 : 0);
    F(m, [[-W / 2, y0, zz(y0)], [W / 2, y0, zz(y0)], [W / 2, y1, zz(y1)], [-W / 2, y1, zz(y1)]], V3(0, 0, 1), o.mat ?? MAT.sajadah, null, { uv: [[0, i / n], [1, i / n], [1, (i + 1) / n], [0, (i + 1) / n]], soft: true });
  }
  rbox(m, -W / 2, -L / 2, 0, W / 2, L / 2 - 0.12, 0.004, MAT.kainHijau, 0.001);
}
// Kain terlipat (mukena/sarung/selimut lipat) — tumpukan lipatan bertepi membulat
function lipatan(m, w, d, h, n, mt) {
  for (let k = 0; k < n; k++) {
    const z0 = (h / n) * k, z1 = z0 + h / n, ins = 0.004 * k;
    const rings = [];
    for (const [z, s] of [[z0, 0.97], [z0 + (z1 - z0) * 0.5, 1], [z1, 0.96]]) rings.push(rring(0, 0, z, (w / 2 - ins) * s, (d / 2 - ins) * s, 0.025));
    loft(m, rings, mt);
  }
}
export const buildMukenaLipat = (m) => { lipatan(m, 0.34, 0.26, 0.09, 4, MAT.kainPutih); lat(m, [0, 0, 0.09], [0, 0, 1], [[0.0, 0], [0.11, 0], [0.11, 0.003], [0, 0.003]], MAT.renda, 20); };
export const buildSarungLipat = (m) => lipatan(m, 0.32, 0.24, 0.06, 3, MAT.sarung);
export const buildSelimutLipat = (m) => lipatan(m, 0.5, 0.36, 0.14, 5, MAT.bunga);
// kain tergantung pada hanger/paku: siluet berlipat (loft cincin bergelombang)
function kainGantung(m, top, w, len, mt, o = {}) {
  const rings = [];
  const n = 18;
  for (let j = 0; j <= 8; j++) {
    const t = j / 8, z = top[2] - len * t, ww = w * (o.taper ? 0.5 + 0.5 * Math.min(1, t * 3) : 1) * (o.flare ? 1 + 0.25 * t : 1);
    const ring = [];
    for (let i = 0; i < n; i++) {
      const u = (i / n) * TAU, x = Math.cos(u) * ww / 2, y = Math.sin(u) * (0.02 + 0.03 * t) + 0.012 * Math.sin(u * 5 + t * 3) * t;
      ring.push([top[0] + x + 0.01 * Math.sin(u * 3 + t * 4) * t, top[1] + y, z]);
    }
    rings.push(ring);
  }
  loft(m, rings, mt);
}
// Mukena tergantung di paku (atasan putih berenda)
export function buildMukenaGantung(m) {
  rod(m, [0, 0.03, 1.6], [0, -0.03, 1.62], 0.004, MAT.logam, 6);
  kainGantung(m, [0, -0.02, 1.6], 0.5, 1.0, MAT.kainPutih, { taper: true, flare: true });
  lat(m, [0, -0.02, 0.6], [0, 0, -1], [[0.27, 0], [0.29, 0.02]], MAT.renda, 18, { sy: 0.2 });
  meta(m).wall = true;
}
// Pakaian tergantung: paku dinding + hanger + kemeja batik
export function buildBajuGantung(m, o = {}) {
  const top = 1.75;
  rod(m, [0, 0.0, top], [0, -0.04, top + 0.01], 0.003, MAT.logam, 6);
  sweep(m, [[0, -0.03, top], [0.012, -0.03, top + 0.015], [0, -0.03, top + 0.025], [-0.01, -0.03, top + 0.01], [0, -0.03, top - 0.04]], 0.002, MAT.logam, 5);
  sweep(m, [[-0.2, -0.03, top - 0.12], [-0.1, -0.03, top - 0.07], [0, -0.03, top - 0.045], [0.1, -0.03, top - 0.07], [0.2, -0.03, top - 0.12]], 0.006, MAT.kayuMuda, 6);
  // kemeja: badan + lengan pendek + kerah
  const mt = o.mat ?? MAT.batik;
  const rings = [];
  for (let j = 0; j <= 8; j++) {
    const t = j / 8, z = top - 0.1 - 0.72 * t, w = t < 0.1 ? 0.3 + 1.3 * t : 0.44 - 0.02 * t, d = 0.05 + 0.02 * t;
    const ring = [];
    for (let i = 0; i < 16; i++) { const u = (i / 16) * TAU; ring.push([Math.sign(Math.cos(u)) * Math.abs(Math.cos(u)) ** 0.4 * w / 2, -0.03 + Math.sin(u) * d / 2 + 0.006 * Math.sin(u * 4 + j), z]); }
    rings.push(ring);
  }
  loft(m, rings, mt);
  for (const sx of [-1, 1]) {
    const rr = [];
    for (let j = 0; j <= 3; j++) { const t = j / 3, c = [sx * (0.2 + 0.08 * t), -0.03, top - 0.16 - 0.16 * t]; rr.push([...Array(10)].map((_, i) => { const u = (i / 10) * TAU, r = 0.06 - 0.01 * t; return [c[0] + Math.cos(u) * r * 0.9, c[1] + Math.sin(u) * r * 0.5, c[2] + Math.cos(u) * sx * 0.03]; })); }
    loft(m, rr, mt);
  }
  sweep(m, [[-0.07, -0.05, top - 0.1], [0, -0.065, top - 0.13], [0.07, -0.05, top - 0.1]], 0.012, mt, 6);
  meta(m).wall = true;
}
// Jaket tergantung (pos ronda): kain tebal gelap, tudung
export function buildJaketGantung(m) {
  rod(m, [0, 0.0, 1.7], [0, -0.05, 1.72], 0.004, MAT.logam, 6);
  kainGantung(m, [0, -0.06, 1.68], 0.42, 0.75, MAT.kainHijau, { taper: true });
  lat(m, [0, -0.08, 1.62], [0, 0, 1], [[0, 0], [0.1, 0], [0.11, 0.08], [0.06, 0.13], [0, 0.14]], MAT.kainHijau, 12, { sy: 0.5 });
  for (const sx of [-1, 1]) sweep(m, [[sx * 0.18, -0.07, 1.6], [sx * 0.22, -0.08, 1.3], [sx * 0.21, -0.1, 1.0]], (t) => 0.045 - 0.01 * t, MAT.kainHijau, 10);
  meta(m).wall = true;
}
// Jemuran: dua tiang bambu + tali + pakaian (kartu kain) dan jepitan
export function buildJemuran(m) {
  const L = 2.4, a = L / 2, H = 1.8;
  for (const sx of [-1, 1]) {
    bambuShape(m, [sx * a, 0, 0], [sx * a, 0, H], 0.03, MAT.bambu);
    for (const sy of [-1, 1]) rod(m, [sx * a, 0, 0.6], [sx * a + sx * 0.0, sy * 0.35, 0.0], 0.018, MAT.bambuTua, 8);
  }
  const path = [];
  for (let i = 0; i <= 20; i++) { const t = i / 20; path.push([-a + L * t, 0, H - 0.05 - 0.12 * Math.sin(Math.PI * t)]); }
  sweep(m, path, 0.003, MAT.plBiru, 5);
  const sag = (x) => H - 0.05 - 0.12 * Math.sin(Math.PI * (x + a) / L);
  const cloth = (x, w, len, mt) => {
    const z = sag(x);
    const rows = 6;
    for (let j = 0; j < rows; j++) {
      const t0 = j / rows, t1 = (j + 1) / rows;
      const P = (u, t) => [x - w / 2 + w * u, 0.02 * Math.sin(u * 7 + t * 5) * t, z - len * t];
      for (let i = 0; i < 4; i++) {
        const u0 = i / 4, u1 = (i + 1) / 4;
        F(m, [P(u0, t0), P(u1, t0), P(u1, t1), P(u0, t1)], V3(0, -1, 0), mt, null, { soft: true });
        F(m, [P(u0, t0), P(u0, t1), P(u1, t1), P(u1, t0)], V3(0, 1, 0), mt, null, { soft: true });
      }
    }
    for (const dx of [-w / 2 + 0.03, w / 2 - 0.03]) rbox(m, x + dx - 0.005, -0.008, z - 0.04, x + dx + 0.005, 0.008, z + 0.015, MAT.plKuning, 0.002);
  };
  cloth(-0.75, 0.5, 0.7, MAT.batik);
  cloth(-0.1, 0.45, 0.55, MAT.kainBiru);
  cloth(0.45, 0.6, 0.9, MAT.sarung);
  cloth(0.95, 0.25, 0.35, MAT.kainPutih);
  colBox(m, [-a - 0.04, -0.04, 0], [-a + 0.04, 0.04, H]);
  colBox(m, [a - 0.04, -0.04, 0], [a + 0.04, 0.04, H]);
}
// Obat-obatan: kotak obat, strip tablet, botol sirup, botol kecil
export function buildObat(m) {
  rbox(m, -0.08, -0.03, 0, 0.0, 0.03, 0.05, MAT.kertas, 0.002);
  decalFront(m, -0.04, -0.0305, 0.025, 0.08, 0.05, LBL('obat'));
  decalTop(m, -0.04, 0, 0.0505, 0.08, 0.06, LBL('obat'), [[0, 0.5], [1, 0.5], [1, 1], [0, 1]]);
  // strip tablet berkilau
  rbox(m, 0.02, -0.06, 0, 0.11, -0.012, 0.004, MAT.krom, 0.001);
  for (let i = 0; i < 2; i++) for (let k = 0; k < 5; k++) lat(m, [0.032 + k * 0.017, -0.048 + i * 0.024, 0.004], [0, 0, 1], [[0, 0], [0.006, 0], [0.005, 0.003], [0, 0.004]], MAT.plBening, 8);
  // botol sirup coklat
  lat(m, [0.05, 0.04, 0], [0, 0, 1], [[0, 0], [0.025, 0], [0.026, 0.004], [0.026, 0.08], [0.016, 0.1], [0.011, 0.105], [0.011, 0.115], [0, 0.115]], mk('#6b3a14', 'kaca'), 16);
  lat(m, [0.05, 0.04, 0.112], [0, 0, 1], [[0, 0], [0.014, 0], [0.014, 0.022], [0, 0.022]], MAT.plPutih, 12);
  decal(m, [0.05 - 0.02, 0.04 - 0.0265, 0.02], [0.05 + 0.02, 0.04 - 0.0265, 0.02], [0.05 + 0.02, 0.04 - 0.0265, 0.065], [0.05 - 0.02, 0.04 - 0.0265, 0.065], LBL('obat'), [0, -1, 0]);
  // botol plastik kecil putih
  lat(m, [-0.03, 0.05, 0], [0, 0, 1], [[0, 0], [0.018, 0], [0.018, 0.05], [0.012, 0.058], [0, 0.058]], MAT.plPutih, 12);
  lat(m, [-0.03, 0.05, 0.056], [0, 0, 1], [[0, 0], [0.013, 0], [0.013, 0.014], [0, 0.014]], MAT.plOranye, 12);
}
// Koran lama terlipat (sedikit melengkung)
export function buildKoran(m) {
  const W = 0.29, L = 0.4, n = 6;
  for (let i = 0; i < n; i++) {
    const x0 = -W / 2 + (W * i) / n, x1 = x0 + W / n, z = (x) => 0.004 + 0.012 * Math.max(0, (x - W / 4) / (W / 4)) ** 2;
    F(m, [[x0, -L / 2, z(x0)], [x1, -L / 2, z(x1)], [x1, L / 2, z(x1)], [x0, L / 2, z(x0)]], V3(0, 0, 1), LBL('koran'), null, { uv: [[i / n, 0], [(i + 1) / n, 0], [(i + 1) / n, 1], [i / n, 1]], soft: true });
  }
  rbox(m, -W / 2 + 0.003, -L / 2 + 0.003, 0, W / 2 - 0.003, L / 2 - 0.003, 0.004, MAT.kertas, 0.001);
}
// Kardus bekas: badan, tutup terbuka (opsional), selotip, label
export function buildKardus(m, o = {}) {
  const W = o.w ?? 0.5, D = o.d ?? 0.38, H = o.h ?? 0.34, a = W / 2, b = D / 2;
  rbox(m, -a, -b, 0, a, b, H, MAT.kardus, 0.006);
  if (o.terbuka) {
    for (const sy of [-1, 1]) under(m, rotP([1, 0, 0], sy * -2.3, [0, sy * b, H]), () => rbox(m, -a + 0.004, sy * b - 0.004, H, a - 0.004, sy * b, H + b * 0.95, MAT.kardus, 0.002));
    for (const sx of [-1, 1]) under(m, rotP([0, 1, 0], sx * 1.9, [sx * a, 0, H]), () => rbox(m, sx * a - 0.004, -b + 0.01, H, sx * a, b - 0.01, H + a * 0.7, MAT.kardus, 0.002));
    rbox(m, -a + 0.005, -b + 0.005, H - 0.005, a - 0.005, b - 0.005, H + 0.001, mk('#4a3a28', 'kardus'), 0.002);
  } else {
    rbox(m, -0.025, -b - 0.001, H - 0.12, 0.025, b + 0.001, H + 0.001, mk('#b49a6a', 'plastik'), 0.001);
  }
  colBox(m, [-a, -b, 0], [a, b, H]);
}
// Kantong plastik kresek (hitam/merah) berisi sesuatu, kuping terikat
export function buildKresek(m, o = {}) {
  const c = o.mat ?? MAT.plHitam;
  const rings = [];
  for (const [z, r] of [[0, 0.06], [0.03, 0.13], [0.12, 0.15], [0.2, 0.12], [0.25, 0.06], [0.27, 0.035]]) rings.push([...Array(14)].map((_, i) => { const t = (i / 14) * TAU; const rr = r * (1 + 0.08 * Math.sin(t * 3 + z * 20)); return [Math.cos(t) * rr * 1.1, Math.sin(t) * rr * 0.85, z]; }));
  loft(m, rings, c);
  for (const sx of [-1, 1]) { const rr = []; for (let j = 0; j <= 5; j++) { const t = j / 5, cx = sx * (0.02 + 0.03 * Math.sin(t * Math.PI * 0.8)), z = 0.26 + 0.1 * t, w = 0.03 * (1 - 0.6 * t) + 0.006; rr.push([...Array(8)].map((_, i) => { const u = (i / 8) * TAU; return [cx + Math.cos(u) * w, Math.sin(u) * 0.006, z]; })); } loft(m, rr, c); }
  ball(m, [0, 0, 0.272], 0.022, c, 10);
}
// Botol kaca bekas (kecap/sirup) + botol plastik air mineral (label polos)
export function buildBotol(m, o = {}) {
  if (o.plastik) {
    lat(m, [0, 0, 0], [0, 0, 1], [[0, 0], [0.032, 0], [0.034, 0.01], [0.034, 0.05], [0.03, 0.06], [0.034, 0.07], [0.034, 0.16], [0.02, 0.2], [0.013, 0.21], [0.013, 0.22], [0, 0.22]], MAT.plBening, 18);
    lat(m, [0, 0, 0.215], [0, 0, 1], [[0, 0], [0.015, 0], [0.015, 0.018], [0, 0.018]], MAT.plBiru, 12);
    lat(m, [0, 0, 0.09], [0, 0, 1], [[0.0345, 0], [0.0345, 0.05]], mk('#2f68b0', 'plastik'), 18);
  } else {
    lat(m, [0, 0, 0], [0, 0, 1], [[0, 0], [0.035, 0], [0.037, 0.008], [0.037, 0.17], [0.03, 0.2], [0.015, 0.23], [0.013, 0.27], [0.015, 0.275], [0, 0.275]], mk('#3d2a12', 'kaca'), 18);
    lat(m, [0, 0, 0.27], [0, 0, 1], [[0, 0], [0.016, 0], [0.016, 0.012], [0, 0.012]], MAT.catMerah, 12);
    lat(m, [0, 0, 0.05], [0, 0, 1], [[0.0375, 0], [0.0375, 0.08]], mk('#e8dfc4', 'kertas'), 18);
  }
}
// Rak sandal/sepatu kayu 3 susun (dengan sepasang sepatu & sandal)
export function buildRakSandal(m, o = {}) {
  const W = o.w ?? 0.8, D = 0.3, H = 0.6, a = W / 2, b = D / 2, c = MAT.kayu;
  for (const sx of [-1, 1]) rbox(m, sx > 0 ? a - 0.02 : -a, -b, 0, sx > 0 ? a : -a + 0.02, b, H, c, 0.004);
  for (const z of [0.03, 0.29, H - 0.02]) for (let k = 0; k < 4; k++) rbox(m, -a + 0.02, -b + 0.01 + k * 0.072, z, a - 0.02, -b + 0.06 + k * 0.072, z + 0.018, c, 0.003);
  under(m, trP([-0.15, 0, 0.048]), () => { buildSandal(m, { side: -1, mat: MAT.plHijau }); });
  under(m, trP([-0.04, 0, 0.048]), () => { buildSandal(m, { side: 1, mat: MAT.plHijau }); });
  under(m, trP([0.2, 0, 0.308]), () => { buildSandal(m, { side: 1, mat: MAT.plHitam }); });
  colBox(m, [-a, -b, 0], [a, b, H]);
}

// ============================================================================ POS RONDA
// Kentongan bambu (gantung): ruas bambu besar dengan celah memanjang + pemukul, tali gantung
export function buildKentongan(m) {
  const L = 0.55, R = 0.06, top = 1.7;
  // tergantung pada paku dinding/tiang: alas (pivot) di bawah, tali ke atas
  bambuShape(m, [0, -0.08, top - 0.18 - L], [0, -0.08, top - 0.18], R, MAT.bambuTua);
  rbox(m, -0.012, -0.08 - R - 0.002, top - 0.18 - L + 0.1, 0.012, -0.08 - R + 0.02, top - 0.18 - 0.1, mk('#2a1f14', 'kayu'), 0.004);   // celah
  sweep(m, [[0, -0.08, top - 0.18], [0, -0.06, top - 0.08], [0, -0.0, top]], 0.004, MAT.goni, 5);
  rod(m, [0, 0.02, top], [0, -0.04, top + 0.01], 0.004, MAT.logam, 6);
  // pemukul tergantung di sampingnya
  rod(m, [0.12, -0.05, top - 0.6], [0.12, -0.05, top - 0.3], 0.012, MAT.kayu, 8);
  sweep(m, [[0.12, -0.05, top - 0.3], [0.07, -0.03, top - 0.12], [0, -0.0, top]], 0.003, MAT.goni, 5);
  marker(m, 'INTERACT', [0, -0.25, top - 0.45]);
  marker(m, 'AUDIO', [0, -0.08, top - 0.45]);
  meta(m).wall = true;
}
// Papan jadwal ronda: papan triplek berbingkai, kertas jadwal (bagian TEXT, bisa diganti teksturnya)
export function buildPapanJadwal(m) {
  const W = 0.6, H = 0.8;
  rbox(m, -W / 2, -0.012, 0, W / 2, 0, H, MAT.kayuMuda, 0.003);
  for (const [x0, z0, x1, z1] of [[-W / 2, 0, W / 2, 0.03], [-W / 2, H - 0.03, W / 2, H], [-W / 2, 0, -W / 2 + 0.03, H], [W / 2 - 0.03, 0, W / 2, H]]) rbox(m, x0, -0.025, z0, x1, -0.012, z1, MAT.kayuHijau, 0.003);
  part(m, 'TEXT', null, () => decalFront(m, 0, -0.0135, H / 2, W - 0.1, H - 0.1, LBL('jadwal')));
  for (const [x, z] of [[-0.24, H - 0.07], [0.24, H - 0.07], [-0.24, 0.07], [0.24, 0.07]]) lat(m, [x, -0.014, z], [0, -1, 0], [[0, 0], [0.006, 0], [0.005, 0.003], [0, 0.004]], MAT.plMerah, 8);
  marker(m, 'INTERACT', [0, -0.3, H / 2]);
  meta(m).wall = true;
}
export function buildGelasKopi(m) {
  gelasShape(m, 0, 0, 0, MAT.kaca, 0.1);
  part(m, 'KOPI', null, () => lat(m, [0, 0, 0.009], [0, 0, 1], [[0, 0], [0.0255, 0], [0.0285, 0.06], [0, 0.06]], mk('#2a160c', 'keramik'), 16));
  rod(m, [0.01, 0, 0.03], [0.03, 0.01, 0.13], 0.0025, MAT.krom, 6);
}
export function buildBungkusRokok(m) {
  rbox(m, -0.028, -0.011, 0, 0.028, 0.011, 0.088, MAT.kertas, 0.002);
  decalFront(m, 0, -0.0112, 0.044, 0.056, 0.088, LBL('rokok'));
  decal(m, [0.028, 0.011, 0.0], [-0.028, 0.011, 0.0], [-0.028, 0.011, 0.088], [0.028, 0.011, 0.088], LBL('rokok'), [0, 1, 0]);
  for (let k = 0; k < 3; k++) lat(m, [-0.012 + k * 0.009, 0.0, 0.08], [0, 0, 1], [[0, 0], [0.004, 0], [0.004, 0.012], [0, 0.012]], k === 1 ? mk('#c9883a', 'kertas') : MAT.kertas, 8);
}
export function buildAsbak(m) {
  lat(m, [0, 0, 0], [0, 0, 1], [[0, 0], [0.055, 0], [0.06, 0.005], [0.06, 0.03], [0.05, 0.032], [0.045, 0.012], [0, 0.012]], mk('#5a6b70', 'kaca'), 20);
  for (let k = 0; k < 4; k++) { const t = (k / 4) * TAU; rbox(m, Math.cos(t) * 0.055 - 0.006, Math.sin(t) * 0.055 - 0.006, 0.026, Math.cos(t) * 0.055 + 0.006, Math.sin(t) * 0.055 + 0.006, 0.033, mk('#5a6b70', 'kaca'), 0.002); }
  // puntung & abu
  lat(m, [0, 0, 0.012], [0, 0, 1], [[0, 0], [0.044, 0], [0.03, 0.008], [0, 0.01]], mk('#8a8680', 'kain'), 16);
  const R = (s) => { let x = Math.sin(s * 99.1) * 43758.5; return x - Math.floor(x); };
  for (let k = 0; k < 9; k++) {
    const a = R(k) * TAU, r = 0.01 + R(k + 3) * 0.025, z = 0.016 + R(k + 7) * 0.006, d = [Math.cos(a + 1.3), Math.sin(a + 1.3), 0.15];
    rod(m, [Math.cos(a) * r, Math.sin(a) * r, z], [Math.cos(a) * r + d[0] * 0.022, Math.sin(a) * r + d[1] * 0.022, z + 0.004], 0.0038, mk('#c9883a', 'kertas'), 6);
    rod(m, [Math.cos(a) * r, Math.sin(a) * r, z], [Math.cos(a) * r - d[0] * 0.006, Math.sin(a) * r - d[1] * 0.006, z - 0.001], 0.0038, MAT.kertas, 6);
  }
}
// Kartu remi berserakan (beberapa terbuka & tertutup)
export function buildKartuRemi(m) {
  const R = (s) => { let x = Math.sin(s * 12.9898) * 43758.5; return x - Math.floor(x); };
  for (let k = 0; k < 9; k++) {
    const x = (R(k) - 0.5) * 0.3, y = (R(k + 11) - 0.5) * 0.25, a = R(k + 23) * TAU, z = 0.0005 + k * 0.0006;
    const lbl = k % 3 === 0 ? 'kartu' : 'kartu_belakang';
    under(m, comp(rotP([0, 0, 1], a), trP([x, y, z])), () => decalTop(m, 0, 0, 0, 0.058, 0.088, LBL(lbl)));
    under(m, comp(rotP([0, 0, 1], a), trP([x, y, z - 0.0003])), () => decal(m, [-0.029, 0.044, 0], [0.029, 0.044, 0], [0.029, -0.044, 0], [-0.029, -0.044, 0], LBL('kartu_belakang'), [0, 0, -1]));
  }
  // tumpukan sisa kartu
  rbox(m, 0.1, 0.05, 0, 0.158, 0.138, 0.012, MAT.kertas, 0.001);
  decalTop(m, 0.129, 0.094, 0.0125, 0.058, 0.088, LBL('kartu_belakang'));
}
// Senter plastik (lampu depan emisif bagian LENS)
export function buildSenter(m) {
  under(m, comp(rotP([0, 1, 0], Math.PI / 2), trP([0, 0, 0.03])), () => {
    lat(m, [0, 0, -0.1], [0, 0, 1], [[0, 0], [0.018, 0], [0.019, 0.005], [0.019, 0.12], [0.03, 0.16], [0.03, 0.19], [0, 0.19]], MAT.plKuning, 16);
    lat(m, [0, 0, 0.02], [0, 0, 1], [[0.0195, 0], [0.0198, 0.05]], MAT.plHitam, 16);
    part(m, 'LENS', null, () => lat(m, [0, 0, 0.09], [0, 0, 1], [[0, 0], [0.027, 0], [0, 0.0005]], MAT.kaca, 16));
    rbox(m, -0.006, 0.017, -0.0, 0.006, 0.024, 0.03, MAT.plMerah, 0.002);
  });
  marker(m, 'INTERACT', [0, 0, 0.06]);
  marker(m, 'LIGHT', [0.1, 0, 0.03], { type: 'spot', color: '#fff2d0', energy: 2.0, dir: [1, 0, 0] });
}
// Helm (setengah wajah) dengan pelindung kaca & tali
export function buildHelm(m) {
  lat(m, [0, 0, 0.0], [0, 0, 1], [[0.13, 0], [0.135, 0.01], [0.14, 0.06], [0.13, 0.12], [0.1, 0.18], [0.06, 0.21], [0, 0.22]], MAT.plHitam, 28, { sy: 1.18 });
  lat(m, [0, 0, 0.0], [0, 0, 1], [[0.128, 0], [0.122, 0.01], [0, 0.012]], MAT.kainHitam, 28, { sy: 1.18 });
  { const rings = []; for (let k = 0; k <= 12; k++) { const t = -1.0 + (2.0 * k) / 12, c = Math.cos(t), s = Math.sin(t), r0 = 0.13, r1 = 0.19 - 0.03 * Math.abs(s); rings.push([[s * r0, -c * r0 * 1.18, 0.07], [s * r1, -c * r1 * 1.12, 0.055], [s * r1, -c * r1 * 1.12, 0.062], [s * r0, -c * r0 * 1.18, 0.08]]); } loft(m, rings, MAT.plHitam); }
  lat(m, [0, 0, 0.0], [0, 0, 1], [[0.136, 0.012], [0.141, 0.02], [0.136, 0.028]], MAT.krom, 28, { sy: 1.18 });
  for (const sx of [-1, 1]) sweep(m, [[sx * 0.13, 0, 0.03], [sx * 0.1, -0.02, -0.02], [0, -0.03, -0.0]], 0.006, MAT.kainHitam, 5);
}

// ============================================================================ WARUNG
// Etalase kaca warung (1,2 x 0,5 x 1,0): rangka aluminium, kaca, rak kaca, isi permen/rokok/kemasan
export function buildEtalase(m) {
  const W = 1.2, D = 0.5, H = 1.0, a = W / 2, b = D / 2, al = MAT.krom;
  rbox(m, -a, -b, 0, a, b, 0.35, MAT.kayuPutih, 0.006);                      // alas kayu
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rbox(m, sx * a - 0.012, sy * b - 0.012, 0.35, sx * a + 0.012, sy * b + 0.012, H, al, 0.003);
  for (const z of [0.35, H - 0.02]) { for (const sy of [-1, 1]) rbox(m, -a, sy * b - 0.012, z, a, sy * b + 0.012, z + 0.02, al, 0.003); for (const sx of [-1, 1]) rbox(m, sx * a - 0.012, -b, z, sx * a + 0.012, b, z + 0.02, al, 0.003); }
  rbox(m, -a + 0.01, -b + 0.01, H - 0.005, a - 0.01, b - 0.01, H, MAT.kaca, 0.001);
  rbox(m, -a + 0.008, -b - 0.004, 0.37, a - 0.008, -b + 0.0, H - 0.02, MAT.kaca, 0.001);
  for (const sx of [-1, 1]) rbox(m, sx * a - 0.004, -b + 0.01, 0.37, sx * a + 0.0, b - 0.01, H - 0.02, MAT.kaca, 0.001);
  rbox(m, -a + 0.01, -b + 0.01, 0.66, a - 0.01, b - 0.01, 0.668, MAT.kaca, 0.001);   // rak kaca
  // pintu geser belakang (kaca) — bagian DOOR
  part(m, 'DOOR', null, () => rbox(m, 0.0, b - 0.006, 0.37, a - 0.01, b, H - 0.02, MAT.kaca, 0.001));
  // isi: bungkus rokok, toples kecil, sachet, kemasan mi
  for (let k = 0; k < 8; k++) under(m, trP([-0.5 + k * 0.07, -0.12, 0.37]), () => buildBungkusRokok(m));
  for (let k = 0; k < 5; k++) under(m, trP([-0.45 + k * 0.2, 0.05, 0.668]), () => toplesShape(m, 0.05, 0.14, [MAT.plMerah, MAT.plKuning, MAT.plHijau, MAT.plOranye, MAT.plBiru][k]));
  for (let k = 0; k < 4; k++) under(m, comp(rotP([1, 0, 0], -Math.PI / 2 + 0.25), trP([0.1 + k * 0.12, -0.05, 0.38])), () => kemasanMi(m));
  decalFront(m, 0, -b - 0.0045, 0.2, 0.9, 0.22, LBL('toko'));
  colBox(m, [-a, -b, 0], [a, b, H]);
}
function toplesShape(m, r, h, isi) {
  lat(m, [0, 0, 0], [0, 0, 1], [[0, 0], [r, 0], [r + 0.002, 0.005], [r + 0.002, h], [r * 0.6, h + 0.012], [r * 0.6, h + 0.02], [0, h + 0.02]], MAT.kaca, 20);
  lat(m, [0, 0, h + 0.018], [0, 0, 1], [[0, 0], [r * 0.65, 0], [r * 0.65, 0.025], [0, 0.025]], MAT.plMerah, 16);
  if (isi) lat(m, [0, 0, 0.004], [0, 0, 1], [[0, 0], [r - 0.004, 0], [r - 0.004, h * 0.6], [r * 0.5, h * 0.66], [0, h * 0.68]], isi, 16);
}
function kemasanMi(m) {
  // bantal kemasan mi instan 0,12 x 0,1 x 0,03 (tepi bergerigi pipih)
  const rings = [];
  for (const [z, s] of [[0, 0.88], [0.012, 1], [0.024, 1], [0.032, 0.86]]) rings.push(rring(0, 0, z, 0.06 * s, 0.05 * s, 0.01));
  loft(m, rings, MAT.plMerah);
  decalTop(m, 0, 0, 0.0325, 0.11, 0.085, LBL('kemasan_mi'));
}
export const buildToples = (m) => toplesShape(m, 0.07, 0.2, mk('#d24a6a', 'plastik'));
// Tumpukan mi instan (dus terbuka + bungkus bertumpuk)
export function buildMiTumpuk(m) {
  for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) under(m, comp(rotP([0, 0, 1], (r % 2) * 0.08 - 0.04), trP([-0.065 + c * 0.13, 0, r * 0.033])), () => kemasanMi(m));
}
// Renteng kopi sachet tergantung (strip panjang)
export function buildKopiRenteng(m) {
  const n = 4, h = 0.55, w = 0.1;
  rod(m, [-0.06, 0.01, h + 0.02], [0.06, 0.01, h + 0.02], 0.003, MAT.logam, 6);
  for (const dx of [-0.055, 0.055]) {
    for (let i = 0; i < 8; i++) {
      const z0 = h - (h / 8) * (i + 1), z1 = h - (h / 8) * i, P = (x, z) => [dx + x, 0.004 * Math.sin(z * 30 + dx * 50), z];
      F(m, [P(-w / 2, z0), P(w / 2, z0), P(w / 2, z1), P(-w / 2, z1)], V3(0, -1, 0), LBL('sachet'), null, { uv: [[0, (z0) / h], [1, z0 / h], [1, z1 / h], [0, z1 / h]], soft: true });
      F(m, [P(-w / 2, z0), P(-w / 2, z1), P(w / 2, z1), P(w / 2, z0)], V3(0, 1, 0), mk('#cfcac0', 'logam'), null, { soft: true });
    }
  }
  meta(m).wall = true;
}
// Kaleng kerupuk (blek kotak berjendela kaca bulat, tutup)
export function buildKalengKerupuk(m) {
  const W = 0.32, H = 0.45, a = W / 2;
  rbox(m, -a, -a, 0, a, a, H, MAT.catMerah, 0.008);
  for (const sy of [-1, 1]) lat(m, [0, sy * a, H * 0.45], [0, sy, 0], [[0, 0], [0.1, 0], [0.105, 0.004], [0, 0.004]], MAT.kaca, 24);
  decalFront(m, 0, -a - 0.0002, H * 0.85, 0.26, 0.07, LBL('kerupuk'));
  part(m, 'TUTUP', null, () => lat(m, [0, 0, H], [0, 0, 1], [[0, 0], [0.09, 0], [0.09, 0.035], [0.08, 0.04], [0, 0.04]], MAT.catMerah, 20));
  // kerupuk di dalam (gumpalan)
  for (let k = 0; k < 7; k++) under(m, rotP([1, 0.3, 0], k), () => lat(m, [(k % 3 - 1) * 0.08, ((k * 7) % 3 - 1) * 0.07, 0.1 + k * 0.04], [0, 0, 1], [[0, 0], [0.07, 0], [0.06, 0.01], [0, 0.012]], mk('#e8d6a8', 'kertas'), 10));
  colBox(m, [-a, -a, 0], [a, a, H + 0.04]);
}
// Timbangan duduk (piring + jarum skala)
export function buildTimbangan(m) {
  rbox(m, -0.12, -0.15, 0, 0.12, 0.15, 0.2, MAT.catMerah, 0.02, { taper: 0.85 });
  lat(m, [0, -0.13, 0.12], [0, -1, 0], [[0, 0], [0.085, 0], [0.085, 0.01], [0, 0.012]], MAT.krom, 24);
  decal(m, [-0.075, -0.1425, 0.045], [0.075, -0.1425, 0.045], [0.075, -0.1425, 0.195], [-0.075, -0.1425, 0.195], LBL('timbangan'), [0, -1, 0]);
  lat(m, [0, 0, 0.2], [0, 0, 1], [[0, 0], [0.015, 0], [0.015, 0.03], [0, 0.03]], MAT.krom, 12);
  lat(m, [0, 0, 0.23], [0, 0, 1], [[0, 0], [0.16, 0.0], [0.18, 0.04], [0.17, 0.042], [0.15, 0.006], [0, 0.006]], MAT.krom, 28, { sx: 1.0, sy: 0.75 });
  colBox(m, [-0.12, -0.15, 0], [0.12, 0.15, 0.27]);
}
// Kasir sederhana: laci uang kayu + kalkulator + buku catatan + pulpen
export function buildKasir(m) {
  rbox(m, -0.2, -0.17, 0, 0.2, 0.17, 0.1, MAT.kayu, 0.005);
  part(m, 'LACI', null, () => {
    rbox(m, -0.18, -0.175, 0.012, 0.18, 0.15, 0.085, MAT.kayuMuda, 0.004);
    rbox(m, -0.04, -0.19, 0.04, 0.04, -0.175, 0.055, MAT.kuningan, 0.003);
  });
  under(m, comp(rotP([0, 0, 1], 0.2), trP([0.08, -0.02, 0.1])), () => {
    rbox(m, -0.045, -0.07, 0, 0.045, 0.07, 0.015, MAT.plHitam, 0.004);
    decalTop(m, 0, 0, 0.0155, 0.088, 0.135, LBL('kalkulator'));
  });
  rbox(m, -0.17, -0.1, 0.1, -0.02, 0.1, 0.115, MAT.kertas, 0.002);
  decalTop(m, -0.095, 0, 0.1155, 0.14, 0.19, LBL('jadwal'), [[0, 0.1], [1, 0.1], [1, 0.4], [0, 0.4]]);
  rod(m, [-0.13, -0.06, 0.12], [-0.03, 0.04, 0.12], 0.004, MAT.plBiru, 8);
  marker(m, 'INTERACT', [0, -0.3, 0.1]);
  colBox(m, [-0.2, -0.17, 0], [0.2, 0.17, 0.12]);
}
// Rak warung bertingkat (besi bercat) penuh dagangan
export function buildRakWarung(m) {
  const W = 1.0, D = 0.4, H = 1.6, a = W / 2, b = D / 2, c = MAT.catPutih;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rbox(m, sx * a - 0.018, sy * b - 0.018, 0, sx * a + 0.018, sy * b + 0.018, H, c, 0.004);
  const shelves = [0.08, 0.45, 0.82, 1.19, 1.56];
  for (const z of shelves) rbox(m, -a, -b, z, a, b, z + 0.02, c, 0.004);
  // isi tiap rak
  const R = (s) => { let x = Math.sin(s * 78.233) * 43758.5; return x - Math.floor(x); };
  shelves.slice(0, 4).forEach((z, si) => {
    let x = -a + 0.03, k = 0;
    while (x < a - 0.12) {
      const kind = Math.floor(R(si * 10 + k) * 5), z0 = z + 0.02;
      if (kind === 0) { under(m, trP([x + 0.06, 0, z0]), () => kemasanMi(m)); under(m, trP([x + 0.06, 0, z0 + 0.034]), () => kemasanMi(m)); x += 0.13; }
      else if (kind === 1) { under(m, trP([x + 0.04, 0, z0]), () => buildBotol(m, { plastik: true })); x += 0.08; }
      else if (kind === 2) { rbox(m, x, -0.1, z0, x + 0.12, 0.1, z0 + 0.18, MAT.kardus, 0.004); x += 0.13; }
      else if (kind === 3) { for (let j = 0; j < 3; j++) lat(m, [x + 0.035, -0.08 + j * 0.08, z0], [0, 0, 1], [[0, 0], [0.032, 0], [0.033, 0.003], [0.033, 0.11], [0.03, 0.112], [0, 0.112]], [MAT.catMerah, MAT.catHijau, MAT.krom][j], 14); x += 0.08; }
      else { under(m, trP([x + 0.05, 0, z0]), () => toplesShape(m, 0.045, 0.15, MAT.plKuning)); x += 0.1; }
      k++;
    }
  });
  colBox(m, [-a, -b, 0], [a, b, H]);
}
// Kulkas minuman berpintu kaca (showcase), lampu dalam
export function buildKulkas(m) {
  const W = 0.6, D = 0.6, H = 1.75, a = W / 2, b = D / 2;
  rbox(m, -a, -b, 0.05, a, b, H, MAT.catPutih, 0.015);
  rbox(m, -a + 0.01, -b - 0.0, H - 0.18, a - 0.01, -b + 0.0, H - 0.02, MAT.catMerah, 0.006);   // panel atas (fiktif tanpa merek)
  decalFront(m, 0, -b - 0.001, H - 0.1, 0.5, 0.12, LBL('toko'));
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lat(m, [sx * (a - 0.05), sy * (b - 0.05), 0], [0, 0, 1], [[0, 0], [0.02, 0], [0.02, 0.05], [0, 0.05]], MAT.plHitam, 8);
  rbox(m, -a + 0.04, -b + 0.04, 0.2, a - 0.04, b - 0.02, H - 0.22, mk('#e9ecef', 'plastik'), 0.004);   // dinding dalam
  for (const z of [0.5, 0.85, 1.2]) rbox(m, -a + 0.04, -b + 0.06, z, a - 0.04, b - 0.04, z + 0.01, MAT.logam, 0.002);
  for (const z of [0.2, 0.51, 0.86, 1.21]) for (let k = 0; k < 6; k++) under(m, trP([-0.22 + k * 0.088, -0.12, z]), () => buildBotol(m, { plastik: k % 2 === 0 }));
  part(m, 'DOOR', [-a, -b, 0.1], () => {
    rbox(m, -a, -b - 0.04, 0.1, a, -b, H - 0.2, MAT.catPutih, 0.008);
    rbox(m, -a + 0.05, -b - 0.042, 0.18, a - 0.05, -b - 0.038, H - 0.28, MAT.kaca, 0.001);
    rbox(m, a - 0.045, -b - 0.07, 0.6, a - 0.025, -b - 0.04, 1.2, MAT.krom, 0.006);
  });
  marker(m, 'LIGHT', [0, -0.05, H - 0.25], { type: 'fridge', color: '#e8f4ff', energy: 0.4 });
  marker(m, 'INTERACT', [0, -b - 0.1, 1.0]);
  colBox(m, [-a, -b - 0.04, 0], [a, b, H]);
}
// Poster warung (kertas tertempel dengan selotip, sudut sedikit mengelupas)
export function buildPoster(m, o = {}) {
  const w = 0.4, h = 0.6, n = 6, lbl = LBL(o.label ?? 'poster_kopi');
  for (let j = 0; j < n; j++) {
    const z0 = (h * j) / n, z1 = (h * (j + 1)) / n, cur = (z, x) => -0.002 - (z > h * 0.83 && x > w * 0.3 ? 0.02 * ((z - h * 0.83) / (h * 0.17)) : 0);
    for (let i = 0; i < 4; i++) {
      const x0 = -w / 2 + (w * i) / 4, x1 = x0 + w / 4;
      F(m, [[x0, cur(z0, x0), z0], [x1, cur(z0, x1), z0], [x1, cur(z1, x1), z1], [x0, cur(z1, x0), z1]], V3(0, -1, 0), lbl, null, { uv: [[i / 4, j / n], [(i + 1) / 4, j / n], [(i + 1) / 4, (j + 1) / n], [i / 4, (j + 1) / n]], soft: true });
    }
  }
  for (const [x, z] of [[-w / 2 + 0.02, h - 0.02], [-w / 2 + 0.02, 0.02], [w / 2 - 0.02, 0.02]]) rbox(m, x - 0.025, -0.0026, z - 0.01, x + 0.025, -0.002, z + 0.01, mk('#e8e0c0', 'kaca'), 0.0003);
  meta(m).wall = true;
}
// Meja warung panjang (kayu, kaki besi)
export function buildMejaWarung(m) {
  const W = 1.5, D = 0.6, H = 0.75, a = W / 2, b = D / 2;
  rbox(m, -a, -b, H - 0.025, a, b, H, MAT.kayuPutih, 0.004);
  decalTop(m, 0, 0, H + 0.0005, W - 0.04, D - 0.04, MAT.bunga, [[0, 0], [3, 0], [3, 1.2], [0, 1.2]]);   // taplak plastik motif
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rbox(m, sx * (a - 0.05) - 0.02, sy * (b - 0.05) - 0.02, 0, sx * (a - 0.05) + 0.02, sy * (b - 0.05) + 0.02, H - 0.025, MAT.besiHitam, 0.003);
  for (const sy of [-1, 1]) rbox(m, -a + 0.05, sy * (b - 0.05) - 0.012, H - 0.09, a - 0.05, sy * (b - 0.05) + 0.012, H - 0.025, MAT.besiHitam, 0.003);
  rbox(m, -a + 0.05, -0.012, 0.15, a - 0.05, 0.012, 0.18, MAT.besiHitam, 0.003);
  colBox(m, [-a, -b, H - 0.09], [a, b, H]);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) colBox(m, [sx * (a - 0.05) - 0.02, sy * (b - 0.05) - 0.02, 0], [sx * (a - 0.05) + 0.02, sy * (b - 0.05) + 0.02, H - 0.09]);
}

// ============================================================================ MASJID
// Karpet saf panjang bermotif (gulungan terbuka 1,2 x 3,6 m, bagian ujung tergulung)
export function buildKarpetSaf(m) {
  const W = 3.6, D = 1.2, n = 6;
  for (let i = 0; i < n; i++) {
    const x0 = -W / 2 + (W * i) / n, x1 = x0 + W / n;
    decal(m, [x0, -D / 2, 0.006], [x1, -D / 2, 0.006], [x1, D / 2, 0.006], [x0, D / 2, 0.006], MAT.sajadah, [0, 0, 1], [[0, 0], [1, 0], [1, 1.85], [0, 1.85]]);
  }
  rbox(m, -W / 2, -D / 2, 0, W / 2, D / 2, 0.006, MAT.kainHijau, 0.002);
  lat(m, [W / 2 + 0.06, 0, 0.065], [0, 1, 0], [[0, -D / 2], [0.065, -D / 2], [0.065, D / 2], [0, D / 2]].map(([r, z]) => [r, z]), MAT.kainHijau, 18);
}
// Pengeras suara corong (TOA-style tanpa logo) dengan braket
export function buildSpeakerCorong(m) {
  // menempel tiang/dinding: braket di y=0, corong menghadap -Y dan sedikit menunduk
  rbox(m, -0.03, -0.02, 0.0, 0.03, 0.0, 0.12, MAT.besiHitam, 0.004);
  under(m, rotP([1, 0, 0], -0.25, [0, -0.06, 0.06]), () => {
    lat(m, [0, -0.04, 0.06], [0, -1, 0], [[0, 0], [0.06, 0], [0.065, 0.03], [0.045, 0.08], [0.06, 0.15], [0.12, 0.3], [0.18, 0.38], [0.185, 0.39], [0.17, 0.39], [0.11, 0.3], [0.05, 0.16], [0, 0.16]], MAT.plKrem, 24, { sz: 0.8 });
    lat(m, [0, -0.04, 0.06], [0, 1, 0], [[0, 0], [0.065, 0], [0.06, 0.05], [0, 0.06]], MAT.plKrem, 16);
  });
  rod(m, [0, -0.02, 0.06], [0, -0.06, 0.06], 0.012, MAT.besiHitam, 8);
  marker(m, 'AUDIO', [0, -0.45, -0.04]);
  meta(m).wall = true;
}
// Bedug kecil di rangka kayu + pemukul
export function buildBedug(m) {
  const R = 0.32, L = 0.7;
  lat(m, [-L / 2, 0, 0.75], [1, 0, 0], [[0, 0], [R - 0.02, 0], [R, 0.03], [R + 0.03, L * 0.5], [R, L - 0.03], [R - 0.02, L], [0, L]], MAT.kayu, 28);
  for (const sx of [-1, 1]) {
    lat(m, [sx * (L / 2 + 0.002), 0, 0.75], [sx, 0, 0], [[0, 0], [R - 0.022, 0], [R - 0.024, 0.002], [0, 0.003]], mk('#d9c49a', 'kain'), 28);
    for (let k = 0; k < 16; k++) { const t = (k / 16) * TAU; lat(m, [sx * (L / 2 - 0.02), Math.cos(t) * (R - 0.0), 0.75 + Math.sin(t) * (R - 0.0)], [0, Math.cos(t), Math.sin(t)], [[0, 0], [0.008, 0], [0.006, 0.006], [0, 0.007]], MAT.kuningan, 6); }
  }
  // rangka penyangga
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) rbox(m, sx * 0.3 - 0.03, sy * 0.3 - 0.03, 0, sx * 0.3 + 0.03, sy * 0.3 + 0.03, 0.62, MAT.jati, 0.005);
    rbox(m, sx * 0.3 - 0.035, -0.36, 0.42, sx * 0.3 + 0.035, 0.36, 0.48, MAT.jati, 0.005);
  }
  rod(m, [0.2, -0.3, 0.36], [0.45, -0.4, 0.01], 0.018, MAT.kayu, 8);
  ball(m, [0.2, -0.3, 0.36], 0.035, MAT.kain, 10);
  colBox(m, [-0.42, -0.36, 0], [0.42, 0.36, 1.1]);
}

// ============================================================================ KEBUN / HALAMAN
export function buildKarungGoni(m, o = {}) {
  const rings = [];
  const prof = o.kosong ? [[0, 0.22], [0.03, 0.3], [0.08, 0.28], [0.12, 0.22]] : [[0, 0.2], [0.03, 0.27], [0.25, 0.3], [0.5, 0.29], [0.62, 0.22], [0.72, 0.12], [0.76, 0.08]];
  prof.forEach(([z, r], j) => rings.push([...Array(16)].map((_, i) => { const t = (i / 16) * TAU; const wob = 1 + 0.06 * Math.sin(t * 3 + j * 1.7); return [Math.cos(t) * r * wob * 1.15, Math.sin(t) * r * wob * 0.8, z]; })));
  loft(m, rings, MAT.goni);
  if (!o.kosong) lat(m, [0, 0, 0.74], [0, 0, 1], [[0, 0], [0.09, 0], [0.12, 0.08], [0.06, 0.12], [0, 0.13]], MAT.goni, 12, { sy: 0.7 });
  colBox(m, [-0.3, -0.22, 0], [0.3, 0.22, o.kosong ? 0.12 : 0.8]);
}
// Kandang ayam bambu (kurungan anyaman setengah bola) di atas alas
export function buildKandangAyam(m) {
  const R = 0.45, H = 0.55;
  // rusuk bambu
  for (let k = 0; k < 16; k++) {
    const t = (k / 16) * TAU, path = [];
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); path.push([Math.cos(t) * R * Math.cos(a), Math.sin(t) * R * Math.cos(a), H * Math.sin(a) + 0.02]); }
    sweep(m, path, 0.006, MAT.bambu, 5, {});
  }
  for (const z of [0.02, 0.2, 0.38]) { const r = R * Math.cos(Math.asin(Math.min(1, (z - 0.02) / H))); lat(m, [0, 0, z], [0, 0, 1], [[r - 0.008, 0], [r + 0.008, 0], [r + 0.008, 0.012], [r - 0.008, 0.012]], MAT.bambuTua, 32); }
  sweep(m, [[-0.06, 0, H + 0.01], [0, 0, H + 0.1], [0.06, 0, H + 0.01]], 0.01, MAT.bambuTua, 6);   // pegangan
  colBox(m, [-R, -R, 0], [R, R, H]);
}
export function buildTongSampah(m, o = {}) {
  const c = o.mat ?? MAT.plHijau;
  lat(m, [0, 0, 0], [0, 0, 1], [[0, 0], [0.2, 0], [0.205, 0.01], [0.24, 0.62], [0.25, 0.63], [0.25, 0.66], [0.235, 0.66], [0.225, 0.64], [0.19, 0.03], [0, 0.03]], c, 28);
  for (const z of [0.2, 0.4]) lat(m, [0, 0, z], [0, 0, 1], [[0.212 + z * 0.06, 0], [0.218 + z * 0.06, 0.01], [0.212 + z * 0.06, 0.02]], c, 28);
  part(m, 'TUTUP', null, () => lat(m, [0, 0, 0.655], [0, 0, 1], [[0, 0], [0.26, 0], [0.26, 0.03], [0.2, 0.06], [0, 0.07]], c, 28));
  for (const sx of [-1, 1]) rbox(m, sx * 0.245 - 0.02 * (sx > 0 ? 0 : 1), -0.05, 0.5, sx * 0.245 + 0.02 * (sx > 0 ? 1 : 0), 0.05, 0.53, c, 0.006);
  colBox(m, [-0.25, -0.25, 0], [0.25, 0.25, 0.72]);
}
export function buildDrum(m, o = {}) {
  const c = o.mat ?? mk('#2f5a8a', 'logam_cat');
  lat(m, [0, 0, 0], [0, 0, 1], [[0, 0], [0.28, 0], [0.29, 0.015], [0.29, 0.29], [0.295, 0.3], [0.29, 0.31], [0.29, 0.58], [0.295, 0.59], [0.29, 0.6], [0.29, 0.87], [0.28, 0.885], [0.27, 0.885], [0.27, 0.875], [0, 0.875]], c, 32);
  lat(m, [0.18, 0, 0.875], [0, 0, 1], [[0, 0], [0.03, 0], [0.03, 0.012], [0, 0.012]], c, 10);
  colBox(m, [-0.29, -0.29, 0], [0.29, 0.29, 0.885]);
}
// Pot tanah liat / plastik + tanaman (daun berkartu alfa)
export function buildPot(m, o = {}) {
  const c = o.plastik ? (o.mat ?? MAT.plHitam) : MAT.terakota, r = o.r ?? 0.15, h = o.h ?? 0.24;
  lat(m, [0, 0, 0], [0, 0, 1], [[0, 0], [r * 0.7, 0], [r * 0.72, 0.01], [r, h - 0.03], [r * 1.08, h - 0.028], [r * 1.08, h], [r * 0.98, h], [r * 0.93, h - 0.02], [r * 0.66, 0.03], [0, 0.03]], c, 24);
  lat(m, [0, 0, h - 0.035], [0, 0, 1], [[0, 0], [r * 0.95, 0], [r * 0.6, 0.008], [0, 0.012]], MAT.tanah, 20);
  if (o.tanaman !== false) {
    // tanaman lidah mertua / puring: daun-daun tegak melengkung (bagian LEAVES, bahan daun alfa)
    part(m, 'LEAVES', null, () => {
      const R = (s) => { let x = Math.sin(s * 91.7) * 43758.5; return x - Math.floor(x); };
      for (let k = 0; k < 11; k++) {
        const a = R(k) * TAU, tilt = 0.15 + R(k + 5) * 0.45, L = 0.35 + R(k + 9) * 0.35, w = 0.035 + R(k + 2) * 0.03;
        const rings = [];
        for (let i = 0; i <= 6; i++) {
          const t = i / 6, d = Math.sin(tilt) * L * t + 0.08 * t * t, z = h - 0.03 + Math.cos(tilt) * L * t - 0.1 * t * t * tilt;
          const cx = Math.cos(a) * (0.02 + d), cy = Math.sin(a) * (0.02 + d), ww = w * Math.sin(Math.PI * (0.15 + 0.85 * t)) + 0.004;
          const px = -Math.sin(a) * ww, py = Math.cos(a) * ww;
          rings.push([[cx - px, cy - py, z], [cx, cy, z + 0.006], [cx + px, cy + py, z], [cx, cy, z - 0.002]]);
        }
        loft(m, rings, MAT.daun, { cap: false });
      }
    });
  }
  colBox(m, [-r, -r, 0], [r, r, h]);
}
// Sepeda tua (onthel tanpa merek): rangka pipa, roda jari-jari, sadel, setang, boncengan, standar
export function buildSepeda(m) {
  const Rw = 0.33, wb = 1.1, fy = -wb / 2, ry = wb / 2, c = MAT.besiHitam;
  const wheel = (y) => {
    lat(m, [0, y, Rw], [1, 0, 0], [[Rw - 0.02, -0.016], [Rw - 0.004, -0.016], [Rw + 0.012, -0.008], [Rw + 0.016, 0], [Rw + 0.012, 0.008], [Rw - 0.004, 0.016], [Rw - 0.02, 0.016], [Rw - 0.022, 0], [Rw - 0.02, -0.016]], MAT.karet, 32);
    lat(m, [0, y, Rw], [1, 0, 0], [[Rw - 0.035, -0.01], [Rw - 0.02, -0.012], [Rw - 0.02, 0.012], [Rw - 0.035, 0.01]], MAT.krom, 32);
    lat(m, [-0.04, y, Rw], [1, 0, 0], [[0, 0], [0.022, 0], [0.022, 0.08], [0, 0.08]], MAT.krom, 12);
    for (let k = 0; k < 18; k++) { const t = (k / 18) * TAU, s = k % 2 ? 1 : -1; rod(m, [s * 0.035, y + Math.cos(t) * 0.02, Rw + Math.sin(t) * 0.02], [s * 0.008, y + Math.cos(t + 0.3) * (Rw - 0.03), Rw + Math.sin(t + 0.3) * (Rw - 0.03)], 0.0012, MAT.krom, 4); }
  };
  wheel(fy); wheel(ry);
  const bb = [0, 0.05, 0.3], seat = [0, 0.22, 0.85], head = [0, -0.4, 0.92], headL = [0, -0.37, 0.72];
  const tube = (a, b, r = 0.016) => rod(m, a, b, r, c, 10);
  tube(bb, seat, 0.017); tube(seat, head, 0.016); tube(bb, headL, 0.018); tube(head, headL, 0.02);
  for (const sx of [-1, 1]) { tube([sx * 0.04, ry, Rw], bb, 0.009); tube([sx * 0.04, ry, Rw], [sx * 0.03, seat[1] + 0.02, seat[2] - 0.05], 0.009); tube([sx * 0.04, fy, Rw], [sx * 0.03, headL[1] + 0.03, headL[2] - 0.05], 0.012); }
  // setang melengkung ke belakang
  tube(head, [0, -0.42, 1.0], 0.014);
  sweep(m, [[-0.3, -0.3, 1.02], [-0.2, -0.4, 1.0], [0, -0.43, 1.0], [0.2, -0.4, 1.0], [0.3, -0.3, 1.02]], 0.011, MAT.krom, 8);
  for (const sx of [-1, 1]) rod(m, [sx * 0.3, -0.3, 1.02], [sx * 0.3, -0.18, 1.03], 0.016, MAT.karet, 8);
  // sadel kulit
  lat(m, [0, seat[1] + 0.02, seat[2] + 0.02], [0, -1, 0], [[0, 0], [0.09, 0], [0.1, 0.06], [0.06, 0.15], [0.025, 0.24], [0, 0.25]], mk('#3a2a1e', 'karet'), 14, { sz: 0.35 });
  // boncengan, spakbor, rantai
  rbox(m, -0.07, 0.3, 0.72, 0.07, 0.72, 0.735, c, 0.004);
  for (const y of [fy, ry]) { const rings = []; for (let i = 0; i <= 10; i++) { const t = (y < 0 ? 0.1 : 0.4) * Math.PI + (i / 10) * 0.55 * Math.PI, ry2 = y + (Rw + 0.04) * Math.cos(t) * (y < 0 ? -1 : 1), z = Rw + (Rw + 0.04) * Math.sin(t); rings.push([[-0.035, ry2, z], [0.035, ry2, z], [0.035, ry2, z + 0.004], [-0.035, ry2, z + 0.004]]); } loft(m, rings, c); }
  lat(m, [0.05, bb[1], bb[2]], [1, 0, 0], [[0, 0], [0.09, 0], [0.09, 0.006], [0, 0.006]], MAT.logam, 24);
  sweep(m, [[0.055, bb[1], bb[2] + 0.09], [0.055, ry, Rw + 0.04], [0.055, ry, Rw - 0.04], [0.055, bb[1], bb[2] - 0.09]], 0.004, MAT.logam, 5);
  for (const sx of [-1, 1]) { rod(m, [sx * 0.06, bb[1], bb[2]], [sx * 0.08, bb[1] + sx * 0.12, bb[2] - sx * 0.1], 0.008, MAT.krom, 6); rbox(m, sx * 0.08 - 0.04, bb[1] + sx * 0.12 - 0.02, bb[2] - sx * 0.1 - 0.01, sx * 0.08 + 0.04, bb[1] + sx * 0.12 + 0.02, bb[2] - sx * 0.1 + 0.01, MAT.karet, 0.004); }
  rod(m, [0.03, 0.4, Rw], [0.12, 0.45, 0.0], 0.008, MAT.krom, 6);   // standar samping
  lat(m, [0, -0.47, 0.88], [0, -1, 0], [[0, 0], [0.045, 0], [0.05, 0.04], [0, 0.05]], MAT.krom, 14);   // lampu depan dinamo
  colBox(m, [-0.32, -0.9, 0], [0.32, 0.9, 1.05]);
}

// ============================================================================ pendaftaran pustaka (grup 'interior')
const R = (key, name, icon, build) => { LIBRARY[key] = { name, icon, grp: 'interior', build }; };
R('in_kursi_kayu', 'Kursi kayu jati', '🪑', (m) => buildKursiKayu(m));
R('in_kursi_kayu_rusak', 'Kursi kayu rusak', '🪑', (m) => buildKursiKayu(m, { rusak: true }));
R('in_kursi_plastik', 'Kursi plastik monoblok', '🪑', (m) => buildKursiPlastik(m));
R('in_kursi_tamu', 'Kursi tamu jati (berbantal)', '🛋️', (m) => buildKursiTamu(m));
R('in_sofa_tamu', 'Sofa tamu jati panjang', '🛋️', (m) => buildKursiTamu(m, { w: 1.5 }));
R('in_meja_tamu', 'Meja tamu + taplak renda', '▭', (m) => buildMejaTamu(m));
R('in_meja_makan', 'Meja makan kayu', '▭', (m) => buildMejaMakan(m));
R('in_bufet', 'Lemari kaca / bufet', '🗄️', (m) => buildBufet(m));
R('in_lemari_pakaian', 'Lemari pakaian jati 2 pintu', '🚪', (m) => buildLemariPakaian(m));
R('in_dipan', 'Dipan + kasur kapuk + bantal guling', '🛏️', (m) => buildDipan(m));
R('in_bantal', 'Bantal', '🛏️', buildBantal);
R('in_guling', 'Guling', '🛏️', buildGuling);
R('in_meja_tv', 'Meja TV kayu', '▭', (m) => buildMejaTV(m));
R('in_rak_piring', 'Rak piring kayu', '🍽️', (m) => buildRakPiring(m));
R('in_bale_bambu', 'Bale-bale bambu', '🎋', (m) => buildBaleBambu(m));
R('in_bangku_panjang', 'Bangku panjang kayu', '🪑', (m) => buildBangkuPanjang(m));
R('in_rak_alquran', "Rak Al-Qur'an", '📗', (m) => buildRakAlquran(m));
R('in_mimbar', 'Mimbar kayu', '🕌', (m) => buildMimbar(m));
R('in_tv_tabung', 'TV tabung 21"', '📺', (m) => buildTVTabung(m));
R('in_tv_kecil', 'TV tabung kecil 14"', '📺', (m) => buildTVKecil(m));
R('in_radio', 'Radio transistor', '📻', (m) => buildRadio(m));
R('in_kipas_berdiri', 'Kipas angin berdiri', '🌀', (m) => buildKipasBerdiri(m));
R('in_kipas_plafon', 'Kipas angin langit-langit', '🌀', (m) => buildKipasPlafon(m));
R('in_lampu_neon', 'Lampu neon batang', '💡', (m) => buildLampuNeon(m));
R('in_bohlam', 'Bohlam gantung', '💡', (m) => buildBohlam(m));
R('in_kalender', 'Kalender dinding', '📅', (m) => buildKalender(m));
R('in_jam_dinding', 'Jam dinding', '🕒', (m) => buildJamDinding(m));
R('in_bingkai_foto', 'Bingkai foto keluarga', '🖼️', (m) => buildBingkaiFoto(m));
R('in_cermin', 'Cermin dinding', '🪞', (m) => buildCermin(m));
R('in_stopkontak', 'Stopkontak + kabel', '🔌', (m) => buildStopkontak(m));
R('in_piring', 'Piring', '🍽️', buildPiring);
R('in_gelas', 'Gelas belimbing', '🥛', buildGelas);
R('in_cangkir', 'Cangkir + tatakan', '☕', (m) => buildCangkir(m));
R('in_teko', 'Teko enamel', '🫖', (m) => buildTeko(m));
R('in_panci', 'Panci', '🍲', (m) => buildPanci(m));
R('in_wajan', 'Wajan', '🍳', (m) => buildWajan(m));
R('in_sendok', 'Sendok', '🥄', (m) => buildSendok(m));
R('in_kompor', 'Kompor gas 2 tungku', '🔥', (m) => buildKompor(m));
R('in_tabung_gas', 'Tabung gas 3 kg', '🟢', (m) => buildTabungGas(m));
R('in_magic_com', 'Penanak nasi (magic com)', '🍚', (m) => buildMagicCom(m));
R('in_termos', 'Termos', '🧴', (m) => buildTermos(m));
R('in_dispenser', 'Dispenser + galon', '🚰', (m) => buildDispenser(m));
R('in_galon', 'Galon air', '🫙', (m) => buildGalon(m));
R('in_ember', 'Ember plastik', '🪣', (m) => buildEmber(m));
R('in_gayung', 'Gayung', '🪣', (m) => buildGayung(m));
R('in_bak_mandi', 'Bak mandi keramik', '🛁', (m) => buildBakMandi(m));
R('in_kloset_jongkok', 'Kloset jongkok', '🚽', (m) => buildKlosetJongkok(m));
R('in_sapu_ijuk', 'Sapu ijuk', '🧹', (m) => buildSapuIjuk(m));
R('in_kemoceng', 'Kemoceng', '🪶', (m) => buildKemoceng(m));
R('in_keset', 'Keset', '▭', (m) => buildKeset(m));
R('in_sandal_kiri', 'Sandal jepit (kiri)', '🩴', (m) => buildSandal(m, { side: -1 }));
R('in_sandal_kanan', 'Sandal jepit (kanan)', '🩴', (m) => buildSandal(m, { side: 1 }));
R('in_sajadah', 'Sajadah', '🕌', (m) => buildSajadah(m));
R('in_mukena_lipat', 'Mukena terlipat', '🧕', buildMukenaLipat);
R('in_mukena_gantung', 'Mukena tergantung', '🧕', (m) => buildMukenaGantung(m));
R('in_sarung_lipat', 'Sarung terlipat', '🧣', buildSarungLipat);
R('in_selimut_lipat', 'Selimut terlipat', '🧣', buildSelimutLipat);
R('in_baju_gantung', 'Kemeja batik di gantungan', '👔', (m) => buildBajuGantung(m));
R('in_jaket_gantung', 'Jaket tergantung', '🧥', (m) => buildJaketGantung(m));
R('in_jemuran', 'Jemuran bambu + pakaian', '👕', (m) => buildJemuran(m));
R('in_obat', 'Obat-obatan', '💊', (m) => buildObat(m));
R('in_koran', 'Koran lama', '📰', (m) => buildKoran(m));
R('in_kardus', 'Kardus bekas', '📦', (m) => buildKardus(m));
R('in_kardus_terbuka', 'Kardus terbuka', '📦', (m) => buildKardus(m, { terbuka: true, w: 0.45, d: 0.35, h: 0.3 }));
R('in_kresek', 'Kantong kresek', '🛍️', (m) => buildKresek(m));
R('in_botol_kaca', 'Botol kaca bekas', '🍾', (m) => buildBotol(m));
R('in_botol_plastik', 'Botol air mineral', '🧴', (m) => buildBotol(m, { plastik: true }));
R('in_rak_sandal', 'Rak sandal kayu', '🩴', (m) => buildRakSandal(m));
R('in_kentongan', 'Kentongan bambu', '🎋', (m) => buildKentongan(m));
R('in_papan_jadwal', 'Papan jadwal ronda', '📋', (m) => buildPapanJadwal(m));
R('in_gelas_kopi', 'Gelas kopi tubruk', '☕', (m) => buildGelasKopi(m));
R('in_rokok', 'Bungkus rokok (fiktif)', '🚬', (m) => buildBungkusRokok(m));
R('in_asbak', 'Asbak penuh puntung', '🚬', (m) => buildAsbak(m));
R('in_kartu_remi', 'Kartu remi berserakan', '🃏', (m) => buildKartuRemi(m));
R('in_senter', 'Senter', '🔦', (m) => buildSenter(m));
R('in_helm', 'Helm', '⛑️', (m) => buildHelm(m));
R('in_etalase', 'Etalase kaca warung', '🏪', (m) => buildEtalase(m));
R('in_rak_warung', 'Rak warung bertingkat', '🏪', (m) => buildRakWarung(m));
R('in_mi_tumpuk', 'Tumpukan mi instan', '🍜', (m) => buildMiTumpuk(m));
R('in_kopi_renteng', 'Renteng kopi sachet', '☕', (m) => buildKopiRenteng(m));
R('in_kaleng_kerupuk', 'Kaleng kerupuk', '🥫', (m) => buildKalengKerupuk(m));
R('in_toples', 'Toples permen', '🍬', (m) => buildToples(m));
R('in_timbangan', 'Timbangan', '⚖️', (m) => buildTimbangan(m));
R('in_kasir', 'Kasir sederhana', '💰', (m) => buildKasir(m));
R('in_kulkas', 'Kulkas minuman', '🧊', (m) => buildKulkas(m));
R('in_poster_kopi', 'Poster warung (kopi)', '🖼️', (m) => buildPoster(m, { label: 'poster_kopi' }));
R('in_poster_mi', 'Poster warung (mi)', '🖼️', (m) => buildPoster(m, { label: 'poster_mi' }));
R('in_meja_warung', 'Meja warung', '▭', (m) => buildMejaWarung(m));
R('in_karpet_saf', 'Karpet saf masjid', '🕌', (m) => buildKarpetSaf(m));
R('in_speaker_corong', 'Pengeras suara corong', '📢', (m) => buildSpeakerCorong(m));
R('in_bedug', 'Bedug kecil', '🥁', (m) => buildBedug(m));
R('in_karung_goni', 'Karung goni', '🧺', (m) => buildKarungGoni(m));
R('in_kandang_ayam', 'Kurungan ayam bambu', '🐔', (m) => buildKandangAyam(m));
R('in_tong_sampah', 'Tong sampah plastik', '🗑️', (m) => buildTongSampah(m));
R('in_drum', 'Drum besi', '🛢️', (m) => buildDrum(m));
R('in_pot_tanah', 'Pot tanah liat + tanaman', '🪴', (m) => buildPot(m));
R('in_pot_plastik', 'Pot plastik + tanaman', '🪴', (m) => buildPot(m, { plastik: true, r: 0.12, h: 0.2 }));
R('in_sepeda', 'Sepeda onthel tua', '🚲', (m) => buildSepeda(m));
