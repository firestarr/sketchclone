// Properti tambahan area publik kampung (pos ronda, warung, masjid) — grup pustaka 'interior'.
// Dibuat untuk game "Malam Jumat di Kampung Mati" (AREA-PUBLIK; diekspor lewat D:\KampungMati\tools\level_publik\extra),
// tetapi bisa juga ditempatkan langsung dari panel Pustaka. Konvensi sama dengan interior_nusantara.js:
// depan ke -Y, alas di z = 0, berpusat di sumbu X/Y; f.mat = jenis bahan, f.uv = koordinat label, m._meta = penanda/tabrakan.
import * as THREE from 'three';
import * as G from './geometry.js';
import { LIBRARY } from './library.js';
import { MAT, buildKalengKerupuk } from './interior_nusantara.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const LBL = (name) => ({ c: '#ffffff', k: 'label_' + name });

function F(m, pts, hint, mat, sid, o = {}) {
  const f = G.makeFace(m, pts, hint, mat.c, sid);
  if (!f) return null;
  if (o.uv) {
    const ks = pts.map((p) => G.key(p));
    f.uv = f.pts.map((p) => o.uv[ks.indexOf(G.key(p))] ?? [0, 0]);
  }
  f.mat = mat.k;
  if (m._part) f.part = m._part;
  f.soft = o.soft ?? true;
  m.faces.push(f);
  return f;
}
const cen = (pts) => { const c = [0, 0, 0]; for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } return c.map((v) => v / pts.length); };
const sub = (a, b) => V3(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function loft(m, rings, mat, o = {}) {
  const sid = m.nextId++, N = rings[0].length, cs = rings.map(cen);
  for (let k = 0; k < rings.length - 1; k++) {
    const A = rings[k], B = rings[k + 1], cc = cen([cs[k], cs[k + 1]]);
    for (let i = 0; i < N; i++) {
      const i1 = (i + 1) % N, q = [A[i], A[i1], B[i1], B[i]];
      const hint = sub(cen(q), cc);
      for (const t of [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]) F(m, t, hint, mat, sid, o);
    }
  }
  if (o.cap !== false) {
    for (const [a, b] of [[0, 1], [rings.length - 1, rings.length - 2]]) F(m, rings[a], sub(cs[a], cs[b]), mat, sid, { ...o, soft: false });
  }
  return sid;
}
function rring(cx, cy, z, a, b, c) {
  c = Math.min(c, a * 0.9, b * 0.9);
  return [[cx - a + c, cy - b, z], [cx + a - c, cy - b, z], [cx + a, cy - b + c, z], [cx + a, cy + b - c, z], [cx + a - c, cy + b, z], [cx - a + c, cy + b, z], [cx - a, cy + b - c, z], [cx - a, cy - b + c, z]];
}
// balok bertepi tumpul (chamfer b)
function rbox(m, x0, y0, z0, x1, y1, z1, mat, b = 0.003) {
  [x0, x1] = [Math.min(x0, x1), Math.max(x0, x1)]; [y0, y1] = [Math.min(y0, y1), Math.max(y0, y1)]; [z0, z1] = [Math.min(z0, z1), Math.max(z0, z1)];
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, a = (x1 - x0) / 2, bb = (y1 - y0) / 2;
  b = Math.min(b, a * 0.45, bb * 0.45, (z1 - z0) * 0.45);
  return loft(m, [rring(cx, cy, z0, a - b, bb - b, b), rring(cx, cy, z0 + b, a, bb, b * 1.4), rring(cx, cy, z1 - b, a, bb, b * 1.4), rring(cx, cy, z1, a - b, bb - b, b)], mat);
}
// silinder bersegi seg dari a ke b (jari-jari r .. r2)
function rod(m, a, b, r, mat, seg = 10, r2 = null) {
  const d = V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length(); d.normalize();
  const up = Math.abs(d.z) < 0.9 ? V3(0, 0, 1) : V3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(d, up).normalize(), v = new THREE.Vector3().crossVectors(d, u).normalize();
  const ring = (p, rr) => [...Array(seg)].map((_, k) => { const t = (TAU * k) / seg; return [p[0] + rr * (Math.cos(t) * u.x + Math.sin(t) * v.x), p[1] + rr * (Math.cos(t) * u.y + Math.sin(t) * v.y), p[2] + rr * (Math.cos(t) * u.z + Math.sin(t) * v.z)]; });
  return loft(m, [ring(a, r), ring(b, r2 ?? r)], mat);
}
function decal(m, p0, p1, p2, p3, mat, hint, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
  return F(m, [p0, p1, p2, p3], V3(...hint), mat, null, { uv, soft: false });
}
function meta(m) { if (!m._meta) m._meta = { pivots: {}, markers: [], cols: [] }; return m._meta; }
const marker = (m, name, p, extra = {}) => meta(m).markers.push({ name, p, ...extra });
const colBox = (m, min, max) => meta(m).cols.push({ type: 'box', min, max, part: null });

// ============================================================================ WARUNG
// Buku utang warung: buku tulis terbuka (dua halaman sedikit melengkung ke punggung), sampul hijau, pulpen di atasnya.
export function buildBukuUtang(m) {
  const W = 0.15, D = 0.21, T = 0.006, n = 6;
  // sampul (terbuka datar)
  rbox(m, -W - 0.004, -D / 2 - 0.004, 0, W + 0.004, D / 2 + 0.004, 0.0015, MAT.kainHijau, 0.0008);
  // tumpukan halaman tiap sisi (tebal T, menipis ke tepi luar)
  for (const s of [-1, 1]) {
    const x0 = s * 0.004, x1 = s * W;
    rbox(m, Math.min(x0, x1), -D / 2, 0.0015, Math.max(x0, x1), D / 2, 0.0015 + T * 0.7, MAT.kertas, 0.001);
  }
  // permukaan halaman berlabel: lengkung ke punggung (z naik di dekat tepi luar, turun di tengah)
  const z = (x) => 0.0015 + T * 0.7 + 0.004 * Math.sin(Math.min(1, Math.abs(x) / W) * Math.PI * 0.5) + 0.0005;
  for (let i = 0; i < n * 2; i++) {
    const xa = -W + (2 * W * i) / (n * 2), xb = xa + (2 * W) / (n * 2);
    const ua = i / (n * 2), ub = (i + 1) / (n * 2);
    F(m, [[xa, -D / 2, z(xa)], [xb, -D / 2, z(xb)], [xb, D / 2, z(xb)], [xa, D / 2, z(xa)]], V3(0, 0, 1), LBL('buku_utang'), null,
      { uv: [[ua, 0], [ub, 0], [ub, 1], [ua, 1]], soft: true });
  }
  // pulpen biru tergeletak miring di halaman kanan
  const pz = z(0.08) + 0.0045;
  rod(m, [0.03, -0.07, pz], [0.11, 0.06, pz], 0.0045, MAT.plBening, 8);
  rod(m, [0.11, 0.06, pz], [0.118, 0.073, pz], 0.0045, MAT.plBiru, 8, 0.0015);
  rod(m, [0.026, -0.076, pz], [0.03, -0.07, pz], 0.0046, MAT.plBiru, 8);
}
// Korek api kotak (laci sedikit terbuka, kepala korek merah), label di atas, sisi gosok gelap.
export function buildKorekApi(m) {
  const a = 0.027, b = 0.018, h = 0.015;
  // selongsong
  rbox(m, -a, -b, 0, a, b, 0.0012, MAT.kardus, 0.0004);
  rbox(m, -a, -b, h - 0.0012, a, b, h, MAT.kardus, 0.0004);
  rbox(m, -a, -b, 0, a, -b + 0.0012, h, MAT.kardus, 0.0004);
  rbox(m, -a, b - 0.0012, 0, a, b, h, MAT.kardus, 0.0004);
  decal(m, [-a, -b, h + 0.0003], [a, -b, h + 0.0003], [a, b, h + 0.0003], [-a, b, h + 0.0003], LBL('korek'), [0, 0, 1]);
  for (const s of [-1, 1]) decal(m, [-a, s * (b + 0.0003), 0.002], [a, s * (b + 0.0003), 0.002], [a, s * (b + 0.0003), h - 0.002], [-a, s * (b + 0.0003), h - 0.002], { c: '#4a2a22', k: 'karet' }, [0, s, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  // laci keluar 1,5 cm di sisi +X
  rbox(m, -a + 0.015, -b + 0.0015, 0.0013, a + 0.015, b - 0.0015, 0.0028, MAT.kardus, 0.0003);
  for (let i = 0; i < 7; i++) {
    const y = -b + 0.004 + i * 0.0045;
    rod(m, [a - 0.03, y, 0.0045], [a + 0.012, y, 0.0045], 0.0011, MAT.kayuMuda, 5);
    rod(m, [a + 0.012, y, 0.0045], [a + 0.016, y, 0.0045], 0.0019, MAT.catMerah, 6, 0.0014);
  }
}
// Lilin batang isi 10: 5 batang terlihat dalam ikatan kertas berlabel.
export function buildLilin(m) {
  const L = 0.17, r = 0.0085, wax = { c: '#f3efe2', k: 'plastik' };
  const ys = [-0.034, -0.017, 0, 0.017, 0.034];
  for (let i = 0; i < ys.length; i++) {
    rod(m, [-L / 2, ys[i], r], [L / 2, ys[i], r], r, wax, 10);
    rod(m, [L / 2, ys[i], r], [L / 2 + 0.008, ys[i], r], 0.0012, MAT.kainHitam, 5);
  }
  for (let i = 0; i < 4; i++) rod(m, [-L / 2 + 0.006, (ys[i] + ys[i + 1]) / 2, r * 2.6], [L / 2 - 0.006, (ys[i] + ys[i + 1]) / 2, r * 2.6], r, wax, 10);
  // ikatan kertas (label) melingkar
  const bw = 0.06, y0 = -0.045, y1 = 0.045, z1 = r * 3.7;
  decal(m, [-bw / 2, y0, z1], [bw / 2, y0, z1], [bw / 2, y1, z1], [-bw / 2, y1, z1], LBL('lilin'), [0, 0, 1]);
  decal(m, [-bw / 2, y0, 0.0005], [bw / 2, y0, 0.0005], [bw / 2, y0, z1], [-bw / 2, y0, z1], LBL('lilin'), [0, -1, 0]);
  decal(m, [bw / 2, y1, 0.0005], [-bw / 2, y1, 0.0005], [-bw / 2, y1, z1], [bw / 2, y1, z1], LBL('lilin'), [0, 1, 0]);
}

// ============================================================================ MASJID
// Kotak amal kayu jati: badan, tutup bercelah, gembok kecil, label hijau di depan, kaki pendek.
export function buildKotakAmal(m) {
  const a = 0.17, b = 0.14, H = 0.46;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) rbox(m, sx * a - (sx > 0 ? 0.03 : -0.03) - 0.015, sy * b - (sy > 0 ? 0.03 : -0.03) - 0.015, 0, sx * a - (sx > 0 ? 0.03 : -0.03) + 0.015, sy * b - (sy > 0 ? 0.03 : -0.03) + 0.015, 0.04, MAT.kayuGelap, 0.003);
  rbox(m, -a, -b, 0.04, a, b, H - 0.03, MAT.jati, 0.008);
  rbox(m, -a - 0.012, -b - 0.012, H - 0.03, a + 0.012, b + 0.012, H, MAT.jati, 0.006);
  // celah uang
  rbox(m, -0.07, -0.006, H, 0.07, 0.006, H + 0.002, MAT.kayuGelap, 0.001);
  // label depan
  decal(m, [-0.14, -b - 0.0012, 0.12], [0.14, -b - 0.0012, 0.12], [0.14, -b - 0.0012, 0.33], [-0.14, -b - 0.0012, 0.33], LBL('kotak_amal'), [0, -1, 0]);
  // engsel + gembok
  rbox(m, -0.02, -b - 0.008, H - 0.06, 0.02, -b, H - 0.035, MAT.kuningan, 0.002);
  rod(m, [0, -b - 0.014, H - 0.085], [0, -b - 0.004, H - 0.085], 0.016, MAT.kuningan, 12);
  rod(m, [-0.01, -b - 0.01, H - 0.068], [0.01, -b - 0.01, H - 0.068], 0.004, MAT.krom, 6);
  colBox(m, [-a - 0.012, -b - 0.012, 0], [a + 0.012, b + 0.012, H]);
}
// Papan jadwal waktu salat (dinding): bingkai kayu, kaca, label jadwal. Punggung menempel dinding (y = +tebal/2).
export function buildJadwalSalat(m) {
  const W = 0.62, H = 0.47, T = 0.025;
  const y0 = -T / 2, y1 = T / 2;
  rbox(m, -W / 2, y0 + 0.004, 0, W / 2, y1, H, MAT.kayuPutih, 0.002);
  for (const [x0, z0, x1, z1] of [[-W / 2, 0, W / 2, 0.035], [-W / 2, H - 0.035, W / 2, H], [-W / 2, 0, -W / 2 + 0.035, H], [W / 2 - 0.035, 0, W / 2, H]]) rbox(m, x0, y0, z0, x1, y1, z1, MAT.jati, 0.004);
  decal(m, [-W / 2 + 0.035, y0 + 0.003, 0.035], [W / 2 - 0.035, y0 + 0.003, 0.035], [W / 2 - 0.035, y0 + 0.003, H - 0.035], [-W / 2 + 0.035, y0 + 0.003, H - 0.035], LBL('jadwal_salat'), [0, -1, 0]);
}
// Jejak lumpur kaki telanjang: bidang tipis beralfa 0,5 x 2,0 m (dekal lantai). Arah jalan ke -Y (depan).
export function buildJejakLumpur(m) {
  const W = 0.5, L = 2.0, z = 0.004;
  decal(m, [-W / 2, L / 2, z], [W / 2, L / 2, z], [W / 2, -L / 2, z], [-W / 2, -L / 2, z], LBL('jejak'), [0, 0, 1]);
}

// bentuk putar ber-bahan (profil [[r, z], ...] di sekitar sumbu n melalui c)
function lat(m, c, n, prof, mat, seg = 16) {
  const { ids } = G.lathe(m, c, n, prof, seg, false, mat.c);
  const set = new Set(ids);
  for (const f of m.faces) if (set.has(f.id)) { f.mat = mat.k; f.soft = true; if (m._part) f.part = m._part; }
  return ids;
}

// ============================================================================ PERBAIKAN (tahap 3)
// Kaleng kerupuk: komponen lama memutar gumpalan kerupuk di sekitar titik asal sehingga sebagian jatuh di BAWAH kaleng
// (kaleng tampak melayang 0,24 m). Versi ini membangun kaleng yang sama lalu mengganti gumpalan dengan kerupuk
// yang tersusun di dalam kaleng (dimiringkan di sekitar pusatnya sendiri).
export function buildKalengKerupukRapi(m) {
  buildKalengKerupuk(m);
  m.faces = m.faces.filter((f) => f.mat !== 'kertas');
  const H = 0.45, kr = { c: '#e8d6a8', k: 'kertas' };
  for (let k = 0; k < 9; k++) {
    const x = ((k % 3) - 1) * 0.085, y = ((Math.floor(k / 3) % 3) - 1) * 0.085, z = 0.05 + (k % 4) * 0.085 + (k % 2) * 0.03;
    const tilt = [Math.sin(k * 1.7) * 0.5, Math.cos(k * 2.3) * 0.5, 1];
    lat(m, [x, y, Math.min(z, H - 0.06)], tilt, [[0, 0], [0.062, 0], [0.055, 0.009], [0, 0.011]], kr, 12);
  }
}
// Rak sandal kayu KOSONG (komponen lama selalu berisi 3 sandal → sandal ganda bila sandal cerita ditaruh di rak).
export function buildRakSandalKosong(m) {
  const W = 0.8, D = 0.3, H = 0.6, a = W / 2, b = D / 2, c = MAT.kayu;
  for (const sx of [-1, 1]) rbox(m, sx > 0 ? a - 0.02 : -a, -b, 0, sx > 0 ? a : -a + 0.02, b, H, c, 0.004);
  for (const z of [0.03, 0.29, H - 0.02]) for (let k = 0; k < 4; k++) rbox(m, -a + 0.02, -b + 0.01 + k * 0.072, z, a - 0.02, -b + 0.06 + k * 0.072, z + 0.018, c, 0.003);
  rbox(m, -a + 0.02, b - 0.012, 0.03, a - 0.02, b, H, c, 0.002);
  colBox(m, [-a, -b, 0], [a, b, H]);
}

// ============================================================================ PLAFON MASJID
// Lis plafon berprofil (kayu cat krem + garis emas) 2 m sepanjang X; punggung menempel dinding (y = 0), menjorok ke −Y.
export function buildLisPlafon(m) {
  const a = 1.0, cat = { c: '#efe9d8', k: 'kayu_cat' }, emas = { c: '#b8963e', k: 'logam' };
  rbox(m, -a, -0.012, 0, a, 0, 0.12, cat, 0.002);
  const steps = [[0.012, 0.03, 0.108, 0.12], [0.03, 0.055, 0.09, 0.108], [0.055, 0.075, 0.06, 0.09], [0.075, 0.085, 0.02, 0.06]];
  for (const [y0, y1, z0, z1] of steps) rbox(m, -a, -y1, z0, a, -y0, z1, cat, 0.003);
  rbox(m, -a, -0.03, 0, a, -0.012, 0.025, cat, 0.002);
  rbox(m, -a, -0.088, 0.052, a, -0.084, 0.058, emas, 0.0008);
}
// Ornamen plafon (rosette) Ø 0,9 m: cincin bertingkat, bintang delapan hijau, kancing kuningan. Alas (pivot) di bawah,
// muka atas (z = 0,02) menempel plafon — dipasang dengan dasar 6 cm di bawah plafon.
export function buildOrnamenPlafon(m) {
  const cat = { c: '#f1ecdc', k: 'kayu_cat' }, hijau = { c: '#3f6f55', k: 'kayu_cat' }, emas = { c: '#b8963e', k: 'logam' };
  const top = 0.06;
  lat(m, [0, 0, top], [0, 0, -1], [[0, 0], [0.45, 0], [0.45, 0.012], [0.4, 0.02], [0, 0.02]], cat, 48);
  lat(m, [0, 0, top - 0.02], [0, 0, -1], [[0.3, 0], [0.34, 0], [0.34, 0.01], [0.3, 0.01]], emas, 48);
  lat(m, [0, 0, top - 0.02], [0, 0, -1], [[0, 0], [0.2, 0], [0.18, 0.02], [0.08, 0.035], [0, 0.035]], cat, 40);
  for (const rot of [0, Math.PI / 4]) {
    const R = 0.27, pts = [0, 1, 2, 3].map((i) => { const t = rot + Math.PI / 4 + (i * Math.PI) / 2; return [Math.cos(t) * R, Math.sin(t) * R]; });
    loft(m, [pts.map(([x, y]) => [x, y, top - 0.026]), pts.map(([x, y]) => [x, y, top - 0.02])], hijau);
  }
  lat(m, [0, 0, 0], [0, 0, 1], [[0, 0], [0.035, 0.005], [0.04, 0.025], [0, top - 0.04]], emas, 20);
}
// Lampu gantung masjid: rantai, cawan, lingkar kuningan 6 lengan dengan kap kaca susu + bohlam, bola bawah.
// Alas (pivot) = ujung bawah; puncak (z = tinggi) menempel plafon. Penanda LIGHT di tengah lingkar.
export function buildLampuGantung(m) {
  const kun = MAT.kuningan, susu = { c: '#f4efe2', k: 'kaca' }, bohlam = MAT.neon;
  const H = 1.2, zc = 0.2;
  lat(m, [0, 0, H - 0.03], [0, 0, 1], [[0, 0], [0.07, 0], [0.06, 0.03], [0, 0.03]], kun, 20);
  for (let i = 0; i < 12; i++) {
    const z1 = H - 0.04 - i * 0.065, ang = (i % 2) * Math.PI / 2;
    const d = [Math.cos(ang) * 0.012, Math.sin(ang) * 0.012];
    rod(m, [-d[0], -d[1], z1], [d[0], d[1], z1 - 0.06], 0.004, kun, 6);
  }
  lat(m, [0, 0, zc], [0, 0, 1], [[0, 0], [0.05, 0], [0.09, 0.08], [0.02, 0.12], [0.012, 0.2], [0, 0.2]], kun, 20);
  lat(m, [0, 0, zc - 0.02], [0, 0, 1], [[0.3, 0], [0.32, 0], [0.32, 0.02], [0.3, 0.02]], kun, 40);
  for (let i = 0; i < 6; i++) {
    const t = (i * Math.PI) / 3, x = Math.cos(t) * 0.31, y = Math.sin(t) * 0.31;
    rod(m, [0, 0, zc + 0.03], [x, y, zc - 0.01], 0.008, kun, 8);
    lat(m, [x, y, zc], [0, 0, 1], [[0, 0], [0.025, 0], [0.025, 0.03], [0, 0.03]], kun, 12);
    lat(m, [x, y, zc + 0.04], [0, 0, 1], [[0, 0], [0.018, 0.01], [0.026, 0.04], [0.02, 0.07], [0, 0.075]], bohlam, 12);
    lat(m, [x, y, zc + 0.02], [0, 0, 1], [[0.035, 0], [0.04, 0], [0.075, 0.09], [0.07, 0.095], [0.03, 0.005]], susu, 16);
  }
  lat(m, [0, 0, zc - 0.2], [0, 0, 1], [[0, 0], [0.04, 0.03], [0.05, 0.08], [0.03, 0.11], [0, 0.2]], kun, 16);
  marker(m, 'LIGHT', [0, 0, zc + 0.05], { type: 'bulb', color: '#ffe6b8', energy: 1.5 });
}

// ============================================================================ BALAI DESA & RUMAH PAK RT (game penuh, A8)
function part(m, name, pivot, fn) {
  const prev = m._part;
  m._part = name;
  if (pivot) meta(m).pivots[name] = pivot;
  fn();
  m._part = prev;
}
const front = (m, x, y, z, w, h, mat, uv) => decal(m, [x - w / 2, y, z - h / 2], [x + w / 2, y, z - h / 2], [x + w / 2, y, z + h / 2], [x - w / 2, y, z + h / 2], mat, [0, -1, 0], uv);
const top = (m, x, y, z, w, d, mat, uv) => decal(m, [x - w / 2, y - d / 2, z], [x + w / 2, y - d / 2, z], [x + w / 2, y + d / 2, z], [x - w / 2, y + d / 2, z], mat, [0, 0, 1], uv);
const NANGKA = { c: '#8a5a2c', k: 'kayu' };
const IJUK = { c: '#2a221c', k: 'kain' };

// Kentongan besar balai desa: batang kayu nangka (Ø 0,34 m, panjang 1,25 m) tergantung pada gawangan kayu (dua tiang,
// palang, kaki & penyangga), pemukul tergantung. Alas (pivot) di tanah, depan −Y. INTERACT = bawah kentongan
// (tempat kunci balai disembunyikan), AUDIO = badan kentongan.
export function buildKentonganBesar(m) {
  const H = 2.25, a = 0.62, k = { c: '#5a3d24', k: 'kayu' };
  for (const sx of [-1, 1]) {
    rbox(m, sx * a - 0.05, -0.05, 0, sx * a + 0.05, 0.05, H, k, 0.008);
    rbox(m, sx * a - 0.06, -0.32, 0, sx * a + 0.06, 0.32, 0.08, k, 0.008);
    for (const sy of [-1, 1]) rod(m, [sx * a, sy * 0.28, 0.08], [sx * a, sy * 0.04, 0.55], 0.022, k, 6);
  }
  rbox(m, -a - 0.12, -0.06, H - 0.02, a + 0.12, 0.06, H + 0.1, k, 0.01);
  for (const sx of [-0.42, 0.42]) rod(m, [sx, 0, H - 0.02], [sx * 0.95, 0, 1.6], 0.012, IJUK, 6);
  const zc = 1.42, R = 0.17, L = 1.25;
  lat(m, [-L / 2, 0, zc], [1, 0, 0], [[0, 0], [R * 0.9, 0], [R, 0.04], [R, L - 0.04], [R * 0.9, L], [0, L]], NANGKA, 20);
  rbox(m, -L / 2 + 0.16, -R - 0.006, zc - 0.03, L / 2 - 0.16, -R + 0.03, zc + 0.03, { c: '#1e140c', k: 'kayu' }, 0.004);
  for (const x of [-L / 2 + 0.05, L / 2 - 0.09]) lat(m, [x, 0, zc], [1, 0, 0], [[R * 1.0, 0], [R * 1.04, 0], [R * 1.04, 0.04], [R * 1.0, 0.04]], MAT.besiHitam, 20);
  rod(m, [a - 0.14, -0.1, 0.9], [a - 0.14, -0.1, 1.38], 0.03, k, 8);
  rod(m, [a - 0.14, -0.1, 1.38], [a - 0.06, -0.05, 1.62], 0.004, IJUK, 5);
  marker(m, 'INTERACT', [0, -0.35, 0.4]);
  marker(m, 'AUDIO', [0, -0.1, zc]);
  colBox(m, [-a - 0.07, -0.33, 0], [a + 0.07, 0.33, H + 0.1]);
}
// HT linmas di dudukan charger: dudukan hitam + HT (badan hijau gelap, antena karet, layar kanal, tombol).
export function buildHtLinmas(m) {
  const hijau = { c: '#2f3a30', k: 'plastik' };
  rbox(m, -0.05, -0.05, 0, 0.05, 0.05, 0.035, MAT.plHitam, 0.008);
  top(m, 0.03, -0.035, 0.0352, 0.012, 0.006, { c: '#33ff66', k: 'neon' });
  rbox(m, -0.031, -0.02, 0.03, 0.031, 0.02, 0.16, hijau, 0.008);
  rbox(m, -0.025, -0.0215, 0.115, 0.025, -0.02, 0.15, { c: '#9fb8a0', k: 'kaca' }, 0.002);
  for (let i = 0; i < 9; i++) rbox(m, -0.022 + (i % 3) * 0.016, -0.0215, 0.05 + Math.floor(i / 3) * 0.018, -0.012 + (i % 3) * 0.016, -0.019, 0.062 + Math.floor(i / 3) * 0.018, MAT.plHitam, 0.001);
  rod(m, [0.016, 0.004, 0.16], [0.016, 0.004, 0.32], 0.0065, MAT.plHitam, 8, 0.004);
  lat(m, [-0.014, 0.004, 0.16], [0, 0, 1], [[0, 0], [0.008, 0], [0.008, 0.02], [0, 0.022]], MAT.plHitam, 10);
  marker(m, 'INTERACT', [0, -0.12, 0.12]);
}
// Papan pengumuman balai (dinding): bingkai kayu, papan gabus dengan kertas tulisan tangan (bagian TEXT), kaca, judul.
export function buildPapanPengumuman(m) {
  const W = 1.2, H = 0.85, T = 0.04;
  rbox(m, -W / 2, -T + 0.006, 0, W / 2, 0, H, { c: '#a77b4f', k: 'kardus' }, 0.003);
  for (const [x0, z0, x1, z1] of [[-W / 2, 0, W / 2, 0.05], [-W / 2, H - 0.05, W / 2, H], [-W / 2, 0, -W / 2 + 0.05, H], [W / 2 - 0.05, 0, W / 2, H]]) rbox(m, x0, -T, z0, x1, 0, z1, MAT.jati, 0.005);
  part(m, 'TEXT', null, () => front(m, 0, -T + 0.004, H / 2, W - 0.12, H - 0.12, LBL('pengumuman_balai')));
  rbox(m, -0.35, -T - 0.012, H, 0.35, -0.002, H + 0.12, MAT.jati, 0.004);
  front(m, 0, -T - 0.0125, H + 0.06, 0.66, 0.1, LBL('papan_judul_balai'));
  marker(m, 'INTERACT', [0, -0.35, H / 2]);
}
// Peta desa tempel (dinding): kertas besar bertongkat kayu atas & bawah, dipaku kuningan.
export function buildPetaDesa(m) {
  const W = 1.0, H = 0.72;
  rbox(m, -W / 2, -0.004, 0, W / 2, 0, H, MAT.kertas, 0.001);
  front(m, 0, -0.0045, H / 2, W - 0.01, H - 0.04, LBL('peta_desa'));
  for (const z of [0.02, H - 0.02]) rod(m, [-W / 2 - 0.02, -0.014, z], [W / 2 + 0.02, -0.014, z], 0.012, MAT.jati, 8);
}
// Lemari arsip besi 4 laci (abu kehijauan), pegangan krom & label laci; laci teratas terbuka berisi map (LACI).
export function buildLemariArsip(m) {
  const W = 0.47, D = 0.62, H = 1.32, a = W / 2, b = D / 2, cat = { c: '#7d8a80', k: 'logam_cat' };
  rbox(m, -a, -b + 0.02, 0, a, b, H, cat, 0.01);
  for (let i = 0; i < 4; i++) {
    const z0 = 0.05 + i * 0.315, z1 = z0 + 0.29;
    const open = i === 3 ? 0.12 : 0;
    const draw = () => {
      rbox(m, -a + 0.012, -b - open, z0, a - 0.012, -b + 0.022 - open, z1, cat, 0.006);
      rod(m, [-0.07, -b - 0.015 - open, z1 - 0.07], [0.07, -b - 0.015 - open, z1 - 0.07], 0.007, MAT.krom, 6);
      front(m, 0, -b - 0.0005 - open, z1 - 0.12, 0.09, 0.035, LBL('label_laci'));
      if (open) for (let k = 0; k < 6; k++) rbox(m, -a + 0.04, -b - open + 0.04 + k * 0.035, z0 + 0.02, a - 0.04, -b - open + 0.055 + k * 0.035, z1 - 0.02, { c: '#d8c79a', k: 'kardus' }, 0.002);
    };
    if (open) part(m, 'LACI', null, draw); else draw();
  }
  marker(m, 'INTERACT', [0, -0.6, 1.1]);
  colBox(m, [-a, -b - 0.02, 0], [a, b, H]);
}
// Kursi lipat besi (rangka tabung hitam, dudukan & sandaran pelat bercat). Varian warna lewat manifest.
export function buildKursiLipat(m) {
  const cat = { c: '#58606a', k: 'logam_cat' }, rangka = MAT.besiHitam, Hs = 0.45;
  for (const sx of [-1, 1]) {
    rod(m, [sx * 0.2, -0.2, 0], [sx * 0.2, 0.17, 0.9], 0.011, rangka, 8);
    rod(m, [sx * 0.19, 0.2, 0], [sx * 0.19, -0.16, Hs], 0.011, rangka, 8);
  }
  rod(m, [-0.2, -0.2, 0.02], [0.2, -0.2, 0.02], 0.009, rangka, 6);
  rod(m, [-0.19, 0.2, 0.02], [0.19, 0.2, 0.02], 0.009, rangka, 6);
  rbox(m, -0.21, -0.2, Hs - 0.02, 0.21, 0.18, Hs + 0.01, cat, 0.012);
  rbox(m, -0.2, 0.1, 0.62, 0.2, 0.125, 0.84, cat, 0.008);
  colBox(m, [-0.22, -0.22, 0], [0.22, 0.22, 0.9]);
}
// Mesin ketik tua (hitam, tombol bulat krem, gulungan dengan lembar ketikan laporan).
export function buildMesinKetik(m) {
  const k = MAT.besiHitam;
  rbox(m, -0.2, -0.17, 0, 0.2, 0.17, 0.07, k, 0.015);
  rbox(m, -0.18, -0.05, 0.07, 0.18, 0.15, 0.13, k, 0.015);
  rod(m, [-0.24, 0.1, 0.15], [0.24, 0.1, 0.15], 0.022, MAT.karet, 14);
  for (const x of [-0.25, 0.25]) lat(m, [x, 0.1, 0.15], [1, 0, 0], [[0, 0], [0.03, 0], [0.03, 0.012], [0, 0.012]], MAT.krom, 12);
  decal(m, [-0.12, 0.09, 0.17], [0.12, 0.09, 0.17], [0.12, 0.14, 0.33], [-0.12, 0.14, 0.33], LBL('laporan_1998'), [0, -0.95, 0.3]);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) lat(m, [-0.15 + c * 0.033 + (r % 2) * 0.012, -0.14 + r * 0.03, 0.07], [0, 0, 1], [[0, 0], [0.011, 0], [0.011, 0.012], [0, 0.014]], MAT.plKrem, 8);
  colBox(m, [-0.2, -0.17, 0], [0.2, 0.17, 0.13]);
}
// Tumpukan map arsip berdebu (map karton bertali, sedikit bergeser satu sama lain); lembar laporan di atas.
export function buildMapArsip(m) {
  const cols = ['#c9a86a', '#7a8a5a', '#b0603a', '#c9a86a', '#8a7a5a'];
  let z = 0;
  for (let i = 0; i < 5; i++) {
    const h = 0.018 + (i % 2) * 0.008;
    const x0 = -0.17 + Math.sin(i * 1.7) * 0.01, y0 = -0.12 + Math.cos(i * 2.1) * 0.01;
    rbox(m, x0, y0, z, x0 + 0.34, y0 + 0.24, z + h, { c: cols[i], k: 'kardus' }, 0.002);
    rod(m, [x0 + 0.17, y0 - 0.002, z + h * 0.5], [x0 + 0.17, y0 + 0.242, z + h * 0.5], 0.0025, { c: '#e8e2d0', k: 'kain' }, 5);
    z += h;
  }
  top(m, 0, 0, z + 0.0005, 0.21, 0.297, LBL('laporan_1998'));
}
// Genset kecil (rangka pipa, tangki merah, mesin, peredam). AUDIO = mesin.
export function buildGenset(m) {
  const r = MAT.besiHitam, merah = { c: '#a52a22', k: 'logam_cat' };
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) rod(m, [sx * 0.28, sy * 0.2, 0], [sx * 0.28, sy * 0.2, 0.5], 0.012, r, 8);
  for (const z of [0.02, 0.5]) for (const sy of [-1, 1]) rod(m, [-0.28, sy * 0.2, z], [0.28, sy * 0.2, z], 0.012, r, 8);
  rbox(m, -0.22, -0.16, 0.38, 0.22, 0.16, 0.5, merah, 0.03);
  lat(m, [0.1, 0, 0.5], [0, 0, 1], [[0, 0], [0.035, 0], [0.035, 0.025], [0, 0.03]], r, 12);
  rbox(m, -0.2, -0.14, 0.06, 0.12, 0.14, 0.36, { c: '#3a3d40', k: 'logam' }, 0.02);
  lat(m, [0.16, 0, 0.2], [1, 0, 0], [[0, 0], [0.09, 0], [0.09, 0.05], [0, 0.05]], { c: '#5a5d60', k: 'logam' }, 16);
  rod(m, [-0.21, 0.1, 0.25], [-0.3, 0.1, 0.25], 0.02, MAT.logam, 8);
  marker(m, 'AUDIO', [0, 0, 0.3]);
  colBox(m, [-0.3, -0.22, 0], [0.3, 0.22, 0.55]);
}
// Tiang bendera besi bercat + bendera merah putih kecil terlilit di tiang, alas beton.
export function buildTiangBendera(m) {
  lat(m, [0, 0, 0], [0, 0, 1], [[0, 0], [0.22, 0], [0.22, 0.12], [0.16, 0.18], [0, 0.18]], { c: '#9a958a', k: 'tanah' }, 16);
  rod(m, [0, 0, 0.18], [0, 0, 5.2], 0.03, { c: '#d8d8d0', k: 'logam_cat' }, 10, 0.02);
  lat(m, [0, 0, 5.2], [0, 0, 1], [[0, 0], [0.045, 0], [0.04, 0.05], [0, 0.07]], MAT.kuningan, 10);
  for (let i = 0; i < 2; i++) rbox(m, 0.03, -0.004, 4.1 + i * 0.22, 0.42, 0.004, 4.32 + i * 0.22, { c: i === 1 ? '#b8302a' : '#eeeae0', k: 'kain' }, 0.002);
  rod(m, [0.035, 0, 0.18], [0.035, 0, 5.15], 0.003, { c: '#e8e2d0', k: 'kain' }, 4);
  colBox(m, [-0.22, -0.22, 0], [0.22, 0.22, 5.2]);
}
// Lampu darurat dinding (kotak putih, dua lampu sorot kecil BULB, indikator merah). Punggung di dinding.
export function buildLampuDarurat(m) {
  rbox(m, -0.15, -0.08, 0, 0.15, 0, 0.12, MAT.plPutih, 0.01);
  front(m, 0, -0.0805, 0.04, 0.12, 0.03, { c: '#ff4422', k: 'neon' });
  for (const sx of [-1, 1]) {
    lat(m, [sx * 0.1, -0.06, 0.12], [sx * 0.5, -0.6, 0.6], [[0, 0], [0.035, 0], [0.04, 0.05], [0, 0.05]], MAT.plPutih, 12);
    part(m, 'BULB', null, () => lat(m, [sx * 0.125, -0.09, 0.15], [sx * 0.5, -0.6, 0.6], [[0, 0], [0.032, 0], [0, 0.006]], MAT.neon, 12));
  }
  marker(m, 'LIGHT', [0, -0.2, 0.18], { type: 'bulb', color: '#fff2d8', energy: 1.2 });
}
// Papan nama balai desa (dua tiang besi, papan hijau berlabel).
export function buildPapanNamaBalai(m) {
  for (const sx of [-1, 1]) rod(m, [sx * 0.8, 0, 0], [sx * 0.8, 0, 1.9], 0.03, { c: '#3a4a3a', k: 'logam_cat' }, 10);
  rbox(m, -0.95, -0.02, 1.2, 0.95, 0.02, 1.95, { c: '#2f5a3a', k: 'logam_cat' }, 0.01);
  front(m, 0, -0.021, 1.575, 1.84, 0.69, LBL('papan_balai'));
  colBox(m, [-0.95, -0.05, 0], [0.95, 0.05, 1.95]);
}
// Stempel kayu + bantalan tinta.
export function buildStempel(m) {
  rbox(m, -0.06, -0.045, 0, 0.06, 0.045, 0.018, MAT.besiHitam, 0.004);
  top(m, 0, 0, 0.0185, 0.1, 0.075, { c: '#3a2a6a', k: 'kain' });
  lat(m, [0.12, 0, 0], [0, 0, 1], [[0, 0], [0.025, 0], [0.025, 0.02], [0.012, 0.03], [0.012, 0.08], [0.02, 0.095], [0, 0.1]], MAT.jati, 12);
}

const R = (key, name, icon, build) => { LIBRARY[key] = { name, icon, grp: 'interior', build }; };
R('pb_buku_utang', 'Buku utang warung (terbuka)', '📒', (m) => buildBukuUtang(m));
R('pb_korek_api', 'Korek api kotak', '🔥', (m) => buildKorekApi(m));
R('pb_lilin', 'Lilin batang (isi 10)', '🕯️', (m) => buildLilin(m));
R('pb_kotak_amal', 'Kotak amal masjid', '🗳️', (m) => buildKotakAmal(m));
R('pb_jadwal_salat', 'Papan jadwal waktu salat', '🕌', (m) => buildJadwalSalat(m));
R('pb_jejak_lumpur', 'Jejak kaki berlumpur (dekal)', '👣', (m) => buildJejakLumpur(m));
R('pb_kaleng_kerupuk', 'Kaleng kerupuk (rapi)', '🍘', (m) => buildKalengKerupukRapi(m));
R('pb_rak_sandal_kosong', 'Rak sandal kayu (kosong)', '🩴', (m) => buildRakSandalKosong(m));
R('pb_lis_plafon', 'Lis plafon profil 2 m', '➖', (m) => buildLisPlafon(m));
R('pb_ornamen_plafon', 'Ornamen plafon (rosette)', '✴', (m) => buildOrnamenPlafon(m));
R('pb_lampu_gantung', 'Lampu gantung masjid', '💡', (m) => buildLampuGantung(m));
R('pb_kentongan_besar', 'Kentongan besar balai (gawangan)', '🪵', (m) => buildKentonganBesar(m));
R('pb_ht_linmas', 'HT linmas di charger', '📻', (m) => buildHtLinmas(m));
R('pb_papan_pengumuman', 'Papan pengumuman balai', '📌', (m) => buildPapanPengumuman(m));
R('pb_peta_desa', 'Peta desa tempel', '🗺', (m) => buildPetaDesa(m));
R('pb_lemari_arsip', 'Lemari arsip besi 4 laci', '🗄', (m) => buildLemariArsip(m));
R('pb_kursi_lipat', 'Kursi lipat besi', '🪑', (m) => buildKursiLipat(m));
R('pb_mesin_ketik', 'Mesin ketik tua', '⌨', (m) => buildMesinKetik(m));
R('pb_map_arsip', 'Tumpukan map arsip', '📁', (m) => buildMapArsip(m));
R('pb_genset', 'Genset kecil', '⚙', (m) => buildGenset(m));
R('pb_tiang_bendera', 'Tiang bendera', '🚩', (m) => buildTiangBendera(m));
R('pb_lampu_darurat', 'Lampu darurat dinding', '🔦', (m) => buildLampuDarurat(m));
R('pb_papan_nama_balai', 'Papan nama balai desa', '🪧', (m) => buildPapanNamaBalai(m));
R('pb_stempel', 'Stempel & bantalan tinta', '🔖', (m) => buildStempel(m));
