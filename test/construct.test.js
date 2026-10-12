import * as THREE from 'three';
import * as G from '../geometry.js';
import * as C from '../construct.js';
const ok = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1); } console.log('ok -', m); };
const m = G.normalizeModel({ faces: [], lines: [], nextId: 1 });
// ruang 4x3 (as dinding), tebal 0.15, tinggi 3
const P = [[0, 0, 0], [4, 0, 0], [4, 3, 0], [0, 3, 0]];
const fp = G.wallFootprint(P, 0.15, true);
const f = G.makeFace(m, fp.pts, new THREE.Vector3(0, 0, 1), '#eee');
f.holes = fp.holes; m.faces.push(f);
G.pushPull(m, f.id, 3);
const wg = C.makeWallGroup(m, f.solid, { t: 0.15, h: 3, pts: P, closed: true });
ok(wg != null && Math.abs(m.groups[wg].wall.len - 14) < 1e-6, 'grup dinding, panjang 14');
const sid = f.solid;
const v0 = C.solidVolume(m, sid);
ok(Math.abs(v0 - 14 * 0.15 * 3) < 1e-6, 'volume dinding ' + v0.toFixed(4));
// bidang luar sisi selatan (normal -y)
const south = m.faces.find((q) => q.solid === sid && q.n[1] < -0.99 && Math.min(...q.pts.map((p) => p[1])) < -0.07);
const r = C.placeOpening(m, south.id, new THREE.Vector3(2, -0.075, 1), 'pintu');
ok(!r.error, 'pintu terpasang ' + (r.error || ''));
const g = m.groups[r.gid];
ok(g.opening && Math.abs(g.opening.t - 0.15) < 1e-3 && g.parent === wg, 'meta pintu & induk dinding');
const v1 = C.solidVolume(m, r.wall);
ok(Math.abs(v0 - v1 - 0.9 * 2.1 * 0.15) < 1e-3, 'volume berkurang sebesar lubang: ' + (v0 - v1).toFixed(4));
const east = m.faces.find((q) => q.solid === r.wall && q.n[0] > 0.99 && Math.max(...q.pts.map((p) => p[0])) > 4.07);
const r2 = C.placeOpening(m, east.id, new THREE.Vector3(4.075, 1.5, 1.5), 'jendela');
ok(!r2.error, 'jendela terpasang');
ok(m.faces.some((q) => q.finish === 'glass' && q.group === r2.gid), 'kaca jendela');
// ruang
const out = C.roomOutline(m, 2, 1.5, 2.8);
ok(out && Math.abs(out.area - 3.85 * 2.85) < 0.02, 'luas ruang ' + (out && out.area.toFixed(3)) + ' (harus 10.97)');
ok(out.pts.length === 4, 'poligon ruang 4 titik');
ok(C.roomOutline(m, 6, 6, 2.8) == null, 'di luar ruang -> null');
const rg = C.makeRoom(m, out, 'Kamar', 0);
ok(m.groups[rg].room.area > 10, 'ruang dibuat');
const rows = C.rabRows(m);
const by = Object.fromEntries(rows.map((x) => [x.key, x]));
const bata = 14 * 3 - 0.9 * 2.1 - 1.2 * 1.2;
ok(Math.abs(by['7.1.1.1'].vol - bata) < 0.02, 'luas bata ' + by['7.1.1.1'].vol + ' ~ ' + bata.toFixed(2));
ok(by['7.5.2.1'].vol === 1 && by['7.5.3.1'].vol === 2, 'jumlah daun pintu/jendela');
ok(Math.abs(by['7.5.1.1'].vol - (2 * 2.1 + 0.9 + 2 * 1.2 + 2 * 1.2)) < 0.02, 'panjang kusen');
ok(by['6.6.1.1'] && by['7.4.1.2'] && by['7.7.1.1'], 'pondasi, keramik, plafon');
const sh = C.rabSheet(m, rows, { name: 'Tes' });
ok(sh.grand === rows.reduce((s, x) => s + x.total, 0) && sh.data[6][0] === 'No', 'lembar RAB');
console.log('Total RAB: Rp', sh.grand.toLocaleString('id-ID'));
// sekat dalam: dinding terbuka membagi ruang
const fp2 = G.wallFootprint([[2, 0, 0], [2, 3, 0]], 0.15, false);
const f2 = G.makeFace(m, fp2.pts, new THREE.Vector3(0, 0, 1), '#eee');
m.faces.push(f2); G.pushPull(m, f2.id, 3);
const o2 = C.roomOutline(m, 1, 1.5, 2.8);
ok(o2 && Math.abs(o2.area - 1.85 * 2.85) < 0.03, 'ruang tersekat ' + (o2 && o2.area.toFixed(3)) + ' (harus 5.27)');
// denah L
const m2 = G.normalizeModel({ faces: [], lines: [], nextId: 1 });
const L = [[0, 0, 0], [6, 0, 0], [6, 3, 0], [3, 3, 0], [3, 5, 0], [0, 5, 0]];
const fp3 = G.wallFootprint(L, 0.2, true);
const f3 = G.makeFace(m2, fp3.pts, new THREE.Vector3(0, 0, 1), '#eee');
f3.holes = fp3.holes; m2.faces.push(f3); G.pushPull(m2, f3.id, 3);
const o3 = C.roomOutline(m2, 1, 1, 2.5);
const exp = 5.8 * 2.8 + 2.8 * 2; // (0.1..5.9)x(0.1..2.9) + (0.1..2.9)x(2.9..4.9)
ok(o3 && Math.abs(o3.area - exp) < 0.03 && o3.pts.length === 6, 'denah L ' + (o3 && o3.area.toFixed(3)) + ' (harus ' + exp.toFixed(2) + ')');
