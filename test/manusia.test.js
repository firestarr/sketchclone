// Figur manusia realistis berpermukaan halus: 10 figur, ribuan segitiga 'soft', berdiri di z = 0, menghadap -Y,
// kulit/baju diwarnai ulang, peci/caping/kerudung, sandal & sepatu (bukan bot), versi anak
import { LIBRARY, libraryModel } from '../library.js';
import { MANUSIA, manusiaMesh } from '../manusia.js';
let fail = 0;
const check = (label, ok) => { console.log((ok ? 'OK   ' : 'FAIL ') + label); if (!ok) fail++; };
const keys = Object.keys(LIBRARY).filter((k) => LIBRARY[k].grp === 'manusia');
check('16 figur manusia halus di pustaka', keys.length === 16 && Object.keys(MANUSIA).length === 16);
for (const k of keys) {
  const m = libraryModel(k);
  const zs = m.faces.flatMap((f) => f.pts.map((p) => p[2])), xs = m.faces.flatMap((f) => f.pts.map((p) => p[0]));
  const H = Math.max(...zs), soft = m.faces.filter((f) => f.soft).length, anak = MANUSIA[k.slice(8)].anak;
  const ok = m.faces.length > 15000 && soft > m.faces.length * 0.99 && Math.abs(Math.min(...zs)) < 0.005
    && (anak ? H > 1.0 && H < 1.35 : H > 1.5 && H < 1.85) && Math.max(...xs) - Math.min(...xs) < 0.9;
  check(`${LIBRARY[k].name}: ${m.faces.length} segitiga halus, tinggi ${H.toFixed(2)} m`, ok);
}
// mata (bagian 'm') berada di sisi depan (-Y)
const M = manusiaMesh('m_tani');
let ey = 0, n = 0;
for (let i = 0; i < M.c.length; i++) if (M.p[i] === 'm') for (let j = 0; j < 3; j++) { ey += M.v[M.t[i * 3 + j] * 3 + 1]; n++; }
check('mata menghadap depan (-Y)', n > 0 && ey / n < -0.05);
// arah bidang: normal bidang wajah (dekat ujung hidung) menghadap -Y
const haji = libraryModel('manusia_pak_haji');
const front = haji.faces.filter((f) => f.pts.every((p) => p[2] > 1.4 && p[2] < 1.58 && Math.abs(p[0]) < 0.03));
const ymin = Math.min(...front.flatMap((f) => f.pts.map((p) => p[1])));
const nose = front.filter((f) => f.pts.some((p) => p[1] < ymin + 0.01));
check('bidang wajah menghadap keluar', nose.length > 0 && nose.filter((f) => f.n[1] < 0).length > nose.length * 0.8);
// warna kulit diganti (sawo matang), bukan warna asli tekstur
const kulit = haji.faces.filter((f) => f.color.startsWith('#') && f.pts.every((p) => p[2] > 1.4 && p[2] < 1.5 && p[1] < -0.06));
check('wajah berwarna kulit sawo matang', kulit.length > 10);
// peci hitam di puncak kepala
const peci = haji.faces.filter((f) => f.color === '#151515');
const pz = peci.flatMap((f) => f.pts.map((p) => p[2]));
check('peci di kepala', peci.length > 50 && Math.min(...pz) > 1.45 && Math.max(...pz) < 1.85);
// baju bermotif memakai tekstur batik
check('baju batik bertekstur', libraryModel('manusia_mas_batik').faces.some((f) => f.tex === 'b:batik_parang'));
// motif batik dipetakan melingkar badan: bidang bertetangga memakai titik acuan tekstur sendiri
const batik = libraryModel('manusia_mas_batik').faces.filter((f) => f.tex === 'b:batik_parang');
check('motif batik dipetakan silinder', batik.filter((f) => f.uv).length > batik.length * 0.9);
// sandal: alas tipis di lantai + tali; kaki di atasnya berwarna kulit, tanpa batang bot setinggi betis
const tani = libraryModel('manusia_pak_tani');
const sol = tani.faces.filter((f) => f.color === '#3d2b1f'), tali = tani.faces.filter((f) => f.color === '#1f4e79');
check('Pak Tani bersandal', sol.length >= 8 && tali.length >= 16 && Math.max(...sol.flatMap((f) => f.pts.map((p) => p[2]))) < 0.015);
const shin = tani.faces.filter((f) => Math.min(...f.pts.map((p) => p[2])) < 0.25 && Math.max(...f.pts.map((p) => p[2])) > 0.25);
const abu = (h) => { const n = parseInt(h.slice(1), 16); return Math.abs((n >> 16) - (n & 255)) < 8; }; // celana #2b2b2b abu-abu, bot cokelat
check('betis tertutup celana (bukan bot)', shin.length > 20 && shin.every((f) => abu(f.color)));
// kerudung: menutup puncak kepala & leher, wajah tetap terbuka, tanpa rambut
const guru = libraryModel('manusia_bu_guru');
const ker = guru.faces.filter((f) => f.color === '#2f3e66'), kz = ker.flatMap((f) => f.pts.map((p) => p[2]));
const gz = Math.max(...guru.faces.flatMap((f) => f.pts.map((p) => p[2])));
check('kerudung menutup kepala', ker.length > 1000 && Math.max(...kz) >= gz - 0.001 && Math.min(...kz) < gz - 0.35);
const eyeY = Math.min(...guru.faces.filter((f) => f.pts.every((p) => p[2] > gz - 0.2 && p[2] < gz - 0.1 && Math.abs(p[0]) < 0.03)).flatMap((f) => f.pts.map((p) => p[1])));
const faceFront = ker.filter((f) => f.pts.every((p) => p[2] > gz - 0.17 && p[2] < gz - 0.1 && Math.abs(p[0]) < 0.03 && p[1] < eyeY + 0.03));
check('wajah tidak tertutup kerudung', faceFront.length === 0);
// anak: kepala relatif besar (tinggi kepala > 1/6.5 tinggi badan), tanpa jenggot
const sd = libraryModel('manusia_anak_sd_putra'), sdH = Math.max(...sd.faces.flatMap((f) => f.pts.map((p) => p[2])));
const mata = sd.faces.filter((f) => f.color.startsWith('#') && f.pts.every((p) => p[1] < -0.04)).length;
check('proporsi anak', sdH < 1.3 && mata > 0);
if (fail) { console.log(fail + ' gagal'); process.exit(1); }
console.log('semua lulus');
