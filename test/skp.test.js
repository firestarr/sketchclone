// Pembaca .skp (SketchUp 2021+): berkas sintetis berisi satu komponen persegi 1x1 m
// yang dipasang dua kali (geser & putar), bertag, dengan lubang di tengah.
import { deflateSync } from 'fflate';
import { parseSkp } from '../skp.js';
const ok = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1); } console.log('ok -', m); };

const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const f64 = (...a) => { const b = Buffer.alloc(8 * a.length); a.forEach((v, i) => b.writeDoubleLE(v, 8 * i)); return b; };
const N = (t, ...kids) => {
  const body = Buffer.concat(kids.map((k) => (Buffer.isBuffer(k) ? k : Buffer.from(k, 'latin1'))));
  const h = Buffer.alloc(6); h.writeUInt16LE(t); h.writeUInt32LE(body.length, 2);
  return Buffer.concat([h, body]);
};
const hdr = (id, extra = []) => N(2000, N(1500, N(1502, u16(id))), ...extra);
const IN = 1 / 0.0254;
// komponen: persegi 1 m dengan lubang 0,4 m (koordinat dalam inci)
const sq = (s, o) => [[o, o], [o + s, o], [o + s, o + s], [o, o + s]].map(([x, y]) => [x * IN, y * IN, 0]);
const pts = [...sq(1, 0), ...sq(0.4, 0.3)];
let id = 100;
const vid = pts.map(() => id++);
const verts = N(5001, ...pts.map((p, i) => N(2500, N(1500, N(1502, u16(vid[i]))), N(2501, f64(...p)))));
const eid = [];
const edges = [];
for (const base of [0, 4]) for (let i = 0; i < 4; i++) {
  const e = id++; eid.push(e);
  edges.push(N(3000, hdr(e), N(3001, u16(vid[base + i])), N(3002, u16(vid[base + ((i + 1) % 4)]))));
}
const loop = (es) => N(4500, N(4501, ...es.map((e) => N(4000, N(4001, u16(e)), N(4002, Buffer.from([0]))))));
const face = N(5003, N(3500, hdr(id++, [N(2002, u16(7))]), N(3501, f64(0, 0, 1, 0)), N(3502, loop(eid.slice(4)), loop(eid.slice(0, 4)))));
const DEF = 900, LAYER = 7, L0 = 6;
const def = N(5500, N(5000, hdr(DEF), verts, N(5002, ...edges), face), N(5502, 'Kotak'));
const xf = (tx, ty, rot) => {
  const c = Math.cos(rot), s = Math.sin(rot);
  return N(6502, f64(c, s, 0, -s, c, 0, 0, 0, 1, tx * IN, ty * IN, 0, 1));
};
const inst = (tx, ty, rot) => N(7500, N(6500, hdr(id++, [N(2002, u16(L0)), N(2003, Buffer.from([6]))]), N(6501), xf(tx, ty, rot), N(6503, u16(DEF))));
const layers = N(504, N(15000, N(15001,
  N(15500, N(1500, N(1502, u16(L0))), N(15501, 'Layer0')),
  N(15500, N(1500, N(1502, u16(LAYER))), N(15501, 'DINDING')))));
const dat = N(500, N(502, N(5000, hdr(1), N(5005, inst(2, 0, 0), inst(5, 0, Math.PI / 2)))), layers, N(505, N(6000, N(6001, def))));
// arsip ZIP (local header saja) + header SketchUp UTF-16
const zipEntry = (name, data) => {
  const raw = Buffer.from(deflateSync(data));
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8);
  h.writeUInt32LE(raw.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26);
  return Buffer.concat([h, Buffer.from(name), raw]);
};
const head = Buffer.concat([Buffer.from([0xff, 0xfe, 0xff, 0x0e]), Buffer.from('SketchUp Model', 'utf16le'), Buffer.from([0xff, 0xfe, 0xff, 0x0a]), Buffer.from('{23.1.315}', 'utf16le')]);
const mat = Buffer.from('<mat:material name="Bata" colorRed="200" colorGreen="100" colorBlue="50" />');
const skp = Buffer.concat([head, zipEntry('materials/Bata/material.xml', mat), zipEntry('model.dat', dat)]);

const r = await parseSkp(new Uint8Array(skp));
ok(r.version === 23, 'versi terbaca: ' + r.version);
ok(r.layers.includes('DINDING'), 'tag terbaca');
ok(r.groups.length === 2 && r.groups.every((g) => g.name === 'Kotak'), 'dua instans komponen');
ok(r.groups[0].layer === 'DINDING', 'tag diambil dari geometri di dalam grup');
const f0 = r.groups[0].faces[0];
const outer = f0.loops.reduce((a, l) => (l.length && Math.abs(l[0][0] - 2) < 1e-6 && Math.abs(l[0][1]) < 1e-6 ? l : a), null);
ok(f0.loops.length === 2 && outer, 'bidang dengan lubang, digeser 2 m');
const xs1 = r.groups[1].faces[0].loops.flat().map((p) => p[0]);
ok(Math.abs(Math.min(...xs1) - 4) < 1e-6 && Math.abs(Math.max(...xs1) - 5) < 1e-6, 'instans kedua diputar 90° di x=5');
ok(Math.abs(f0.n[2] - 1) < 1e-9, 'normal ke atas');
let threw = false;
try { await parseSkp(new Uint8Array(Buffer.concat([head, Buffer.alloc(100)]))); } catch (e) { threw = /lama/.test(e.message); }
ok(threw, 'format lama (tanpa model.dat) ditolak dengan pesan jelas');
threw = false;
try { await parseSkp(new Uint8Array(Buffer.from('bukan skp sama sekali, hanya teks biasa yang panjang sekali'))); } catch (e) { threw = /bukan berkas SketchUp/.test(e.message); }
ok(threw, 'berkas bukan SketchUp ditolak');
