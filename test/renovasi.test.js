// Renovasi (fase eksisting/bongkar/baru), elemen plat-balok-kolom, cek struktur & paket penawaran.
import * as THREE from 'three';
import * as G from '../geometry.js';
import * as C from '../construct.js';
import * as S from '../struktur.js';
const ok = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1); } console.log('ok -', m); };
const m = G.normalizeModel({ faces: [], lines: [], nextId: 1 });
m.levels = [{ name: 'Lantai 1', z: 0, h: 3.2 }, { name: 'Lantai 2', z: 3.2, h: 2.8 }];
const wall = (P, h, closed) => {
  const fp = G.wallFootprint(P, 0.15, closed);
  const f = G.makeFace(m, fp.pts, new THREE.Vector3(0, 0, 1), '#eee');
  f.holes = fp.holes; m.faces.push(f);
  G.pushPull(m, f.id, h);
  return C.makeWallGroup(m, f.solid, { t: 0.15, h, pts: P, closed });
};
// rumah lama: lantai 1 (y 3..12), lantai 2 belakang (y 7..12)
const w1 = wall([[0, 3, 0], [6, 3, 0], [6, 12, 0], [0, 12, 0]], 3.08, true);
const w1b = wall([[3, 3.075, 0], [3, 11.925, 0]], 3.08, false);
const w2 = wall([[0, 7, 3.2], [6, 7, 3.2], [6, 12, 3.2], [0, 12, 3.2]], 2.8, true);
for (const g of [w1, w1b, w2]) C.buildStructure(m, g, { ground: m.groups[g].wall.pts[0][2] < 0.1 });
const slabOld = C.makeSlab(m, [[0, 7], [6, 7], [6, 12], [0, 12]], 3.2, 0.12);
// atap genteng lama di depan (ditandai bongkar)
const rf = G.makeFace(m, [[0, 0, 3.1], [6, 0, 3.1], [6, 7, 4.2], [0, 7, 4.2]], new THREE.Vector3(0, -0.7, 0.7), '#a33');
m.faces.push(rf);
const roofG = G.makeGroup(m, new Set([rf.id]), 'Atap lama', false, null);
m.groups[roofG].roof = { pitch: 9 };
const before = C.rabRows(m).reduce((a, r) => a + r.total, 0);
ok(before > 0, 'RAB sebelum renovasi ' + before.toLocaleString('id-ID'));
// tandai semua yang ada = eksisting, atap = bongkar
const tops = Object.keys(m.groups).filter((k) => m.groups[k].parent == null && !m.groups[k].struct).map(Number);
C.setPhase(m, tops, 'exist');
C.setPhase(m, [roofG], 'demo');
ok(C.renoActive(m) && C.phaseOf(m, roofG) === 'demo' && C.phaseOf(m, w1) === 'exist', 'fase tersimpan');
const sg = +Object.keys(m.groups).find((k) => m.groups[k].struct?.wall === w1);
ok(C.phaseOf(m, sg) === 'exist', 'struktur ikut fase dindingnya');
let rows = C.rabRows(m);
ok(rows.every((r) => r.cat === 'Pekerjaan Bongkaran'), 'hanya bongkaran: ' + rows.map((r) => r.code).join(','));
const B2 = rows.find((r) => r.code === 'B.2');
ok(B2 && Math.abs(B2.vol - 6 * Math.hypot(7, 1.1)) < 0.05, 'bongkar atap ' + B2.vol + ' m²');
ok(rows.some((r) => r.code === 'B.7'), 'angkut puing');
// pekerjaan baru: plat dak 6x7 + tembok keliling 1 m
const dak = C.makeSlab(m, [[0, 0], [6, 0], [6, 7], [0, 7]], 3.2, 0.12);
ok(m.groups[dak].slab.area === 42, 'plat dak 42 m²');
const par = wall([[0, 7, 3.2], [0, 0, 3.2], [6, 0, 3.2], [6, 7, 3.2]], 1.0, false);
// pintu baru di dinding lama lantai 2
const face = m.faces.find((q) => q.solid != null && q.group === w2 && q.n[1] < -0.99 && Math.min(...q.pts.map((p) => p[1])) < 6.95);
const op = C.placeOpening(m, face.id, new THREE.Vector3(1.6, 6.925, 4.2), 'pintu');
ok(!op.error && C.phaseOf(m, op.gid) === 'new', 'pintu baru di dinding eksisting');
rows = C.rabRows(m);
const by = Object.fromEntries(rows.map((r) => [r.code, r]));
ok(by['18.1.1.1'] && by['18.1.1.1'].vol === 42, 'cor dak hanya plat baru: ' + by['18.1.1.1']?.vol);
ok(by['B.9'] && Math.abs(by['B.9'].vol - 0.9 * 2.1) < 0.01, 'bobok dinding lama untuk pintu baru');
ok(by['7.1.1.1'] && by['7.1.1.1'].vol < 20 && by['7.1.1.1'].vol > 12, 'bata hanya tembok keliling: ' + by['7.1.1.1'].vol);
ok(!by['6.6.1.1'], 'tidak ada pondasi untuk dinding lama');
// ---- cek struktur ----
let ck = S.structCheck(m);
const e1 = ck.items.filter((x) => x.lvl === 'err');
ok(e1.some((x) => x.el === 'Plat' && /menggantung|tidak bertumpu/.test(x.msg)), 'plat carport menggantung terdeteksi');
const add = ck.items.find((x) => x.fix?.kind === 'add');
ok(add && add.fix.beams.length === 3 && add.fix.cols.length === 2, 'saran 3 balok tepi + 2 kolom: ' + add?.msg);
ok(ck.items.some((x) => x.el === 'Kolom' && x.fix?.kind === 'wall' && x.gid === w1), 'kolom praktis lama memikul plat -> saran kolom struktur');
S.applyFix(m, add.fix);
const beams = Object.values(m.groups).filter((g) => g.beam);
ok(beams.length === 3 && beams.some((b) => Math.abs(b.beam.len - 6) < 0.01), 'balok tepi dibuat');
const cols = Object.values(m.groups).filter((g) => g.column);
ok(cols.length === 2 && cols.every((c) => c.column.foot > 0), 'kolom berfootplat dibuat');
ck = S.structCheck(m);
ok(!ck.items.some((x) => x.el === 'Plat' && x.lvl === 'err'), 'plat tidak lagi menggantung');
ok(ck.items.some((x) => x.el === 'Plat' && x.lvl === 'ok' && x.gid === dak), 'plat 12 cm OK: ' + ck.items.find((x) => x.gid === dak)?.msg);
// terapkan semua saran berulang sampai stabil
for (let it = 0; it < 4; it++) {
  const fx = S.structCheck(m).items.filter((x) => x.fix && x.lvl !== 'ok');
  if (!fx.length) break;
  for (const x of fx) S.applyFix(m, x.fix);
}
ck = S.structCheck(m);
ok(ck.n.err === 0, 'setelah perbaikan tidak ada galat: ' + ck.items.filter((x) => x.lvl === 'err').map((x) => x.msg).join(' | '));
ok(m.groups[w1].wall.colB >= 0.2, 'kolom dinding lama jadi 20/20');
rows = C.rabRows(m);
const by2 = Object.fromEntries(rows.map((r) => [r.code, r]));
ok(by2['6.4.1.2']?.vol > 50 && by2['6.5.1.2']?.vol > 5 && by2['6.3.1.3']?.vol > 0.5, `besi ${by2['6.4.1.2']?.vol} kg, bekisting balok ${by2['6.5.1.2']?.vol} m², beton ${by2['6.3.1.3']?.vol} m³`);
ok(!by2['6.8.1.1'] || by2['6.8.1.1'].vol <= 10, 'kolom lama yang diperkuat tidak dihitung sebagai praktis baru: ' + by2['6.8.1.1']?.vol + ' B.9 ' + by2['B.9']?.vol);
const bb = C.bbs(m);
ok(bb.rows.some((r) => /Balok/.test(r.el)) && bb.rows.some((r) => /Footplat/.test(r.el)), 'pembesian balok & footplat');
// ---- elemen: bangun ulang ----
const bg = +Object.keys(m.groups).find((k) => m.groups[k].beam);
const nb = C.rebuildElem(m, bg, { h: 0.45 });
ok(m.groups[nb].beam.h === 0.45 && m.groups[nb].beam.len > 2, 'balok dibangun ulang');
// ---- kapasitas kolom ----
const cap = S.colCapacity(0.2, S.STRUK_DEFAULT, false);
ok(cap > 400 && cap < 480, 'kapasitas kolom 20/20 ' + cap.toFixed(0) + ' kN');
// ---- paket ----
const rh = C.rabRows(m, { pkg: 'hemat' }).reduce((a, r) => a + r.total, 0);
const rs = C.rabRows(m, { pkg: 'standar' }).reduce((a, r) => a + r.total, 0);
const rp = C.rabRows(m, { pkg: 'premium' }).reduce((a, r) => a + r.total, 0);
ok(rh <= rs && rs <= rp, `paket hemat ${rh.toLocaleString('id-ID')} ≤ standar ${rs.toLocaleString('id-ID')} ≤ premium ${rp.toLocaleString('id-ID')}`);
// bangunan baru biasa tanpa fase: tetap seperti dulu
const m2 = G.normalizeModel({ faces: [], lines: [], nextId: 1 });
const fp = G.wallFootprint([[0, 0, 0], [4, 0, 0], [4, 3, 0], [0, 3, 0]], 0.15, true);
const f2 = G.makeFace(m2, fp.pts, new THREE.Vector3(0, 0, 1), '#eee'); f2.holes = fp.holes; m2.faces.push(f2); G.pushPull(m2, f2.id, 3);
C.makeWallGroup(m2, f2.solid, { t: 0.15, h: 3, pts: [[0, 0, 0], [4, 0, 0], [4, 3, 0], [0, 3, 0]], closed: true });
const r2 = C.rabRows(m2);
ok(!C.renoActive(m2) && r2.some((r) => r.code === '6.6.1.1') && !r2.some((r) => r.cat === 'Pekerjaan Bongkaran'), 'model tanpa fase dihitung penuh');
const k2 = S.structCheck(m2);
ok(k2.n.err === 0, 'rumah 1 lantai tanpa plat: tidak ada galat');
