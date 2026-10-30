// Kerapian: ratakan & sebar rata, Bersihkan Model (tag/garis/bidang/titik, benda bolong, arah bidang)
import * as G from '../geometry.js';
import { alignUnits, analyzeModel, cleanModel } from '../rapi.js';
let fail = 0;
const check = (label, ok) => { console.log((ok ? 'OK   ' : 'FAIL ') + label); if (!ok) fail++; };

// kubus tertutup 1 m (bidang menghadap keluar) di (x, y, z)
function cube(m, x, y, z, s = 1, sid = m.nextId++) {
  const P = (i, j, k) => [x + i * s, y + j * s, z + k * s];
  const quads = [
    [P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), P(1, 0, 0)], [P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)],
    [P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)], [P(0, 1, 0), P(0, 1, 1), P(1, 1, 1), P(1, 1, 0)],
    [P(0, 0, 0), P(0, 0, 1), P(0, 1, 1), P(0, 1, 0)], [P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1)],
  ];
  const ids = new Set();
  for (const q of quads) {
    const f = G.makeFace(m, q, G.newellNormal(q).normalize(), '#ccc', sid); // arah sesuai urutan titik (keluar)
    m.faces.push(f);
    ids.add(f.id);
  }
  return ids;
}
const box = (m, ids) => G.bboxOf(m, ids);

// --- ratakan: alas tiga kubus disamakan, lalu tengah X disamakan
{
  const m = G.newModel();
  const u = [cube(m, 0, 0, 0), cube(m, 3, 1, 2, 0.5), cube(m, 7, -2, 1, 2)];
  check('ratakan bawah (Z) memindah 2 benda', alignUnits(m, u, 2, 'min') === 2);
  check('semua alas di z = 0', u.every((ids) => Math.abs(box(m, ids).min.z) < 1e-9));
  alignUnits(m, u, 0, 'mid');
  const cx = u.map((ids) => { const b = box(m, ids); return (b.min.x + b.max.x) / 2; });
  check('tengah X sama', Math.max(...cx) - Math.min(...cx) < 1e-9);
  alignUnits(m, u, 1, 'max');
  check('tepi kanan Y sama', u.every((ids) => Math.abs(box(m, ids).max.y - box(m, u[0]).max.y) < 1e-9));
}
// --- sebar: jarak antar-benda sama, benda paling luar tidak bergeser
{
  const m = G.newModel();
  const u = [cube(m, 0, 0, 0), cube(m, 1.5, 0, 0, 0.5), cube(m, 9, 0, 0), cube(m, 3, 0, 0, 2)];
  alignUnits(m, u, 0, 'spread');
  const b = u.map((ids) => box(m, ids)).sort((p, q) => p.min.x - q.min.x);
  const gaps = b.slice(1).map((x, i) => x.min.x - b[i].max.x);
  check(`sebar rata: celah ${gaps.map((g) => g.toFixed(3)).join(' / ')}`, Math.max(...gaps) - Math.min(...gaps) < 1e-9);
  check('ujung tetap (0 .. 10)', Math.abs(b[0].min.x) < 1e-9 && Math.abs(b[3].max.x - 10) < 1e-9);
  check('sebar butuh minimal 3 benda', alignUnits(m, u.slice(0, 2), 0, 'spread') === 0);
}
// --- bersihkan model
{
  const m = G.newModel();
  const good = cube(m, 0, 0, 0);
  const inv = cube(m, 3, 0, 0);
  G.reverseFaces(m, inv); // seluruh benda menghadap ke dalam
  const mixed = cube(m, 6, 0, 0);
  G.reverseFaces(m, new Set([[...mixed][2]])); // satu bidang terbalik
  const open = cube(m, 9, 0, 0);
  G.deleteIds(m, new Set([[...open][1]])); // tutup atas hilang
  m.tags.push({ id: 900, name: 'Dipakai', visible: true }, { id: 901, name: 'Kosong', visible: true }, { id: 902, name: 'Lantai', visible: true });
  m.faces[0].tag = 900;
  m.lines.push({ id: m.nextId++, a: [0, 0, 5], b: [0, 0, 5.0001], group: null }); // sangat pendek
  m.lines.push({ id: m.nextId++, a: [0, 0, 5], b: [1, 0, 5], group: null }, { id: m.nextId++, a: [1, 0, 5], b: [0, 0, 5], group: null }); // kembar
  const dup = structuredClone(m.faces[0]);
  dup.id = m.nextId++;
  m.faces.push(dup); // bidang kembar
  m.faces.push({ id: m.nextId++, pts: [[0, 0, 7], [1, 0, 7], [2, 0, 7]], holes: [], n: [0, 0, 1], color: '#ccc', solid: null, group: null }); // luas nol
  m.lines.push({ id: m.nextId++, a: [20, 0, 0], b: [21, 0, 0], group: null }, { id: m.nextId++, a: [21.00005, 0, 0], b: [22, 0, 0], group: null }); // hampir berimpit
  const tex = new Map([['u:1', { name: 'pakai' }], ['u:2', { name: 'sisa' }], ['kayu', { builtin: true }]]);
  m.faces[1].tex = 'u:1';

  const r = analyzeModel(m, { levelTags: [902], textures: tex });
  check('tag kosong terdeteksi (tag lantai & dipakai aman)', r.unusedTags.join() === '901');
  check('tekstur impor tak terpakai terdeteksi', r.unusedTextures.join() === 'u:2');
  check('garis pendek 1 & garis kembar 1', r.shortLines.length === 1 && r.dupLines.length === 1);
  check('bidang rusak 1 & bidang kembar 1', r.badFaces.length === 1 && r.dupFaces.length === 1);
  check('titik hampir berimpit terdeteksi', r.nearPoints >= 1);
  check('1 benda bolong (rusuk terbuka 4)', r.openSolids.length === 1 && r.openSolids[0].open === 4);
  check(`2 benda arah bidangnya salah (${r.flipFaces.size} bidang dibalik)`, r.flippedSolids === 2 && r.flipFaces.size === 7);
  check('kubus benar tidak disentuh', [...good].every((id) => !r.flipFaces.has(id)));

  const n0 = m.faces.length;
  const done = cleanModel(m, r, { tags: true, textures: true, lines: true, faces: true, weld: true, normals: true }, { textures: tex });
  check(`dibersihkan: ${JSON.stringify(done)}`, done.tags === 1 && done.textures === 1 && done.lines === 2 && done.faces === 2 && done.weld >= 1 && done.normals === 7);
  check('jumlah bidang berkurang 2', m.faces.length === n0 - 2);
  const r2 = analyzeModel(m, { levelTags: [902], textures: tex });
  check('setelah dibersihkan: tidak ada masalah tersisa (kecuali benda bolong)', !r2.unusedTags.length && !r2.shortLines.length && !r2.dupLines.length && !r2.badFaces.length && !r2.dupFaces.length && !r2.nearPoints && !r2.flipFaces.size && r2.openSolids.length === 1);
}
// --- benda dengan T-junction (satu sisi dipecah dua) tetap dianggap tertutup
{
  const m = G.newModel();
  const ids = cube(m, 0, 0, 0, 1, 77);
  const top = m.faces.find((f) => ids.has(f.id) && f.n[2] > 0.5);
  G.deleteIds(m, new Set([top.id]));
  for (const q of [[[0, 0, 1], [0.5, 0, 1], [0.5, 1, 1], [0, 1, 1]], [[0.5, 0, 1], [1, 0, 1], [1, 1, 1], [0.5, 1, 1]]]) m.faces.push(G.makeFace(m, q, G.newellNormal(q).normalize(), '#ccc', 77));
  const r = analyzeModel(m);
  check('tutup dipecah dua (T-junction) tidak dianggap bolong', r.openSolids.length === 0 && r.flipFaces.size === 0);
}
if (fail) {
  console.log(`\n${fail} gagal`);
  process.exit(1);
}
console.log('\nsemua lulus');
