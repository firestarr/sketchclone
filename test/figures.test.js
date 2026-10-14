// Figur warga Nusantara di pustaka: 20 figur (6 anak), ukuran wajar, berdiri di z = 0, menghadap -Y
import { LIBRARY, FIGURES, libraryModel } from '../library.js';
let fail = 0;
const check = (label, ok) => { console.log((ok ? 'OK   ' : 'FAIL ') + label); if (!ok) fail++; };
const keys = Object.keys(LIBRARY).filter((k) => LIBRARY[k].grp === 'warga');
check('20 figur warga', keys.length === 20 && Object.keys(FIGURES).length === 20);
check('6 figur anak', Object.values(FIGURES).filter((s) => s.kid).length === 6);
for (const k of keys) {
  const m = libraryModel(k);
  const zs = m.faces.flatMap((f) => f.pts.map((p) => p[2])), xs = m.faces.flatMap((f) => f.pts.map((p) => p[0]));
  const ys = m.faces.flatMap((f) => f.pts.map((p) => p[1]));
  const H = Math.max(...zs), kid = FIGURES[k.slice(6)].kid;
  const ok = m.faces.length > 40 && Math.abs(Math.min(...zs)) < 0.005 && (kid ? H > 0.9 && H < 1.35 : H > 1.45 && H < 1.95)
    && Math.max(...xs) - Math.min(...xs) < 0.8 && Math.max(...ys) - Math.min(...ys) < 0.6;
  check(`${LIBRARY[k].name}: ${m.faces.length} bidang, tinggi ${H.toFixed(2)} m`, ok);
}
// wajah (mata) ada di sisi depan (-Y)
const m = libraryModel('warga_joko');
const eyes = m.faces.filter((f) => f.color === '#2a1a12');
check('mata menghadap depan (-Y)', eyes.length > 0 && eyes.every((f) => f.pts.every((p) => p[1] < 0)));
if (fail) { console.log(fail + ' gagal'); process.exit(1); }
console.log('semua lulus');
