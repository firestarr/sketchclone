import * as G from '../geometry.js';
import * as THREE from 'three';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const box = (m, x, y, z, w, d, h) => { const f = G.makeFace(m, [[x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z]], V(0,0,1), '#ccc'); m.faces.push(f); G.pushPull(m, f.id, h); return f.solid; };
// 1) dinding ditembus balok -> garis potong di kedua sisi dinding
let m = G.newModel();
box(m, 0, 0, 0, 4, 0.2, 2.5);           // dinding
box(m, 1, -1, 1, 0.5, 2.2, 0.5);        // balok menembus
const before = m.faces.length;
const n = G.intersectFaces(m, new Set(m.faces.map(f => f.id)));
console.log('intersect segments', n, 'faces', before, '->', m.faces.length, 'lines', m.lines.length);
// 2) dinding dari denah tertutup 5x4 tebal 0.15
m = G.newModel();
const fp = G.wallFootprint([[0,0,0],[5,0,0],[5,4,0],[0,4,0]], 0.15, true);
const f = G.makeFace(m, fp.pts, V(0,0,1), '#eee'); f.holes = fp.holes; m.faces.push(f); G.pushPull(m, f.id, 2.8);
const area = m.faces.filter(q => q.n[2] > 0.99).reduce((s, q) => s + G.faceArea(q), 0);
console.log('closed walls faces', m.faces.length, 'top ring area', area.toFixed(3), 'expected', (5.15*4.15 - 4.85*3.85).toFixed(3));
// 3) dinding polyline terbuka L
const fp2 = G.wallFootprint([[10,0,0],[14,0,0],[14,3,0]], 0.2, false);
console.log('open wall pts', fp2.pts.length, JSON.stringify(fp2.pts.map(p => p.map(x => +x.toFixed(2)))));
// 4) atap pelana
const box3 = new THREE.Box3(V(0,0,0), V(5,4,2.8));
const sid = G.gableRoof(m, box3, 30, 0.3, '#a33', null);
const rf = m.faces.filter(q => q.solid === sid);
console.log('roof faces', rf.length, 'ridge z', Math.max(...rf.flatMap(q => q.pts.map(p => p[2]))).toFixed(3), 'expected', (2.8 + 2.3 * Math.tan(Math.PI / 6)).toFixed(3));
// 5) chamfer
console.log('chamfer pts', G.chamferLoop([[0,0,0],[2,0,0],[2,1,0],[0,1,0]], 0.2).length);
