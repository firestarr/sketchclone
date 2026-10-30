// Properti area publik kampung (publik_nusantara.js, grup 'interior'): buku utang, korek api, lilin, kotak amal,
// papan jadwal salat, dekal jejak lumpur — dibuat untuk game "Malam Jumat di Kampung Mati".
import { LIBRARY, libraryModel } from '../library.js';
import '../interior_nusantara.js';
import '../publik_nusantara.js';
let fail = 0;
const check = (label, ok) => { console.log((ok ? 'OK   ' : 'FAIL ') + label); if (!ok) fail++; };
const keys = ['pb_buku_utang', 'pb_korek_api', 'pb_lilin', 'pb_kotak_amal', 'pb_jadwal_salat', 'pb_jejak_lumpur', 'pb_kaleng_kerupuk', 'pb_rak_sandal_kosong', 'pb_lis_plafon', 'pb_ornamen_plafon', 'pb_lampu_gantung'];
check('11 komponen publik terdaftar di grup interior', keys.every((k) => LIBRARY[k] && LIBRARY[k].grp === 'interior'));
for (const k of keys) {
  const m = libraryModel(k);
  check(`${k}: terbangun tanpa NaN`, m.faces.length > 0 && m.faces.every((f) => f.pts.every((p) => p.every(Number.isFinite))));
  check(`${k}: semua bidang punya jenis bahan`, m.faces.every((f) => typeof f.mat === 'string'));
}
check('buku utang berlabel ber-UV', libraryModel('pb_buku_utang').faces.some((f) => f.mat === 'label_buku_utang' && f.uv));
check('kotak amal punya kotak tabrakan', libraryModel('pb_kotak_amal')._meta.cols.length === 1);
const zmin = (k) => Math.min(...libraryModel(k).faces.flatMap((f) => f.pts.map((p) => p[2])));
check('kaleng kerupuk rapi: tidak ada bagian di bawah alas', zmin('pb_kaleng_kerupuk') > -0.001);
check('rak sandal kosong: hanya kayu (tanpa sandal)', libraryModel('pb_rak_sandal_kosong').faces.every((f) => f.mat === 'kayu'));
check('lampu gantung punya penanda LIGHT', libraryModel('pb_lampu_gantung')._meta.markers.some((mk) => mk.name === 'LIGHT'));
process.exit(fail ? 1 : 0);
