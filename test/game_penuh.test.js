// Komponen game penuh (game_penuh_nusantara.js): semua terdaftar di grup 'game_penuh', terbangun tanpa NaN,
// berbahan semantik (f.mat), ukuran masuk akal; nisan >= 8 bentuk; papan & nisan punya bidang TEXT; roda pintu air terpisah.
import { LIBRARY, libraryModel } from '../library.js';
import { GAME_PENUH_KEYS } from '../game_penuh_nusantara.js';
let fail = 0;
const check = (label, ok) => { console.log((ok ? 'OK   ' : 'FAIL ') + label); if (!ok) fail++; };
const keys = Object.keys(LIBRARY).filter((k) => LIBRARY[k].grp === 'game_penuh');
check(`${keys.length} komponen game_penuh di pustaka`, keys.length === GAME_PENUH_KEYS.length && keys.length >= 15);
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
    m.faces.length >= 8 && !bad && noMat === 0 && Math.abs(z0) < 0.01 && x1 - x0 < 4 && y1 - y0 < 4 && z1 - z0 < 3);
}
check('nisan >= 8 bentuk', keys.filter((k) => k.startsWith('gp_nisan') || k === 'gp_kijing').length >= 8);
check('papan pengumuman punya bidang TEXT', libraryModel('gp_papan_pengumuman').faces.some((f) => f.part === 'TEXT'));
check('nisan bertulisan punya bidang TEXT', libraryModel('gp_nisan_tulisan').faces.some((f) => f.part === 'TEXT'));
check('roda pintu air terpisah (RODA)', libraryModel('gp_roda_pintu_air').faces.some((f) => f.part === 'RODA'));
console.log(fail ? `GAGAL ${fail}` : 'SEMUA OK');
process.exit(fail ? 1 : 0);
