import * as G from '../geometry.js';
import { booleanSolids, isClosedSolid } from '../csg.js';
import * as THREE from 'three';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const m = G.newModel();
const newSolid = (before) => [...new Set(m.faces.map((f) => f.solid))].find((s) => !before.has(s));
const solids = () => new Set(m.faces.map((f) => f.solid));
const ell = (c, rx, ry, rz) => { const r = G.primitive(m, 'sphere', [c[0], c[1], c[2] - rz], [0,0,1], rz, 0, '#5a1712', 40); G.scaleAxes(m, new Set(r.ids), V(...c), rx/rz, ry/rz, 1); return r.sid; };
const box = (x, y, z, w, d, h) => { const f = G.makeFace(m, [[x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z]], V(0,0,1), '#5a1712'); m.faces.push(f); G.pushPull(m, f.id, h); return f.solid; };
const cav = ell([0, -0.19, 1.7], 0.42, 0.22, 0.5);
const cap = box(-0.84, -0.65, 1.7, 1.68, 1, 1);
let b = solids();
console.log('cav-cap', booleanSolids(m, cav, cap, 'subtract'));
let cut = newSolid(b);
console.log('cav closed', isClosedSolid(m, cut));
for (const [x, z, r] of [[-0.62, 2.43, 0.075], [0.47, 2.47, 0.06], [-0.6, 1.5, 0.05]]) {
  const s = G.primitive(m, 'sphere', [x, -0.25 - r * 0.45, z - r], [0,0,1], r, 0, '#a9a032', 20).sid;
  b = solids();
  const res = booleanSolids(m, cut, s, 'union');
  const ns = newSolid(b);
  console.log('union', res, 'new', ns != null, 'closed', ns != null && isClosedSolid(m, ns));
  if (ns != null) cut = ns;
}
