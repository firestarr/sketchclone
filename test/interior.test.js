// Interior & properti rumah kampung Indonesia (interior_nusantara.js, grup 'interior')
import { LIBRARY, libraryModel } from '../library.js';
import '../interior_nusantara.js';
import * as G from '../geometry.js';
let fail = 0;
const check = (label, ok) => { console.log((ok ? 'OK   ' : 'FAIL ') + label); if (!ok) fail++; };
const keys = Object.keys(LIBRARY).filter((k) => LIBRARY[k].grp === 'interior');
check(`grup interior berisi >= 90 komponen (${keys.length})`, keys.length >= 90);
const bb = (m) => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const f of m.faces) for (const p of f.pts) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p[a]); hi[a] = Math.max(hi[a], p[a]); } return { lo, hi }; };
let bad = [];
for (const k of keys) {
  const m = libraryModel(k);
  if (!m.faces.length || m.faces.some((f) => f.pts.some((p) => p.some((v) => !Number.isFinite(v))))) bad.push(k);
}
check('semua komponen interior terbangun tanpa NaN/kosong', bad.length === 0);
const dud = (k) => { const m = libraryModel(k); return Math.max(...m.faces.filter((f) => f.n[2] > 0.9 && Math.abs(f.pts.reduce((s, p) => s + p[1], 0) / f.pts.length) < 0.12 && Math.abs(f.pts.reduce((s, p) => s + p[0], 0) / f.pts.length) < 0.15).flatMap((f) => f.pts.map((p) => p[2])).filter((z) => z < 0.6)); };
check('dudukan kursi kayu ±0,45 m', Math.abs(dud('in_kursi_kayu') - 0.45) < 0.02);
check('dudukan kursi plastik ±0,45 m', Math.abs(dud('in_kursi_plastik') - 0.45) < 0.03);
check('meja makan setinggi 0,75 m', Math.abs(bb(libraryModel('in_meja_makan')).hi[2] - 0.75) < 0.01);
const lem = libraryModel('in_lemari_pakaian');
check('lemari punya pintu terpisah DOOR_L/DOOR_R + engsel', lem.faces.some((f) => f.part === 'DOOR_L') && lem.faces.some((f) => f.part === 'DOOR_R') && lem._meta.pivots.DOOR_L);
check('lemari cukup untuk bersembunyi (dalam >= 1,8 m tinggi, >= 0,6 m dalam)', lem._meta.markers.some((m) => m.name === 'HIDE_SPOT') && bb(lem).hi[2] - 0.2 >= 1.8 && bb(lem).hi[1] - bb(lem).lo[1] >= 0.65);
check('TV tabung punya layar SCREEN ber-UV', libraryModel('in_tv_tabung').faces.some((f) => f.part === 'SCREEN' && f.uv));
check('kipas berdiri & plafon punya bilah BLADES', ['in_kipas_berdiri', 'in_kipas_plafon'].every((k) => libraryModel(k).faces.some((f) => f.part === 'BLADES')));
check('radio & kentongan punya titik INTERACT', ['in_radio', 'in_kentongan'].every((k) => libraryModel(k)._meta.markers.some((m) => m.name === 'INTERACT')));
check('lampu neon emisif + penanda LIGHT', libraryModel('in_lampu_neon').faces.some((f) => f.mat === 'neon') && libraryModel('in_lampu_neon')._meta.markers.some((m) => m.name === 'LIGHT'));
check('jadwal ronda punya bidang TEXT terpisah', libraryModel('in_papan_jadwal').faces.some((f) => f.part === 'TEXT'));
check('sandal kiri & kanan terpisah (cermin)', bb(libraryModel('in_sandal_kiri')).hi[0] !== bb(libraryModel('in_sandal_kanan')).hi[0]);
check('semua bidang interior punya jenis bahan', keys.every((k) => libraryModel(k).faces.every((f) => typeof f.mat === 'string')));
// ekspor OBJ tetap jalan untuk komponen interior
const r = G.exportOBJMtl(libraryModel('in_dipan'), { mtlName: 'x.mtl' });
check('ekspor OBJ dipan memuat bahan', r.materials.length > 3 && r.obj.includes('usemtl'));
console.log(fail ? `GAGAL ${fail}` : 'SEMUA LULUS');
process.exit(fail ? 1 : 0);
