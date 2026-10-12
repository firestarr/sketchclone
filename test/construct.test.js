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
// tangga + lubang lantai atas
{
  const m3 = G.normalizeModel({ faces: [], lines: [], nextId: 1 });
  const P3 = [[0, 0, 0], [6, 0, 0], [6, 5, 0], [0, 5, 0]];
  for (const z of [0, 3]) {
    const fp = G.wallFootprint(P3.map((p) => [p[0], p[1], z]), 0.15, true);
    const f = G.makeFace(m3, fp.pts, new THREE.Vector3(0, 0, 1), '#eee');
    f.holes = fp.holes; m3.faces.push(f); G.pushPull(m3, f.id, 3);
  }
  const top = C.roomOutline(m3, 3, 2.5, 5.9);
  const rg = C.makeRoom(m3, top, 'Atas', 3);
  const a0 = m3.groups[rg].room.area;
  const sp = C.stairSpec(3);
  ok(sp.n === 17 && Math.abs(sp.R * sp.n - 3) < 1e-9, 'tangga 17 anak tangga');
  const st = C.placeStair(m3, new THREE.Vector3(0.5, 1.5, 0), -Math.PI / 2, sp);
  const vol = C.solidVolume(m3, m3.faces.find((f) => f.group === st.gid && !f.finish).solid);
  ok(vol > 0.5 && vol < 2, 'volume beton tangga ' + vol.toFixed(3));
  ok(C.cutStairVoid(m3, st.gid) === rg, 'lantai atas dilubangi');
  ok(Math.abs(a0 - m3.groups[rg].room.area - 0.9 * 17 * 0.28) < 1e-3, 'luas lantai atas berkurang');
  const fl = m3.faces.find((f) => f.group === rg);
  ok(Math.abs(G.faceArea(fl) - m3.groups[rg].room.area) < 0.02, 'luas bidang = luas ruang');
  const rr = Object.fromEntries(C.rabRows(m3).map((x) => [x.key, x]));
  ok(rr['6.3.1.3'] && rr['14.3.1.1'] && rr['7.4.1.1'], 'RAB tangga (beton, reling, keramik)');
  m3.rab = { pondasi: { top: 0.4, bot: 0.8, h: 1 } };
  ok(Math.abs(C.pondasiOf(m3).stone - 0.6) < 1e-9, 'ukuran pondasi dari model');
}
// tangga L & U
for (const shape of ['L', 'U']) {
  const m4 = G.normalizeModel({ faces: [], lines: [], nextId: 1 });
  const sp = C.stairSpec(3, { shape });
  const st = C.placeStair(m4, new THREE.Vector3(0, 0, 0), 0, sp);
  const b = G.bboxOf(m4);
  const meta = m4.groups[st.gid].stair;
  ok(Math.abs(b.max.z - 3 - 0.93) < 0.01 && meta.landing > 0, `tangga ${shape}: tinggi ${(b.max.z - 0.93).toFixed(2)}, bordes ${meta.landing} m², tapak ${meta.area} m², bbox ${b.min.x.toFixed(2)}..${b.max.x.toFixed(2)} x ${b.min.y.toFixed(2)}..${b.max.y.toFixed(2)}`);
  // puncak tangga kedua harus setinggi 3 m
  const topZ = Math.max(...m4.faces.filter((f) => !f.finish).flatMap((f) => f.pts.map((p) => p[2])));
  ok(Math.abs(topZ - 3) < 1e-6, `puncak beton ${shape} = ${topZ}`);
}
// utilitas
{
  const m5 = G.normalizeModel({ faces: [], lines: [], nextId: 1 });
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  C.placeMep(m5, 'panel', V(0, 0, 0), V(0, 1, 0), 0, { levelZ: 0 });
  C.placeMep(m5, 'lampu', V(2, 2, 0), V(0, 0, 1), 0, { ceilingZ: 2.8 });
  C.placeMep(m5, 'stopkontak', V(3, 0, 1), V(0, 1, 0), 0, { levelZ: 0 });
  const k = C.placeMep(m5, 'kloset', V(5, 0, 0), V(0, 1, 0), 0, { levelZ: 0 });
  C.placeMep(m5, 'septictank', V(5, -3, 0), V(0, 0, 1), 0, { levelZ: 0 });
  const b = G.bboxOf(m5, k.ids);
  ok(b.min.y > -1e-6 && b.max.y < 0.7, 'kloset menempel dinding, menjorok +Y');
  const lb = G.bboxOf(m5, new Set(m5.faces.filter((f) => m5.groups[f.group]?.mep?.kind === 'lampu').map((f) => f.id)));
  ok(Math.abs(lb.max.z - 2.8) < 1e-6, 'lampu menempel plafon');
  const runs = C.mepRuns(m5);
  ok(Math.abs(runs.kabel - ((2 + 2 + 2.8 - 1.5) + (3 + 0 + 1.2)) * 1.1) < 1e-6, 'panjang kabel ' + runs.kabel.toFixed(2));
  ok(Math.abs(runs.kotor - 3 * 1.1) < 1e-6, 'pipa air kotor ' + runs.kotor.toFixed(2));
  const rr = Object.fromEntries(C.rabRows(m5).map((x) => [x.key, x]));
  ok(rr['8.1.1.1'].vol === 1 && rr['8.1.1.2'].vol === 1 && rr['17.3.1.1'].vol === 1 && rr['8.3.1.1'] && rr['8.4.1.1'] && rr['17.2.1.2'], 'RAB utilitas');
}
// rekap, terbilang, bahan, kurva S
{
  ok(C.terbilang(1250000) === 'satu juta dua ratus lima puluh ribu', 'terbilang 1.250.000: ' + C.terbilang(1250000));
  ok(C.terbilang(211315) === 'dua ratus sebelas ribu tiga ratus lima belas', 'terbilang 211.315');
  ok(C.terbilang(1001000000) === 'satu miliar satu juta', 'terbilang 1.001.000.000: ' + C.terbilang(1001000000));
  const rows = C.rabRows(m);
  const rk = C.rekap(m, rows);
  ok(rk.sub === rows.reduce((a, r) => a + r.total, 0) && rk.total === rk.sub + rk.jasa + rk.ppn && rk.bulat % 1000 === 0, 'rekap: ' + rk.bulat.toLocaleString('id-ID') + ' — ' + rk.terbilang);
  const mt = C.materialTakeoff(m);
  const by = Object.fromEntries(mt.map((x) => [x.key, x]));
  const bata = 14 * 3 - 0.9 * 2.1 - 1.2 * 1.2;
  ok(Math.abs(by.bata.qty - Math.ceil(bata * 70)) <= 1, 'bata ' + by.bata.qty + ' bh');
  ok(by.semen.qty > 0 && by.semen.unit === 'zak' && by.pasir.qty > 0, 'semen ' + by.semen.qty + ' zak, pasir ' + by.pasir.qty + ' m³');
  const sc = C.schedule(rows, 12);
  ok(Math.abs(sc.cum[11] - 100) < 1e-6 && sc.cum.every((v, i) => i === 0 || v >= sc.cum[i - 1] - 1e-9), 'kurva S naik ke 100%: ' + sc.cum.map((v) => v.toFixed(0)).join(' '));
}
