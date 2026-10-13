// Batas tanah: pondasi & footplat pinggir tidak menyeberang kavling, cek struktur & sloof pengikat.
import * as THREE from 'three';
import * as G from '../geometry.js';
import * as C from '../construct.js';
import * as S from '../struktur.js';
const ok = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1); } console.log('ok -', m); };
const bbox = (m, gid) => {
  const ids = G.entitiesInTree(m, gid), b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of m.faces) if (ids.has(f.id)) for (const p of f.pts) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }
  return b;
};
const mk = () => {
  const m = G.normalizeModel({ faces: [], lines: [], nextId: 1 });
  m.levels = [{ name: 'Lantai 1', z: 0, h: 3.2 }, { name: 'Lantai 2', z: 3.2, h: 2.8 }];
  return m;
};
const wall = (m, P, h, closed) => {
  const fp = G.wallFootprint(P, 0.1, closed);
  const f = G.makeFace(m, fp.pts, new THREE.Vector3(0, 0, 1), '#eee');
  f.holes = fp.holes; m.faces.push(f);
  G.pushPull(m, f.id, h);
  return C.makeWallGroup(m, f.solid, { t: 0.1, h, pts: P, closed });
};
const structOf = (m, w) => +Object.keys(m.groups).find((k) => m.groups[k].struct?.wall === w);
const P = [[0.05, 1.5, 0], [5.95, 1.5, 0], [5.95, 11.95, 0], [0.05, 11.95, 0]];

// tanpa batas tanah: pondasi di tengah dinding (menyeberang 25 cm) — perilaku lama
const m0 = mk();
const w0 = wall(m0, P, 3, true);
C.buildStructure(m0, w0, { ground: true });
const b0 = bbox(m0, structOf(m0, w0));
ok(b0[0] < -0.2 && b0[2] > 6.2, 'tanpa batas: pondasi simetris ' + b0.map((v) => v.toFixed(2)));
const vol0 = m0.groups[structOf(m0, w0)].struct.pondasi;

// dengan batas tanah 6 x 12
const m = mk();
m.site = { w: 6, d: 12 };
ok(C.siteOf(m).x1 === 6 && C.siteOf(m).y1 === 12, 'siteOf');
const w = wall(m, P, 3, true);
C.buildStructure(m, w, { ground: true });
const sg = structOf(m, w), b1 = bbox(m, sg);
ok(b1[0] >= -1e-6 && b1[2] <= 6 + 1e-6 && b1[3] <= 12 + 1e-6, 'pondasi pinggir di dalam tanah ' + b1.map((v) => v.toFixed(3)));
ok(b1[1] < 1.3, 'sisi depan (tidak di batas) tetap simetris: ' + b1[1].toFixed(2));
ok(Math.abs(m.groups[sg].struct.pondasi - vol0) < 1e-6, 'volume pondasi tetap ' + vol0);
// lebar bawah pondasi pinggir tetap (0,6 m ke dalam dari batas)
const stone = m.faces.filter((f) => G.entitiesInTree(m, sg).has(f.id) && f.color === '#8d8377' && f.n[2] < -0.99);
ok(stone.some((f) => Math.abs(Math.min(...f.pts.map((p) => p[0]))) < 1e-6 && Math.abs(Math.max(...f.pts.map((p) => p[0])) - 0.6) < 1e-6), 'dasar pondasi kiri 0..0,6 m');

// footplat kolom di sudut tanah digeser ke dalam (pinggir)
const c1 = C.makeColumn(m, 0.1, 0.1, 0, 3.2, 0.2, { foot: 0.8 });
const col = m.groups[c1].column;
ok(col.ecc && Math.abs(col.ecc[0] - 0.3) < 1e-6 && Math.abs(col.ecc[1] - 0.3) < 1e-6, 'eksentrisitas footplat ' + col.ecc);
const bc = bbox(m, c1);
ok(bc[0] >= -1e-6 && bc[1] >= -1e-6 && Math.abs(bc[2] - 0.8) < 1e-6, 'footplat 0..0,8 m ' + bc.map((v) => v.toFixed(2)));
ok(/pinggir/.test(m.groups[c1].name), 'nama: ' + m.groups[c1].name);
const c2 = C.makeColumn(m, 2.95, 0.1, 0, 3.2, 0.2, { foot: 0.8 });
const c3 = C.makeColumn(m, 3, 6, 0, 3.2, 0.2, { foot: 0.8 });
ok(!m.groups[c3].column.ecc, 'kolom di tengah: footplat tetap di tengah');

// cek struktur: footplat pinggir minta sloof pengikat
let ck = S.structCheck(m);
const ties = ck.items.filter((x) => x.el === 'Pondasi' && x.fix?.kind === 'add' && x.fix.beams.every((b) => b.sloof));
ok(ties.length === 2, 'sloof pengikat disarankan untuk 2 footplat pinggir: ' + ties.map((x) => x.msg).join(' | '));
const t1 = ties.find((x) => x.gid === c1).fix.beams;
ok(t1.length === 2 && t1.some((b) => Math.abs(b.b[0] - 2.95) < 1e-6) && t1.some((b) => Math.abs(b.b[1] - 1.5) < 1e-6), 'sloof ke kolom sebelah & ke dinding depan: ' + JSON.stringify(t1.map((b) => b.b)));
for (const x of ties) S.applyFix(m, x.fix);
const sl = Object.values(m.groups).filter((g) => g.beam?.sloof);
ok(sl.length === 3 && sl.every((g) => /Sloof pengikat/.test(g.name)), 'sloof dibuat: ' + sl.length);
ck = S.structCheck(m);
ok(!ck.items.some((x) => x.el === 'Pondasi' && x.lvl === 'err' && /sloof/.test(x.msg)), 'tidak ada lagi permintaan sloof');
ok(!ck.items.some((x) => x.el === 'Balok' && x.lvl === 'err'), 'sloof tidak dianggap balok menggantung');
ok(ck.items.some((x) => x.el === 'Batas tanah' && x.lvl === 'ok'), 'semua di dalam batas');
const rows = C.rabRows(m), by = Object.fromEntries(rows.map((r) => [r.code, r]));
ok(by['6.5.1.2'] && by['6.1.1.1'], 'sloof masuk RAB (bekisting & galian)');

// elemen yang dibuat tanpa batas lalu batas diisi: terdeteksi & bisa diperbaiki
const m2 = mk();
const cc = C.makeColumn(m2, 0.1, 0.1, 0, 3.2, 0.2, { foot: 0.8 });
m2.site = { w: 6, d: 12 };
ck = S.structCheck(m2);
const out = ck.items.find((x) => x.el === 'Batas tanah' && x.gid === cc);
ok(out && out.lvl === 'err' && /kiri 30 cm/.test(out.msg) && out.fix, 'kolom keluar batas terdeteksi: ' + out?.msg);
S.applyFix(m2, out.fix);
ck = S.structCheck(m2);
ok(!ck.items.some((x) => x.el === 'Batas tanah' && x.lvl !== 'ok'), 'setelah perbaikan di dalam batas');
const ng = +Object.keys(m2.groups).find((k) => m2.groups[k].column);
ok(m2.groups[ng].column.ecc, 'footplat jadi pinggir');
// bangunan lama yang keluar batas hanya peringatan
const m3 = mk();
const w3 = wall(m3, [[-0.2, 1, 0], [3, 1, 0]], 3, false);
C.setPhase(m3, [w3], 'exist');
m3.site = { w: 6, d: 12 };
ck = S.structCheck(m3);
ok(ck.items.some((x) => x.el === 'Batas tanah' && x.lvl === 'warn' && /bangunan lama/.test(x.msg)), 'bangunan lama: peringatan');
