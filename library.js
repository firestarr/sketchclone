// Pustaka komponen bawaan (pengganti kecil 3D Warehouse).
// Setiap item dibangun di koordinat lokal: alas di z = 0, berpusat di sumbu X/Y.
import * as THREE from 'three';
import * as G from './geometry.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function face(m, pts, hint, color) {
  const f = G.makeFace(m, pts, hint, color);
  if (f) m.faces.push(f);
  return f;
}
// balok dari (x,y,z) berukuran w x d x h
function box(m, x, y, z, w, d, h, color) {
  const f = face(m, [[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]], V(0, 0, 1), color);
  G.pushPull(m, f.id, h);
}
// silinder tegak
function cyl(m, cx, cy, z, r, h, color, seg = 16) {
  const pts = [...Array(seg)].map((_, i) => [cx + r * Math.cos((i / seg) * Math.PI * 2), cy + r * Math.sin((i / seg) * Math.PI * 2), z]);
  const f = face(m, pts, V(0, 0, 1), color);
  G.pushPull(m, f.id, h);
}
// kerucut tegak (dibuat dari silinder lalu titik atas dikumpulkan ke puncak)
function cone(m, cx, cy, z, r, h, color, seg = 12) {
  const top = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2, b = ((i + 1) / seg) * Math.PI * 2;
    const p = [cx + r * Math.cos(a), cy + r * Math.sin(a), z], q = [cx + r * Math.cos(b), cy + r * Math.sin(b), z];
    top.push(p);
    const sid = m._coneSid ?? (m._coneSid = m.nextId++);
    const f = G.makeFace(m, [p, q, [cx, cy, z + h]], null, color, sid);
    if (f) m.faces.push(f);
  }
  const base = G.makeFace(m, top.slice().reverse(), V(0, 0, -1), color, m._coneSid);
  if (base) m.faces.push(base);
  delete m._coneSid;
}
// silinder mendatar sepanjang sumbu Y (roda)
function wheel(m, cx, y, cz, r, w, color, seg = 16) {
  const pts = [...Array(seg)].map((_, i) => [cx + r * Math.cos((i / seg) * Math.PI * 2), y, cz + r * Math.sin((i / seg) * Math.PI * 2)]);
  const f = face(m, pts, V(0, -1, 0), color);
  G.pushPull(m, f.id, w);
}

const WOOD = '#9c6b3f', DARK = '#3a2f28', WHITE = '#f4f2ec', FABRIC = '#5c7aa6', GREEN = '#3f7d3a', SKIN = '#e0b08a';

export const LIBRARY = {
  meja: {
    name: 'Meja', icon: '▭',
    build(m) {
      box(m, -0.8, -0.45, 0.72, 1.6, 0.9, 0.04, WOOD);
      for (const [x, y] of [[-0.75, -0.4], [0.7, -0.4], [-0.75, 0.35], [0.7, 0.35]]) box(m, x, y, 0, 0.05, 0.05, 0.72, DARK);
    },
  },
  kursi: {
    name: 'Kursi', icon: '⑁',
    build(m) {
      box(m, -0.22, -0.22, 0.43, 0.44, 0.44, 0.04, WOOD);
      for (const [x, y] of [[-0.22, -0.22], [0.18, -0.22], [-0.22, 0.18], [0.18, 0.18]]) box(m, x, y, 0, 0.04, 0.04, 0.43, DARK);
      box(m, -0.22, 0.18, 0.47, 0.44, 0.04, 0.45, WOOD);
    },
  },
  sofa: {
    name: 'Sofa', icon: '⌴',
    build(m) {
      box(m, -1, -0.45, 0, 2, 0.9, 0.42, FABRIC);
      box(m, -1, 0.2, 0.42, 2, 0.25, 0.42, FABRIC);
      box(m, -1, -0.45, 0.42, 0.2, 0.65, 0.2, FABRIC);
      box(m, 0.8, -0.45, 0.42, 0.2, 0.65, 0.2, FABRIC);
    },
  },
  ranjang: {
    name: 'Tempat Tidur', icon: '▬',
    build(m) {
      box(m, -0.85, -1.05, 0, 1.7, 2.1, 0.3, WOOD);
      box(m, -0.8, -1, 0.3, 1.6, 2, 0.22, WHITE);
      box(m, -0.85, 1.05, 0, 1.7, 0.08, 1.0, WOOD);
      box(m, -0.65, 0.55, 0.52, 0.55, 0.35, 0.12, '#dfe6f0');
      box(m, 0.1, 0.55, 0.52, 0.55, 0.35, 0.12, '#dfe6f0');
    },
  },
  lemari: {
    name: 'Lemari', icon: '▯',
    build(m) {
      box(m, -0.6, -0.3, 0, 1.2, 0.6, 2.0, WOOD);
      box(m, -0.02, -0.31, 0.05, 0.04, 0.01, 1.9, DARK);
      box(m, -0.12, -0.34, 0.95, 0.03, 0.03, 0.2, '#c9a227');
      box(m, 0.09, -0.34, 0.95, 0.03, 0.03, 0.2, '#c9a227');
    },
  },
  pintu: {
    name: 'Pintu', icon: '🚪',
    build(m) {
      box(m, -0.5, -0.05, 0, 0.06, 0.1, 2.15, WHITE);
      box(m, 0.44, -0.05, 0, 0.06, 0.1, 2.15, WHITE);
      box(m, -0.5, -0.05, 2.1, 1.0, 0.1, 0.06, WHITE);
      box(m, -0.44, -0.02, 0, 0.88, 0.04, 2.1, '#b5835a');
      cyl(m, 0.32, -0.06, 1.0, 0.03, 0.04, '#c9a227', 10);
    },
  },
  jendela: {
    name: 'Jendela', icon: '⊞',
    build(m) {
      box(m, -0.6, -0.05, 0.9, 1.2, 0.1, 0.06, WHITE);
      box(m, -0.6, -0.05, 2.04, 1.2, 0.1, 0.06, WHITE);
      box(m, -0.6, -0.05, 0.96, 0.06, 0.1, 1.08, WHITE);
      box(m, 0.54, -0.05, 0.96, 0.06, 0.1, 1.08, WHITE);
      box(m, -0.03, -0.05, 0.96, 0.06, 0.1, 1.08, WHITE);
      box(m, -0.54, -0.01, 0.96, 0.51, 0.02, 1.08, '#a9cbe6');
      box(m, 0.03, -0.01, 0.96, 0.51, 0.02, 1.08, '#a9cbe6');
    },
  },
  pohon: {
    name: 'Pohon', icon: '♣',
    build(m) {
      cyl(m, 0, 0, 0, 0.15, 1.6, '#6b4a2b', 10);
      cone(m, 0, 0, 1.2, 1.3, 1.6, GREEN, 12);
      cone(m, 0, 0, 2.2, 1.0, 1.4, '#4b8f43', 12);
      cone(m, 0, 0, 3.1, 0.7, 1.2, '#5aa34f', 12);
    },
  },
  manusia: {
    name: 'Manusia', icon: '☺',
    build(m) {
      box(m, -0.17, -0.09, 0, 0.14, 0.16, 0.85, '#2f3b52');
      box(m, 0.03, -0.09, 0, 0.14, 0.16, 0.85, '#2f3b52');
      box(m, -0.2, -0.11, 0.85, 0.4, 0.22, 0.6, '#c0392b');
      box(m, -0.3, -0.07, 0.8, 0.1, 0.14, 0.62, SKIN);
      box(m, 0.2, -0.07, 0.8, 0.1, 0.14, 0.62, SKIN);
      cyl(m, 0, 0, 1.45, 0.06, 0.06, SKIN, 10);
      cyl(m, 0, 0, 1.51, 0.11, 0.24, SKIN, 14);
    },
  },
  mobil: {
    name: 'Mobil', icon: '🚗',
    build(m) {
      box(m, -2.1, -0.85, 0.3, 4.2, 1.7, 0.65, '#1f5fa8');
      box(m, -1.1, -0.8, 0.95, 2.1, 1.6, 0.55, '#bcd3ea');
      for (const x of [-1.35, 1.35]) {
        wheel(m, x, -0.95, 0.33, 0.33, 0.25, '#202020');
        wheel(m, x, 0.7, 0.33, 0.33, 0.25, '#202020');
      }
    },
  },
  tangga: {
    name: 'Tangga', icon: '⌸',
    build(m) {
      for (let i = 0; i < 10; i++) box(m, -0.5, i * 0.28, 0, 1.0, 0.28, (i + 1) * 0.175, '#c8b49a');
    },
  },
};

const cache = new Map();
export function libraryModel(key) {
  if (!cache.has(key)) {
    const m = G.newModel();
    m.nextId = 1;
    LIBRARY[key].build(m);
    cache.set(key, m);
  }
  return cache.get(key);
}

// Sisipkan item ke model sebagai komponen (instans dari definisi yang sama saling bertaut).
export function insertLibrary(model, key, at, angle = 0, parent = null) {
  const src = libraryModel(key);
  const M = new THREE.Matrix4().makeTranslation(at.x, at.y, at.z).multiply(new THREE.Matrix4().makeRotationZ(angle));
  const gid = model.nextId++;
  model.groups[gid] = { name: LIBRARY[key].name, def: 'lib:' + key, m: M.toArray(), parent };
  const solidMap = new Map();
  const tp = (p) => {
    const v = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(M);
    return [v.x, v.y, v.z];
  };
  const ids = new Set();
  for (const f of src.faces) {
    const nf = structuredClone(f);
    nf.id = model.nextId++;
    nf.pts = f.pts.map(tp);
    nf.holes = f.holes.map((h) => h.map(tp));
    const n = new THREE.Vector3(...f.n).transformDirection(M);
    nf.n = [n.x, n.y, n.z];
    if (f.solid != null) {
      if (!solidMap.has(f.solid)) solidMap.set(f.solid, model.nextId++);
      nf.solid = solidMap.get(f.solid);
    }
    nf.group = gid;
    model.faces.push(nf);
    ids.add(nf.id);
  }
  return { gid, ids };
}
