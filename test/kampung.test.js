// Komponen kampung (kampung.js): semua terdaftar di pustaka grup 'kampung', terbangun tanpa error/NaN, berbahan semantik
// (f.mat), ukuran masuk akal, dinding modular tepat 1/1,5/2 m x 3 m dengan as di y = 0.
import { LIBRARY, libraryModel } from '../library.js';
import { KAMPUNG_KEYS, RUMAH } from '../kampung.js';
let fail = 0;
const check = (label, ok) => { console.log((ok ? 'OK   ' : 'FAIL ') + label); if (!ok) fail++; };
const keys = Object.keys(LIBRARY).filter((k) => LIBRARY[k].grp === 'kampung');
check(`${keys.length} komponen kampung di pustaka`, keys.length === KAMPUNG_KEYS.length && keys.length >= 50);
const ext = (m) => {
  const P = m.faces.flatMap((f) => f.pts);
  const r = (j) => [P.reduce((t, p) => Math.min(t, p[j]), 1e9), P.reduce((t, p) => Math.max(t, p[j]), -1e9)];
  return [r(0), r(1), r(2)];
};
for (const k of keys) {
  const m = libraryModel(k);
  const bad = m.faces.some((f) => f.pts.some((p) => p.some((v) => !Number.isFinite(v))));
  const noMat = m.faces.filter((f) => !f.mat).length;
  const [[x0, x1], [y0, y1], [z0, z1]] = ext(m);
  check(`${LIBRARY[k].name}: ${m.faces.length} bidang, ${(x1 - x0).toFixed(2)} x ${(y1 - y0).toFixed(2)} x ${(z1 - z0).toFixed(2)} m`,
    m.faces.length >= 5 && !bad && noMat === 0 && x1 - x0 < 12 && y1 - y0 < 15 && z1 - z0 < 14);
}
for (const [k, L] of [['km_dinding_a_2m', 2], ['km_dinding_b_2m', 2], ['km_dinding_c_1m', 1], ['km_jendela_a', 2], ['km_pintu_b', 1.5]]) {
  const m = libraryModel(k);
  const [[x0, x1], , [z0, z1]] = ext(m);
  // dinding memanjang ke -X SketchClone (= +X di Godot) dari 0 sampai -L; bidang plester punya tinggi H
  check(`${k}: panjang ${L} m, tinggi ${RUMAH.H} m`, Math.abs(x1) < 0.03 && Math.abs(x0 + L) < 0.03 && Math.abs(z0) < 1e-6 && Math.abs(z1 - RUMAH.H) < 0.02);
}
const jen = libraryModel('km_jendela_a');
check('jendela punya kaca terpisah (KACA_JENDELA)', jen.faces.some((f) => f.part === 'KACA_JENDELA' && f.mat === 'kaca'));
const atap = libraryModel('km_atap_miring');
check('atap genteng bergelombang (banyak bidang genteng halus)', atap.faces.filter((f) => f.mat === 'genteng' && f.soft).length > 2000);
console.log(fail ? `GAGAL ${fail}` : 'SEMUA OK');
process.exit(fail ? 1 : 0);
