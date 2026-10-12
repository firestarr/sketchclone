import * as G from '../geometry.js';
import * as THREE from 'three';
const area = (m) => m.faces.reduce((s, f) => s + G.faceArea(f), 0);
const box = (m) => { const f = G.addFace(m, [[0,0,0],[2,0,0],[2,1,0],[0,1,0]], new THREE.Vector3(0,0,1)); G.pushPull(m, f.id, 1); return f.solid; };
// cek semua normal menghadap keluar dari titik pusat benda
const outward = (m, c) => m.faces.every(f => { const cen = f.pts.reduce((s,p)=>s.add(new THREE.Vector3(...p)), new THREE.Vector3()).multiplyScalar(1/f.pts.length); return cen.sub(c).dot(new THREE.Vector3(...f.n)) > -1e-6; });
const Z = [0,0,1];
let m = G.newModel(); G.primitive(m, 'sphere', [0,0,0], Z, 1, 0, '#fff');
console.log('sphere faces', m.faces.length, 'area', area(m).toFixed(3), 'vs', (4*Math.PI).toFixed(3), 'outward', outward(m, new THREE.Vector3(0,0,1)));
m = G.newModel(); G.primitive(m, 'cone', [0,0,0], Z, 1, 2, '#fff');
console.log('cone area', area(m).toFixed(3), 'vs', (Math.PI*1 + Math.PI*1*Math.sqrt(5)).toFixed(3), 'outward', outward(m, new THREE.Vector3(0,0,0.5)));
m = G.newModel(); G.primitive(m, 'capsule', [0,0,0], Z, 0.5, 3, '#fff');
console.log('capsule area', area(m).toFixed(3), 'vs', (4*Math.PI*0.25 + 2*Math.PI*0.5*2).toFixed(3), 'outward', outward(m, new THREE.Vector3(0,0,1.5)));
m = G.newModel(); G.primitive(m, 'torus', [0,0,0], Z, 2, 0.5, '#fff');
console.log('torus faces', m.faces.length, 'area', area(m).toFixed(3), 'vs', (4*Math.PI*Math.PI*2*0.5).toFixed(3));
// subdivisi kotak
m = G.newModel(); box(m);
const ids = new Set(m.faces.map(f => f.id));
const res = G.subdivide(m, ids, 2);
console.log('subdiv faces', m.faces.length, 'soft', m.faces.every(f => f.soft), 'outward', outward(m, new THREE.Vector3(1,0.5,0.5)));
// bantal
m = G.newModel(); const s = box(m);
const top = m.faces.find(f => f.n[2] > 0.99);
console.log('roundPrism', G.roundPrism(m, top.id, 0.2), 'faces', m.faces.length, 'outward', outward(m, new THREE.Vector3(1,0.5,0.5)));
const zs = m.faces.flatMap(f => f.pts.map(p => p[2])), xs = m.faces.flatMap(f => f.pts.map(p => p[0]));
console.log(' bbox x', Math.min(...xs).toFixed(3), Math.max(...xs).toFixed(3), 'z', Math.min(...zs).toFixed(3), Math.max(...zs).toFixed(3));
// skala per sumbu & cermin
m = G.newModel(); box(m);
const all = new Set(m.faces.map(f => f.id));
G.scaleAxes(m, all, new THREE.Vector3(1, 0.5, 0.5), 1, 2, 0.5);
console.log('scaleAxes outward', outward(m, new THREE.Vector3(1,0.5,0.5)), 'y range', Math.min(...m.faces.flatMap(f=>f.pts.map(p=>p[1]))), Math.max(...m.faces.flatMap(f=>f.pts.map(p=>p[1]))));
G.scaleAxes(m, all, new THREE.Vector3(1, 0.5, 0.5), -1, 1, 1);
console.log('mirror outward', outward(m, new THREE.Vector3(1,0.5,0.5)));
