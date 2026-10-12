import * as THREE from 'three';
import * as G from '../geometry.js';
import * as P from '../production.js';
const ok = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1); } console.log('ok -', m); };
// kabinet 80 x 40 x 180, 3 rak, 2 pintu
const m = G.normalizeModel({ faces: [], lines: [], nextId: 1 });
const cab = P.buildCabinet(m, { w: 0.8, d: 0.4, h: 1.8, shelves: 3, doors: 2 });
const cl = P.cutList(m);
const total = cl.rows.reduce((a, r) => a + r.qty, 0);
ok(total === 2 + 1 + 1 + 1 + 1 + 3 + 2 && cl.others.length === 0, 'kabinet: ' + total + ' panel, ' + cl.rows.length + ' ukuran');
const side = cl.rows.find((r) => r.L === 1800 && r.W === 400 && r.T === 18);
ok(side && side.qty === 2, 'samping 1800×400×18 ×2');
ok(cl.rows.some((r) => r.T === 3), 'panel belakang HDF 3 mm terdeteksi');
ok(cab.hardware.engsel === 8, 'engsel ' + cab.hardware.engsel);
const n = P.nest(cl.rows.filter((r) => r.T === 18), 2440, 1220, 3, true);
const placedArea = n.sheets.reduce((a, s) => a + s.parts.reduce((b, p) => b + p.w * p.h, 0), 0);
const need = cl.rows.filter((r) => r.T === 18).reduce((a, r) => a + r.L * r.W * r.qty, 0);
ok(Math.abs(placedArea - need) < 1 && n.tooBig.length === 0, `optimasi: ${n.sheets.length} lembar, pemakaian ${n.sheets.map((s) => (s.used * 100).toFixed(0) + '%').join(', ')}`);
// tidak ada potongan yang saling tumpang tindih / keluar lembar
for (const s of n.sheets) {
  for (const p of s.parts) ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= 2440 + 1e-6 && p.y + p.h <= 1220 + 1e-6, 'di dalam lembar ' + p.label);
  for (let i = 0; i < s.parts.length; i++) for (let j = i + 1; j < s.parts.length; j++) {
    const a = s.parts[i], b = s.parts[j];
    ok(a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6 || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6, `tak bertumpuk ${a.label}/${b.label}`);
  }
}
// cetak 3D: kubus 2 cm
const m2 = G.normalizeModel({ faces: [], lines: [], nextId: 1 });
const sid = P.buildBox(m2, 0.02, 0.02, 0.02);
const pa = P.printAnalysis(m2, [sid], { infill: 100, material: 'PLA', pricePerKg: 200000 });
ok(Math.abs(pa.volume - 8) < 1e-6 && Math.abs(pa.grams - 8 * 1.24) < 1e-6 && pa.issues.length === 0, `kubus 2 cm: ${pa.volume} cm³, ${pa.grams.toFixed(2)} g, Rp ${pa.cost.toFixed(0)}`);
const pa20 = P.printAnalysis(m2, [sid], { infill: 20 });
ok(pa20.grams < pa.grams && pa20.grams > pa.grams * 0.2, 'infill 20% lebih ringan: ' + pa20.grams.toFixed(2) + ' g');
const big = P.printAnalysis(m2, [sid], { scale: 20 });
ok(big.issues.some((i) => /melebihi/.test(i.msg)), 'peringatan ukuran melebihi area cetak');
const mf = P.export3MF(m2, [sid]);
ok((mf['3D/3dmodel.model'].match(/<triangle /g) || []).length === 12, '3MF 12 segitiga');
// pola datar kotak 10x6x4 cm
const m3 = G.normalizeModel({ faces: [], lines: [], nextId: 1 });
const bs = P.buildBox(m3, 0.1, 0.06, 0.04);
const u = P.unfold(m3, bs);
ok(u.pieces.length === 1 && u.placed === 6, 'kotak terbuka jadi 1 jaring 6 sisi');
const pc = u.pieces[0];
ok(pc.fold.length === 5 + pc.tabs.length && pc.tabs.length === 7, `lipatan ${pc.fold.length}, lidah lem ${pc.tabs.length}`);
const area = pc.polys.reduce((a, p) => a + Math.abs(p.pts2.reduce((s, q, i) => { const r = p.pts2[(i + 1) % p.pts2.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2, 0);
ok(Math.abs(area - 2 * (0.1 * 0.06 + 0.06 * 0.04 + 0.1 * 0.04)) < 1e-9, 'luas jaring = luas permukaan');
const lay = P.netLayout(u.pieces);
const svg = P.netSvg(lay);
ok(/<svg/.test(svg) && /class="fold"/.test(svg) && /mm"/.test(svg), 'SVG pola (mm) ' + (lay.W * 1000).toFixed(0) + '×' + (lay.H * 1000).toFixed(0) + ' mm');
ok(/POTONG/.test(P.netDxf(lay)) && /LIPAT/.test(P.netDxf(lay)), 'DXF dengan layer POTONG & LIPAT');
// jaring silinder (poligon 12 sisi)
const m4 = G.normalizeModel({ faces: [], lines: [], nextId: 1 });
const pts = [...Array(12)].map((_, i) => [0.03 * Math.cos((i / 12) * Math.PI * 2), 0.03 * Math.sin((i / 12) * Math.PI * 2), 0]);
const f = G.makeFace(m4, pts, new THREE.Vector3(0, 0, 1)); m4.faces.push(f); G.pushPull(m4, f.id, 0.05);
const u4 = P.unfold(m4, f.solid);
ok(u4.placed === 14, 'prisma 12 sisi terbuka: ' + u4.pieces.length + ' potongan');
