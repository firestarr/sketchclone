import * as G from '../geometry.js';
import * as THREE from 'three';
const m = G.newModel();
const box = (x) => { const f = G.addFace(m, [[x,0,0],[x+1,0,0],[x+1,1,0],[x,1,0]], new THREE.Vector3(0,0,1)); G.pushPull(m, f.id, 1); return f.solid; };
box(0); box(2);
const all = new Set(m.faces.map(f => f.id));
const leftIds = new Set(m.faces.filter(f => f.pts.every(p => p[0] <= 1.01)).map(f => f.id));
// grup dalam: kotak kiri; lalu komponen luar memuat keduanya
const inner = G.makeGroup(m, leftIds, 'Dalam', false, null);
const outer = G.makeGroup(m, all, 'Luar', true, null);
console.log('inner parent', m.groups[inner].parent === outer, 'tree size', G.entitiesInTree(m, outer).size, 'topUnder', G.topUnder(m, inner, null) === outer);
// salin komponen luar
const copy = G.duplicate(m, G.entitiesInTree(m, outer), null);
G.translate(m, copy, new THREE.Vector3(0, 5, 0));
const gids = Object.keys(m.groups).map(Number);
console.log('groups after dup', gids.length, 'copy faces', copy.size);
// edit grup dalam pada salinan pertama -> tarik atas, lalu sinkronkan komponen luar
const topFace = m.faces.find(f => f.group === inner && f.n[2] > 0.99);
G.pushPull(m, topFace.id, 1);
G.syncComponent(m, outer);
const maxZ = (g) => Math.max(...[...G.entitiesInTree(m, g)].map(id => m.faces.find(f => f.id === id)).filter(Boolean).flatMap(f => f.pts.map(p => p[2])));
const outers = gids.filter(g => m.groups[g] && m.groups[g].def === m.groups[outer].def);
console.log('heights', outers.map(maxZ), 'groups', Object.keys(m.groups).length);
// urai luar
G.explode(m, new Set([outer]));
console.log('after explode inner parent', m.groups[inner].parent);
// tekstur ikut bergerak
const f = m.faces[0]; G.paint(m, new Set([f.id]), '#ffffff', 'b:kayu', 1); G.ensureUV(f); const o0 = f.uv.o.slice();
G.translate(m, new Set([f.id]), new THREE.Vector3(1, 0, 0)); console.log('uv moved', o0[0], '->', f.uv.o[0]);
