// Motor realistis berpermukaan halus: matic, bebek, bebek klasik, sport fairing, motor laki, ukuran nyata, roda menapak tanah, knalpot di kanan (-X)
import { LIBRARY, libraryModel } from '../library.js';
import { MOTOR } from '../motor.js';
let fail = 0;
const check = (label, ok) => { console.log((ok ? 'OK   ' : 'FAIL ') + label); if (!ok) fail++; };
const keys = Object.keys(LIBRARY).filter((k) => LIBRARY[k].grp === 'kendaraan');
check('15 motor halus di pustaka', keys.length === 15 && Object.keys(MOTOR).length === 15);
for (const k of keys) {
  const m = libraryModel(k), P = m.faces.flatMap((f) => f.pts);
  const rng = (j) => [P.reduce((t, p) => Math.min(t, p[j]), 9), P.reduce((t, p) => Math.max(t, p[j]), -9)];
  const [x0, x1] = rng(0), [y0, y1] = rng(1), [z0, z1] = rng(2), soft = m.faces.filter((f) => f.soft).length;
  check(`${LIBRARY[k].name}: ${m.faces.length} bidang, ${(y1 - y0).toFixed(2)} x ${(x1 - x0).toFixed(2)} x ${z1.toFixed(2)} m`,
    m.faces.length > 20000 && soft > m.faces.length * 0.97 && Math.abs(z0) < 0.003 && y1 - y0 > 1.8 && y1 - y0 < 2.1 && x1 - x0 < 0.9 && z1 > 1.0 && z1 < 1.4);
}
// ban menapak di bawah kedua sumbu roda, bodi mengkilap
const mt = libraryModel('kendaraan_matic_merah');
const ground = mt.faces.filter((f) => f.color === '#18181a' && f.pts.some((p) => p[2] < 0.005));
check('kedua ban menapak tanah', ground.some((f) => f.pts[0][1] < 0) && ground.some((f) => f.pts[0][1] > 0));
check('cat bodi mengkilap', mt.faces.filter((f) => f.color === '#c3161c' && f.finish === 'glossy').length > 2000);
// knalpot (pelindung krom) di kanan pengendara = -X, rumah CVT di kiri = +X
const krom = mt.faces.filter((f) => f.color === '#c9ced3' && f.pts.every((p) => Math.abs(p[0]) > 0.17 && p[2] > 0.25 && p[2] < 0.45 && p[1] > 0.2 && p[1] < 0.6));
check('knalpot di kanan (-X)', krom.length > 20 && krom.every((f) => f.pts[0][0] < 0));
// bebek: jari-jari kawat
const bb = libraryModel('kendaraan_bebek_biru');
check('bebek berjari-jari kawat', bb.faces.filter((f) => f.color === '#c9ced3' && f.pts.every((p) => Math.abs(p[0]) < 0.04)).length > 500);
// ban tertutup sampai velg (tidak ada celah terlihat): titik ban terdalam dekat jari-jari velg
const tyre = mt.faces.filter((f) => f.color === '#18181a' && f.pts.every((p) => p[1] < -0.3));
const rIn = Math.min(...tyre.flatMap((f) => f.pts.map((p) => Math.hypot(p[1] + 0.62, p[2] - 0.25))));
check('dinding ban sampai ke velg', rIn < 0.18);
// sport: fairing lebih rendah dari motor laki, kaca depan; motor laki: lampu bulat krom
const sp = libraryModel('kendaraan_sport_hijau'), lk = libraryModel('kendaraan_laki_merah');
const hz = (mm, c) => Math.max(...mm.faces.filter((f) => f.color === c).flatMap((f) => f.pts.map((p) => p[2])));
check('sport: kaca depan di atas fairing', sp.faces.some((f) => f.color === '#4a5966' && f.finish === 'glass') && hz(sp, '#4caf2a') < 1.05);
check('motor laki: tangki di atas mesin bersirip', hz(lk, '#a3161b') > 1.0 && lk.faces.filter((f) => f.color === '#3a3d41' || f.color === '#2c2f33').length > 300);
if (fail) { console.log(fail + ' gagal'); process.exit(1); }
console.log('semua lulus');
