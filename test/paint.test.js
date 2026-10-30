// Lukis tekstur: bentangan UV atlas (tanpa tumpang-tindih, di dalam gambar), piksel kuas, sasaran cap kuas
import * as THREE from 'three';
import '../manusia.js';
import { libraryModel } from '../library.js';
import * as PT from '../paint.js';
let fail = 0;
const check = (label, ok) => { console.log((ok ? 'OK   ' : 'FAIL ') + label); if (!ok) fail++; };

const m = libraryModel('manusia_pak_tani');
const ids = new Set(m.faces.map((f) => f.id)), inv = new THREE.Matrix4();
const t0 = Date.now();
const L = PT.unwrap(m, ids, inv, 2048);
check(`bentangan ${m.faces.length} bidang → ${L.charts.length} potongan, ${(Date.now() - t0)} ms`, L.charts.length > 10 && Date.now() - t0 < 8000);
check('semua bidang punya UV & potongan', m.faces.every((f) => f.puv && f.puv.length === f.pts.length && f.pchart != null));
check('UV di dalam gambar (0..1)', m.faces.every((f) => f.puv.every(([u, v]) => u >= 0 && u <= 1 && v >= 0 && v <= 1)));
// kotak potongan tidak saling menimpa
const R = L.charts.map((c) => [c.ox, c.oy, c.ox + c.pw, c.oy + c.ph]);
let overlap = 0;
for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
  const a = R[i], b = R[j];
  if (a[0] < b[2] - 0.5 && b[0] < a[2] - 0.5 && a[1] < b[3] - 0.5 && b[1] < a[3] - 0.5) overlap++;
}
check('kotak potongan di atlas tidak tumpang-tindih', overlap === 0);
check(`kerapatan ${L.s.toFixed(0)} piksel/m (≥ 300)`, L.s >= 300);
// piksel kuas = UV bidang (titik sudut bidang dipetakan sama)
const f = m.faces[500], c = L.charts[f.pchart], [px, py] = PT.chartPixel(L, c, f.pts[0]);
check('piksel kuas cocok dengan UV bidang', Math.abs(px / 2048 - f.puv[0][0]) < 1e-6 && Math.abs(1 - py / 2048 - f.puv[0][1]) < 1e-6);
// cap kuas di dada depan: hanya potongan yang menghadap depan (-Y) di dekatnya, bukan punggung
const idx = PT.paintIndex(m.faces, inv);
const chest = m.faces.filter((x) => x.n[1] < -0.8 && x.pts[0][2] > 1.15 && x.pts[0][2] < 1.3 && Math.abs(x.pts[0][0]) < 0.05)[0];
const q = chest.pts[0], tg = PT.stampTargets(L, idx, q, 0.03, chest.n);
check(`kuas 3 cm di dada mengenai ${tg.size} potongan, tidak tembus ke punggung`, tg.size >= 1 && tg.size < 25 && m.faces.filter((x) => x.pchart != null && [...tg.keys()].includes(x.pchart)).every((x) => x.n[1] < 0.3));
if (fail) {
  console.log(`\n${fail} gagal`);
  process.exit(1);
}
console.log('\nsemua lulus');
