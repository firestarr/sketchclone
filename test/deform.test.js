import * as G from '../geometry.js';
import * as THREE from 'three';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const box = (m, x, y, z, w, d, h) => { const f = G.addFace(m, [[x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z]], V(0,0,1)); G.pushPull(m, f.id, h); return f.solid; };
const ids = (m) => new Set(m.faces.map(f => f.id));
const bb = (m) => { const b = G.bboxOf(m); return [b.min, b.max].map(v => [v.x, v.y, v.z].map(x => +x.toFixed(3))); };
const closed = (m) => { // setiap sisi dipakai genap kali (tanpa retak)
  const c = new Map();
  for (const f of m.faces) for (const l of [f.pts, ...f.holes]) for (let i = 0; i < l.length; i++) { const a = G.key(l[i]), b = G.key(l[(i+1)%l.length]); const k = a < b ? a+'|'+b : b+'|'+a; c.set(k, (c.get(k)||0)+1); }
  return [...c.values()].every(v => v % 2 === 0);
};
let m = G.newModel(); box(m, 0, 0, 0, 0.4, 0.4, 4);
G.deformAxis(m, ids(m), 'bend', 2, 90, 0, 16);
console.log('bend 90 bbox', JSON.stringify(bb(m)), 'faces', m.faces.length, 'closed', closed(m));
m = G.newModel(); box(m, 0, 0, 0, 1, 1, 3);
G.deformAxis(m, ids(m), 'twist', 2, 90, null, 16);
const top = m.faces.find(f => f.n[2] > 0.99 && Math.abs(f.pts[0][2] - 3) < 1e-6);
console.log('twist top corners', top.pts.map(p => p.slice(0,2).map(x => +x.toFixed(2)).join('/')).join(' '), 'closed', closed(m));
m = G.newModel(); box(m, 0, 0, 0, 2, 2, 2);
G.deformAxis(m, ids(m), 'taper', 2, 0.5);
console.log('taper bbox', JSON.stringify(bb(m)), 'top size', (() => { const t = m.faces.find(f => f.n[2] > 0.99); const xs = t.pts.map(p=>p[0]); return (Math.max(...xs)-Math.min(...xs)).toFixed(2); })());
m = G.newModel(); box(m, 0, 0, 0, 2, 1, 1.5);
G.tessellate(m, ids(m), 0.25);
console.log('tessellate faces', m.faces.length, 'closed', closed(m), 'bbox', JSON.stringify(bb(m)));
// komponen cermin bertaut
m = G.newModel(); box(m, 1, 0, 0, 1, 1, 1);
const gid = G.makeGroup(m, ids(m), 'A', true, null);
const cp = G.duplicate(m, ids(m), null);
G.scaleAxes(m, cp, V(0, 0, 0), -1, 1, 1);
const topA = m.faces.find(f => f.group === gid && f.n[2] > 0.99);
G.pushPull(m, topA.id, 1);
G.syncComponent(m, gid);
const other = Object.keys(m.groups).map(Number).find(g => g !== gid);
const of = m.faces.filter(f => f.group === other);
const ok = of.every(f => { const c = f.pts.reduce((s,p)=>s.add(V(...p)), V(0,0,0)).multiplyScalar(1/f.pts.length); return c.sub(V(-1.5,0.5,1)).dot(V(...f.n)) > 0; });
console.log('mirror sync faces', of.length, 'height', Math.max(...of.flatMap(f => f.pts.map(p=>p[2]))), 'x range', Math.min(...of.flatMap(f=>f.pts.map(p=>p[0]))), Math.max(...of.flatMap(f=>f.pts.map(p=>p[0]))), 'normals outward', ok);
