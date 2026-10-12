import * as G from '../geometry.js';
import { booleanSolids } from '../csg.js';
import * as THREE from 'three';
function box(m, x, y, z, w, d, h, color) {
  const f = G.addFace(m, [[x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z]], new THREE.Vector3(0,0,1));
  if (color) f.color = color;
  G.pushPull(m, f.id, h);
  return f.solid;
}
for (const op of ['subtract', 'union', 'intersect']) {
  const m = G.newModel();
  const a = box(m, 0,0,0, 2,2,2);
  const b = box(m, 1,1,1, 2,2,2, '#cc3333');
  const t0 = performance.now();
  const ok = booleanSolids(m, a, b, op) === 'ok';
  const area = m.faces.reduce((s, f) => s + G.faceArea(f), 0);
  console.log(op, ok, 'faces', m.faces.length, 'area', area.toFixed(3), 'holes', m.faces.filter(f=>f.holes.length).length, 'colors', [...new Set(m.faces.map(f=>f.color))].join(' '), (performance.now()-t0).toFixed(0)+'ms');
}
// lubang tembus: kotak dikurangi silinder kecil
const m = G.newModel();
const a = box(m, 0,0,0, 2,2,1);
const c = G.addFace(m, [...Array(16)].map((_,i)=>[1+0.3*Math.cos(i/16*Math.PI*2), 1+0.3*Math.sin(i/16*Math.PI*2), -0.5]), new THREE.Vector3(0,0,1));
G.pushPull(m, c.id, 2);
console.log('hole', booleanSolids(m, a, c.solid, 'subtract'), 'faces', m.faces.length, 'faces with holes', m.faces.filter(f=>f.holes.length).length);
// benda terbuka ditolak
{
  const m2 = G.newModel();
  const f = G.addFace(m2, [[0,0,0],[1,0,0],[1,1,0],[0,1,0]], new THREE.Vector3(0,0,1));
  f.solid = 999;
  const b2 = box(m2, 0.5,0.5,0, 1,1,1);
  console.log('open solid ->', booleanSolids(m2, 999, b2, 'union'));
}
// tekstur dipertahankan
{
  const m3 = G.newModel();
  const a3 = box(m3, 0,0,0, 2,2,2); G.paint(m3, new Set(m3.faces.map(f=>f.id)), '#ffffff', 'b:bata', 1.2);
  const b3 = box(m3, 1,1,1, 2,2,2, '#cc3333');
  console.log('tex kept ->', booleanSolids(m3, a3, b3, 'subtract'), [...new Set(m3.faces.map(f => f.tex))].join(','));
}
