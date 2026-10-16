// Figur horor (Peniru), sandal jepit, dan ekspor OBJ + MTL berwarna dengan normal halus
import { LIBRARY, libraryModel, buildPeniru, PN } from '../library.js';
import * as G from '../geometry.js';
let fail = 0;
const check = (label, ok) => { console.log((ok ? 'OK   ' : 'FAIL ') + label); if (!ok) fail++; };
for (const k of ['peniru_ibu', 'peniru_asli', 'sandal_jepit']) check(`${k} ada di pustaka grup horor`, LIBRARY[k]?.grp === 'horor');
const ibu = libraryModel('peniru_ibu'), asli = libraryModel('peniru_asli');
const H = (m) => Math.max(...m.faces.flatMap((f) => f.pts.map((p) => p[2])));
check('Peniru jangkung (2,0-2,2 m)', H(ibu) > 2.0 && H(ibu) < 2.2);
check('wajah asli punya lebih banyak bidang (gigi, rongga)', asli.faces.length > ibu.faces.length);
check('wajah asli punya mulut hitam & pupil menyala', asli.faces.some((f) => f.color === '#050202') && asli.faces.some((f) => f.color === '#fff1c4'));
check('wajah Ibu tidak punya rongga hitam', !ibu.faces.some((f) => f.color === '#040202'));
const mid = (m) => m.faces.flatMap((f) => f.pts.map((p) => p[1]));
check('wajah menghadap -Y', Math.min(...mid(ibu)) < -0.05);
// pecahan bagian untuk game
const part = (o) => { const m = G.newModel(); m.nextId = 1; buildPeniru(m, o); return m; };
const body = part({ part: 'body' }), arm = part({ part: 'armL' }), head = part({ part: 'head_ibu', face: 'ibu' });
check('bagian tubuh/lengan/kepala terpisah dan tidak kosong', body.faces.length > 300 && arm.faces.length > 100 && head.faces.length > 300);
check('lengan terlalu panjang (> 1 m dari bahu)', Math.min(...arm.faces.flatMap((f) => f.pts.map((p) => p[2]))) < PN.shoulder - 1.0);
// ekspor OBJ + MTL
const r = G.exportOBJMtl(asli, { mtlName: 'x.mtl' });
check('OBJ memuat mtllib dan usemtl', r.obj.includes('mtllib x.mtl') && r.obj.includes('usemtl m_'));
check('MTL memuat bahan Kd', r.mtl.includes('newmtl m_') && /Kd [0-9.]+ [0-9.]+ [0-9.]+/.test(r.mtl));
check('bahan bertekstur tercatat (batik)', r.materials.some((n) => n.includes('_t_b-batik')));
const nv = r.obj.split('\n').filter((l) => l.startsWith('vn ')).length, nvv = r.obj.split('\n').filter((l) => l.startsWith('v ')).length;
check('satu normal per titik (normal halus)', nv === nvv && nv > 1000);
// tokoh cerita & properti kompleks
const tok = Object.keys(LIBRARY).filter((k) => LIBRARY[k].grp === 'tokoh');
check('4 tokoh cerita', tok.length === 4);
for (const k of tok) {
  const m = libraryModel(k), z = m.faces.flatMap((f) => f.pts.map((p) => p[2]));
  check(`${LIBRARY[k].name}: alas z=0, tinggi 1,45-1,8 m`, Math.abs(Math.min(...z)) < 0.005 && Math.max(...z) > 1.45 && Math.max(...z) < 1.8);
}
const rani = libraryModel('tokoh_rani');
check('Rani berompi oranye + tali kartu', rani.faces.some((f) => f.color === '#e8661a') && rani.faces.some((f) => f.color === '#1f3a5f'));
check('Pak Darmo bertopi satpam + radio', libraryModel('tokoh_darmo').faces.some((f) => f.color === '#202225' ) && libraryModel('tokoh_darmo').faces.some((f) => f.color === '#1b2733'));
for (const k of ['tandon_menara', 'tandon_pendek', 'tiang_listrik', 'ac_outdoor', 'kursi_plastik', 'motor_bebek']) {
  const m = libraryModel(k);
  check(`${k}: ${m.faces.length} bidang, grup kompleks`, LIBRARY[k]?.grp === 'kompleks' && m.faces.length > 50);
}
const tw = libraryModel('tandon_menara');
check('tandon menara tinggi 7-9 m', Math.max(...tw.faces.flatMap((f) => f.pts.map((p) => p[2]))) > 7);
if (fail) { console.log(fail + ' gagal'); process.exit(1); }
console.log('semua lulus');
