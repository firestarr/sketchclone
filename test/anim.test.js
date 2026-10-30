// Animasi: keyframe + easing, pose bertingkat (anak ikut induk), lintasan, roda berputar, engsel pintu,
// tahapan pembangunan, kamera, dan tulang figur manusia
import * as THREE from 'three';
import * as G from '../geometry.js';
import * as C from '../construct.js';
import { LIBRARY, insertLibrary, libraryModel } from '../library.js';
import '../motor.js';
import '../manusia.js';
import * as AN from '../anim.js';
let fail = 0;
const check = (label, ok) => { console.log((ok ? 'OK   ' : 'FAIL ') + label); if (!ok) fail++; };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const posOf = (W) => new THREE.Vector3().setFromMatrixPosition(W);

function boxGroup(m, x, y, z, s, name, parent = null) {
  const P = (i, j, k) => [x + i * s, y + j * s, z + k * s];
  const ids = new Set();
  for (const q of [[P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), P(1, 0, 0)], [P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)]]) {
    const f = G.makeFace(m, q, null, '#ccc');
    f.group = parent;
    m.faces.push(f);
    ids.add(f.id);
  }
  return G.makeGroup(m, ids, name, false, parent);
}

// --- kunci + easing
{
  const keys = [];
  const T = (x) => new THREE.Matrix4().makeTranslation(x, 0, 0).toArray();
  AN.setKey(keys, { t: 2, m: T(10), ease: 'linear' });
  AN.setKey(keys, { t: 0, m: T(0) });
  AN.setKey(keys, { t: 2.001, m: T(20), ease: 'linear' }); // menimpa kunci di waktu yang sama
  check('kunci diurutkan & ditimpa', keys.length === 2 && keys[1].t === 2.001 && keys[0].t === 0);
  check('linear di tengah = 10', near(posOf(AN.sampleKeys(keys, 1.0005).M).x, 10, 1e-3));
  keys[1].ease = 'halus';
  check('halus di 1/4 waktu < linear', posOf(AN.sampleKeys(keys, 0.5).M).x < 5);
  keys[1].ease = 'konstan';
  check('konstan: tetap di nilai awal sampai kunci berikut', near(posOf(AN.sampleKeys(keys, 1.99).M).x, 0));
  check('sebelum/sesudah kunci = ujung', near(posOf(AN.sampleKeys(keys, -1).M).x, 0) && near(posOf(AN.sampleKeys(keys, 9).M).x, 20));
}
// --- anak ikut induk (kunci relatif)
{
  const m = G.newModel();
  const car = boxGroup(m, 0, 0, 0, 1, 'Induk');
  const kid = boxGroup(m, 0, 0, 1, 0.2, 'Anak', null);
  m.groups[kid].parent = car;
  const A = AN.animOf(m);
  A.tracks[car] = { keys: [{ t: 0, m: AN.relMat(m, car).toArray() }, { t: 4, m: new THREE.Matrix4().makeTranslation(8, 0, 0).toArray(), ease: 'linear' }] };
  A.tracks[kid] = { keys: [{ t: 0, m: AN.relMat(m, kid).toArray() }, { t: 4, m: new THREE.Matrix4().makeTranslation(0, 0, 2).toArray(), ease: 'linear' }] };
  const c = new Map(), pk = AN.poseAt(m, kid, 2, c);
  check(`anak = gerak induk + gerak sendiri (${posOf(pk.W).toArray().map((v) => v.toFixed(2))})`, near(posOf(pk.W).x, 4, 1e-6) && near(posOf(pk.W).z, 1, 1e-6));
  check('grup beranimasi terdaftar', AN.animatedGids(m).length === 2);
}
// --- lintasan + roda motor berputar sesuai jarak
{
  const m = G.newModel();
  const { gid } = insertLibrary(m, 'kendaraan_matic_merah', new THREE.Vector3(0, 0, 0), 0);
  const ws = AN.wheelSets(m, G.entitiesInTree(m, gid));
  check(`motor punya 2 roda bertanda (${ws.map((w) => w.ids.size).join(', ')} bidang)`, ws.length === 2 && ws.every((w) => w.ids.size > 300));
  const mob = G.newModel(), car = insertLibrary(mob, 'mobil', new THREE.Vector3(), 0);
  check('mobil punya 4 roda bertanda', AN.wheelSets(mob, G.entitiesInTree(mob, car.gid)).length === 4);
  const A = AN.animOf(m);
  A.tracks[gid] = { path: { pts: [[0, 0, 0], [0, -10, 0], [10, -10, 0]], t0: 0, t1: 4, ease: 'linear', fwd: [0, -1, 0], base: m.groups[gid].m } };
  const W2 = AN.poseAt(m, gid, 2).W, p2 = posOf(W2);
  check(`setengah waktu = ujung ruas pertama (${p2.toArray().map((v) => v.toFixed(2))})`, near(p2.x, 0, 1e-6) && near(p2.y, -10, 1e-6));
  const W4 = AN.poseAt(m, gid, 4).W, fwd = new THREE.Vector3(0, -1, 0).transformDirection(W4);
  check('di ruas kedua motor menghadap +X', near(fwd.x, 1, 1e-3));
  const R = ws[0].roda.r, tb = AN.motionTable(m, gid, 4, 30, ws[0].roda.ax, R);
  check(`roda berputar maju: ${(tb.at(tb.ang, 2) / (2 * Math.PI)).toFixed(2)} putaran untuk 10 m (R=${R})`, Math.abs(tb.at(tb.ang, 2) / (10 / R) - 1) < 0.05 && tb.at(tb.dist, 4) > 19.9);
}
// --- engsel pintu dari kusen
{
  const m = G.newModel();
  const w = C.makeWall ? null : null;
  void w;
  // dinding solid 4 x 0.15 x 3 lalu pasang pintu
  const pts = [[0, 0, 0], [4, 0, 0], [4, 0.15, 0], [0, 0.15, 0]];
  const f = G.addFace(m, pts, null);
  G.pushPull(m, f.id, 3);
  const front = m.faces.find((x) => x.n[1] < -0.9);
  const r = C.placeOpening(m, front.id, new THREE.Vector3(2, 0, 1), 'pintu');
  check('pintu terpasang', !r.error && r.gid != null);
  const L = AN.hingeLeaves(m, r.gid);
  const lb = G.bboxOf(m, L[0]?.ids);
  check(`1 daun pintu, engsel di tepi daun (x=${L[0]?.hinge.x.toFixed(2)})`, L.length === 1 && (near(L[0].hinge.x, lb.min.x, 0.01) || near(L[0].hinge.x, lb.max.x, 0.01)));
  check('sudut buka diinterpolasi', near(AN.hingeDeg({ buka: [{ t: 1, deg: 0 }, { t: 2, deg: 90 }] }, 1.5), 45, 1e-6));
}
// --- tahapan pembangunan: urutan dinding sebelum atap, tersembunyi sebelum tahapnya
{
  const m = G.newModel();
  const wall = boxGroup(m, 0, 0, 0, 1, 'Dinding'); m.groups[wall].wall = { pts: [] };
  const roof = boxGroup(m, 0, 0, 3, 1, 'Atap'); m.groups[roof].roof = { pitch: 30 };
  const col = boxGroup(m, 2, 0, 0, 0.2, 'Kolom'); m.groups[col].column = { b: 0.2 };
  const st = AN.buildStages(m, { per: 1 });
  const t0 = (g) => m.anim.tracks[g].keys[1].t;
  check(`tahap: ${st.map((s) => s.name).join(' → ')}`, t0(col) < t0(wall) && t0(wall) < t0(roof));
  check('atap belum tampak saat dinding naik', AN.poseAt(m, roof, t0(wall) + 0.5).vis === false && AN.poseAt(m, wall, t0(wall) + 0.5).vis === true);
  const sz = (g, t) => { const s = new THREE.Vector3(); AN.poseAt(m, g, t).W.decompose(new THREE.Vector3(), new THREE.Quaternion(), s); return s.z; };
  check('dinding tumbuh dari bawah lalu utuh', sz(wall, t0(wall) + 0.3) < 0.9 && near(sz(wall, t0(wall) + 1.01), 1, 1e-6));
  check('durasi cukup untuk semua tahap', m.anim.dur > t0(roof) + 1);
}
// --- kamera
{
  const m = G.newModel(), A = AN.animOf(m);
  A.cam = { mode: 'kunci', keys: [{ t: 0, c: { target: [0, 0, 0], dist: 10, az: 3, el: 0.3 } }, { t: 2, c: { target: [4, 0, 0], dist: 40, az: -3, el: 0.5 }, ease: 'linear' }] };
  const c = AN.cameraAt(m, 1);
  check(`kamera: target ${c.target.x}, jarak ${c.dist.toFixed(1)} (log), sudut lewat jalan terpendek (${c.az.toFixed(2)})`, near(c.target.x, 2) && near(c.dist, 20, 1e-6) && Math.abs(Math.abs(c.az) - Math.PI) < 0.01);
  A.cam = { mode: 'lintasan', path: { pts: [[0, 0, 0], [10, 0, 0]], h: 1.6, t0: 0, t1: 2, ease: 'linear' } };
  const v = AN.cameraAt(m, 1), eye = v.target.clone().add(new THREE.Vector3(Math.cos(v.el) * Math.cos(v.az), Math.cos(v.el) * Math.sin(v.az), Math.sin(v.el)).multiplyScalar(v.dist));
  check(`kamera lintasan: mata di (${eye.x.toFixed(2)}, ${eye.z.toFixed(2)}) menghadap +X`, near(eye.x, 5, 1e-6) && near(eye.z, 1.6, 1e-6) && v.target.x > eye.x);
  check('kamera bebas = null', (A.cam.mode = 'bebas') && AN.cameraAt(m, 1) === null);
}
// --- tulang figur: sendi masuk akal, bobot ternormalisasi, lengan/kaki/kepala ke tulang yang benar
{
  const fm = libraryModel('manusia_pak_tani'), pts = fm.faces.flatMap((f) => f.pts);
  const j = AN.figureRig(pts);
  check(`rig: H ${j.H.toFixed(2)}, tangan x ${j.xh.toFixed(2)}, pinggul x ${j.hipX.toFixed(2)}`, j.H > 1.6 && j.xh > 0.25 && j.xh < 0.36 && j.hipX > 0.05 && j.hipX < 0.14);
  const bone = (x, y, z) => { const s = AN.skinWeights(j, x, y, z); return AN.BONES[s.idx[0]]; };
  check('tangan kiri (+X) → tanganKi', bone(0.31, 0, 0.42 * j.H) === 'tanganKi');
  check('siku kanan (-X) → lengan/hasta Ka', /Ka$/.test(bone(-0.25, 0, 0.62 * j.H)));
  check('betis kiri → betisKi', bone(0.09, 0, 0.18 * j.H) === 'betisKi');
  check('kepala → kepala', bone(0, 0, 0.95 * j.H) === 'kepala');
  check('perut → perut/pinggul/dada', ['perut', 'pinggul', 'dada'].includes(bone(0, 0, 0.62 * j.H)));
  let okSum = true;
  for (const p of pts.slice(0, 4000)) { const s = AN.skinWeights(j, ...p); if (!near(s.wt.reduce((a, b) => a + b, 0), 1, 1e-6) || s.idx.length !== 4) okSum = false; }
  check('bobot tiap titik berjumlah 1 (maks 4 tulang)', okSum);
  const p = AN.figurePose([{ a: 'jalan', t0: 0, t1: 10 }], 5, Math.PI / 2);
  check('jalan: paha kiri ke depan, kanan ke belakang', p.rot[4][0] < -0.3 && p.rot[7][0] > 0.3);
  const d = AN.figurePose([{ a: 'duduk', t0: 0, t1: 10 }], 5, 0);
  check('duduk: paha ±90°, pinggul turun', d.rot[4][0] < -1.3 && d.drop > 0.2);
  check('di luar waktu aksi: pose netral', AN.figurePose([{ a: 'duduk', t0: 0, t1: 2 }], 5, 0).rot.every((r) => r.every((v) => v === 0)));
  check('figur dikenali dari pustaka', AN.isFigure({ def: 'lib:manusia_pak_tani' }) && !AN.isFigure({ def: 'lib:kendaraan_matic_merah' }));
}
void LIBRARY;
if (fail) {
  console.log(`\n${fail} gagal`);
  process.exit(1);
}
console.log('\nsemua lulus');
