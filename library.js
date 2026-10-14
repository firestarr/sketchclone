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

// ---- Figur warga bergaya Indonesia (sama dengan warga game Ladang Nusantara) ----
// Badan blok sederhana ala game petani; pakaian khas: batik, lurik, kebaya, sarung, jarik, peci, blangkon,
// udeng, kerudung, caping, selendang, dan seragam SD merah-putih. Menghadap -Y, alas di z = 0.
function slab(m, pts, n, color, t) {
  const f = face(m, pts, n, color);
  if (f) G.pushPull(m, f.id, t);
}
export function buildFigure(m, s) {
  const kid = !!s.kid, H = s.h ?? (kid ? 1.12 : s.female ? 1.56 : 1.66);
  const hs = kid ? 0.27 : 0.22; // ukuran kepala (anak berkepala besar)
  const legTop = H * (kid ? 0.36 : 0.47), torsoTop = H - hs - (kid ? 0.03 : 0.06);
  const tw = kid ? 0.3 : s.female ? 0.32 : 0.38, td = kid ? 0.17 : 0.2;
  const skin = s.skin ?? '#b98256', hair = s.hair ?? '#1c1410', shoe = s.shoes ?? '#2a2018';
  const bottom = s.bottom ?? 'celana', bc = s.bottomColor ?? '#2c3e50', bc2 = s.bottomColor2 ?? '#1b2631';
  const lw = kid ? 0.11 : 0.13;
  // kaki + sepatu
  for (const x of [-tw / 2 + 0.02, tw / 2 - 0.02 - lw]) {
    box(m, x, -0.09, 0, lw, 0.18, 0.06, shoe);
    box(m, x, -0.07, 0.06, lw, 0.14, legTop - 0.06, bottom === 'celana' || bottom === 'rok' ? (bottom === 'rok' ? skin : bc) : skin);
  }
  // bawahan: sarung (kotak-kotak = pita warna berselang), jarik batik, rok
  if (bottom === 'sarung' || bottom === 'jarik' || bottom === 'rok') {
    const z0 = bottom === 'jarik' ? 0.08 : bottom === 'rok' ? legTop * 0.45 : H * 0.2;
    const w = tw + 0.04, d = td + 0.03, n = bottom === 'rok' ? 1 : 6, step = (legTop + 0.02 - z0) / n;
    for (let i = 0; i < n; i++) box(m, -w / 2, -d / 2, z0 + i * step, w, d, step, i % 2 ? bc2 : bc);
    if (bottom === 'sarung') box(m, -w / 2 - 0.005, -d / 2 - 0.005, legTop - 0.06, w + 0.01, d + 0.01, 0.06, bc2); // gulungan
  }
  // badan (baju) + motif batik/lurik sebagai garis/bintik di depan
  const shirt = s.shirt ?? '#c0392b';
  box(m, -tw / 2, -td / 2, legTop, tw, td, torsoTop - legTop, shirt);
  if (s.motif) {
    const mc = s.motifColor ?? '#3b2414', th = torsoTop - legTop;
    if (s.motif === 'lurik') for (let i = 0; i < 5; i++) box(m, -tw / 2 + 0.02 + i * (tw - 0.04) / 5, -td / 2 - 0.006, legTop + 0.02, 0.012, 0.006, th - 0.04, mc);
    else for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const x = -tw / 2 + 0.05 + c * (tw - 0.1) / 2 + (r % 2) * 0.03, z = legTop + 0.05 + r * (th - 0.1) / 2;
      if (s.motif === 'parang') slab(m, [[x - 0.03, -td / 2 - 0.004, z - 0.02], [x - 0.01, -td / 2 - 0.004, z - 0.02], [x + 0.03, -td / 2 - 0.004, z + 0.03], [x + 0.01, -td / 2 - 0.004, z + 0.03]], V(0, -1, 0), mc, 0.004);
      else box(m, x - 0.02, -td / 2 - 0.006, z - 0.02, 0.04, 0.006, 0.04, mc); // kawung/mega: bintik
    }
  }
  if (s.celemek) box(m, -tw / 2 + 0.05, -td / 2 - 0.012, legTop - 0.25, tw - 0.1, 0.012, 0.45, s.female ? '#e9dfc8' : '#6e4a2e');
  // lengan + tangan
  const aw = kid ? 0.08 : 0.09, sleeve = s.sleeve ?? shirt;
  for (const x of [-tw / 2 - aw, tw / 2]) {
    box(m, x, -0.06, torsoTop - (torsoTop - legTop) * (s.longSleeve ? 0.95 : 0.45), aw, 0.12, (torsoTop - legTop) * (s.longSleeve ? 0.95 : 0.45), sleeve);
    box(m, x, -0.06, legTop - 0.05, aw, 0.12, torsoTop - legTop - (torsoTop - legTop) * (s.longSleeve ? 0.95 : 0.45) + 0.05, skin);
  }
  // selendang songket miring di dada
  if (s.selendang) slab(m, [[-tw / 2, -td / 2 - 0.01, torsoTop - 0.02], [-tw / 2 + 0.1, -td / 2 - 0.01, torsoTop - 0.02], [tw / 2, -td / 2 - 0.01, legTop + 0.05], [tw / 2 - 0.1, -td / 2 - 0.01, legTop + 0.05]].reverse(), V(0, -1, 0), s.selendang, 0.01);
  if (s.tas) box(m, -tw / 2 + 0.04, td / 2, legTop + 0.06, tw - 0.08, kid ? 0.1 : 0.12, (torsoTop - legTop) * 0.7, s.tas);
  // leher + kepala blok
  const hz = torsoTop + (kid ? 0.03 : 0.06);
  box(m, -0.04, -0.04, torsoTop, 0.08, 0.08, hz - torsoTop, skin);
  box(m, -hs / 2, -hs / 2, hz, hs, hs, hs * 1.08, skin);
  const fy = -hs / 2 - 0.004, ez = hz + hs * 0.55;
  for (const x of [-hs * 0.22, hs * 0.22 - 0.03]) box(m, x, fy, ez, 0.03, 0.004, kid ? 0.05 : 0.035, '#1a1a1a'); // mata
  box(m, -0.03, fy, hz + hs * 0.25, 0.06, 0.004, 0.012, kid ? '#d9534f' : '#8a4b3a'); // mulut
  if (s.kumis) box(m, -0.045, fy - 0.004, hz + hs * 0.34, 0.09, 0.008, 0.018, hair);
  if (s.janggut) box(m, -hs * 0.35, fy - 0.006, hz - 0.03, hs * 0.7, 0.03, hs * 0.3, hair);
  if (s.kacamata) for (const x of [-hs * 0.3, hs * 0.05]) box(m, x, fy - 0.006, ez - 0.01, hs * 0.25, 0.006, hs * 0.16, '#1c1c1c');
  // rambut (kecuali tertutup kerudung)
  const top = hz + hs * 1.08;
  if (s.head !== 'kerudung') {
    box(m, -hs / 2 - 0.01, -hs / 2 + 0.03, top - 0.05, hs + 0.02, hs - 0.02, 0.07, hair);
    box(m, -hs / 2 - 0.01, hs / 2 - 0.04, hz + (s.longHair ? -0.08 : hs * 0.45), hs + 0.02, 0.05, (s.longHair ? hs + 0.06 : hs * 0.6), hair);
  }
  if (s.sanggul) box(m, -0.05, hs / 2 - 0.01, top - 0.12, 0.1, 0.08, 0.1, hair);
  // penutup kepala khas
  switch (s.head) {
    case 'peci': box(m, -hs / 2 - 0.008, -hs / 2 + 0.005, top - 0.045, hs + 0.016, hs - 0.0, 0.11, '#0e0e10'); break;
    case 'blangkon':
      box(m, -hs / 2 - 0.014, -hs / 2 - 0.004, top - 0.07, hs + 0.028, hs + 0.008, 0.1, s.headColor ?? '#6b3f1d');
      box(m, -hs / 2 - 0.016, -hs / 2 - 0.006, top - 0.03, hs + 0.032, 0.01, 0.02, '#e2c48c');
      box(m, -0.05, hs / 2 - 0.02, top - 0.12, 0.1, 0.08, 0.09, '#3b2414'); break; // mondolan
    case 'udeng':
      box(m, -hs / 2 - 0.012, -hs / 2 - 0.012, top - 0.07, hs + 0.024, hs + 0.024, 0.05, s.headColor ?? '#f2f2ee');
      slab(m, [[-0.04, -hs / 2 - 0.016, top - 0.04], [0.04, -hs / 2 - 0.016, top - 0.04], [0, -hs / 2 - 0.016, top + 0.06]], V(0, -1, 0), s.headColor ?? '#f2f2ee', 0.02); break;
    case 'kerudung': {
      const k = s.headColor ?? '#2e4053';
      box(m, -hs / 2 - 0.02, -hs / 2 + 0.01, hz - 0.02, hs + 0.04, hs + 0.01, hs * 1.08 + 0.06, k);
      box(m, -hs / 2 - 0.02, -hs / 2 - 0.02, top - 0.01, hs + 0.04, 0.04, 0.05, k);
      box(m, -tw / 2 + 0.02, -td / 2 - 0.02, torsoTop - 0.12, tw - 0.04, td + 0.04, 0.14, k); break; // menutup bahu
    }
    case 'caping': cone(m, 0, 0, top - 0.02, kid ? 0.25 : 0.32, 0.16, '#d8b25a', 14); break;
    case 'topi_sd':
      box(m, -hs / 2 - 0.005, -hs / 2 - 0.005, top - 0.06, hs + 0.01, hs + 0.01, 0.08, s.headColor ?? '#c62828');
      box(m, -hs / 2 + 0.02, -hs / 2 - 0.1, top - 0.06, hs - 0.04, 0.1, 0.02, s.headColor ?? '#c62828');
      box(m, -0.02, -hs / 2 - 0.009, top - 0.04, 0.04, 0.004, 0.03, '#f9d71c'); break;
    default: break;
  }
  if (s.pita) for (const x of [-0.07, 0.01]) box(m, x, -0.01, top - 0.01, 0.06, 0.04, 0.05, s.pita);
}

// spesifikasi warga (id sama dengan game) - SD: kemeja putih, bawahan merah
const SD = { shirt: '#f4f4f2', bottomColor: '#c0392b', shoes: '#1d1d1d', tas: '#1565c0' };
export const FIGURES = {
  joko: { name: 'Pak Joko (tukang kayu)', shirt: '#b49674', motif: 'lurik', motifColor: '#4a3020', bottom: 'sarung', bottomColor: '#1e463c', bottomColor2: '#141e28', head: 'blangkon', kumis: true, skin: '#94603c' },
  wulan: { name: 'Wulan (bidan)', female: true, shirt: '#7fc4e8', motif: 'kawung', motifColor: '#2e6f99', bottom: 'rok', bottomColor: '#2e4053', head: 'kerudung', headColor: '#f4f4f2', longSleeve: true, skin: '#c99468' },
  lastri: { name: 'Bu Lastri (penjual jamu)', female: true, shirt: '#f2c94c', motif: 'parang', motifColor: '#7a5a10', bottom: 'jarik', bottomColor: '#78482a', bottomColor2: '#e2c48c', selendang: '#7a1020', sanggul: true, longSleeve: true, skin: '#a87048' },
  udin: { name: 'Pak Udin (pembuat perahu)', shirt: '#1f618d', bottom: 'sarung', bottomColor: '#7a1c28', bottomColor2: '#28264a', head: 'peci', kumis: true, skin: '#7f5132' },
  kartika: { name: 'Kartika (penyelam mutiara)', female: true, shirt: '#48c9b0', motif: 'kawung', motifColor: '#0e6655', bottom: 'celana', bottomColor: '#1b4f72', sanggul: true, longHair: false, skin: '#94603c' },
  rizal: { name: 'Rizal (penjaga mercusuar)', shirt: '#5d6d7e', motif: 'kawung', motifColor: '#1b2631', bottom: 'celana', bottomColor: '#2c3e50', tas: '#7a5232', skin: '#b98256' },
  hana: { name: 'Bu Hana (penjual es kelapa)', female: true, shirt: '#f5b041', motif: 'kawung', motifColor: '#9a5a10', bottom: 'rok', bottomColor: '#5b4a3a', head: 'kerudung', headColor: '#16a085', celemek: true, longSleeve: true, skin: '#c99468' },
  darto: { name: 'Mbah Darto (dalang)', shirt: '#6e2c00', motif: 'parang', motifColor: '#e2c48c', bottom: 'jarik', bottomColor: '#78482a', bottomColor2: '#30200f', head: 'blangkon', janggut: true, hair: '#b3afa8', h: 1.6, skin: '#a87048' },
  sekar: { name: 'Sekar (penari)', female: true, shirt: '#c0392b', motif: 'kawung', motifColor: '#f5d7a0', bottom: 'jarik', bottomColor: '#26345c', bottomColor2: '#e6dec8', selendang: '#e2b33c', sanggul: true, longSleeve: true, skin: '#b98256' },
  yoga: { name: 'Yoga (fotografer alam)', shirt: '#28b463', bottom: 'celana', bottomColor: '#4b5320', head: 'udeng', tas: '#d35400', skin: '#94603c', h: 1.72 },
  liong: { name: 'Koh Liong (toko roti)', shirt: '#b03a2e', motif: 'kawung', motifColor: '#f5d7a0', bottom: 'celana', bottomColor: '#3b3b3b', kacamata: true, skin: '#e7bf98' },
  maya: { name: 'Maya (barista)', female: true, shirt: '#a04000', bottom: 'celana', bottomColor: '#2e2e3a', celemek: true, longHair: true, skin: '#c99468' },
  arif: { name: 'Pak Arif (polisi)', shirt: '#7f8c8d', bottom: 'celana', bottomColor: '#5b4a3a', head: 'peci', kumis: true, h: 1.74, skin: '#b98256' },
  rini: { name: 'Bu Rini (penjahit)', female: true, shirt: '#af7ac5', motif: 'parang', motifColor: '#4a235a', bottom: 'rok', bottomColor: '#4d2c19', head: 'kerudung', headColor: '#7d3c98', kacamata: true, longSleeve: true, skin: '#d9aa7e' },
  putri: { name: 'Putri (anak SD)', kid: true, female: true, ...SD, bottom: 'rok', pita: '#e91e63', tas: '#e91e63', longHair: true, skin: '#c99468' },
  raka: { name: 'Raka (anak SD)', kid: true, ...SD, bottom: 'celana', head: 'topi_sd', skin: '#b98256' },
  bima: { name: 'Bima (anak SD)', kid: true, ...SD, bottom: 'celana', head: 'peci', tas: '#117864', skin: '#7f5132' },
  lala: { name: 'Lala (anak TK)', kid: true, female: true, shirt: '#f7dc6f', bottom: 'rok', bottomColor: '#2e86c1', shoes: '#e8e8e8', pita: '#f1c40f', h: 1.0, skin: '#d9aa7e' },
  adit: { name: 'Adit (anak SD)', kid: true, ...SD, bottom: 'celana', head: 'topi_sd', tas: '#2e7d32', skin: '#94603c' },
  kiki: { name: 'Kiki (anak SD)', kid: true, female: true, ...SD, bottom: 'rok', head: 'kerudung', headColor: '#f4f4f2', tas: '#8e44ad', longSleeve: true, skin: '#c99468' },
};
for (const [k, s] of Object.entries(FIGURES)) LIBRARY['warga_' + k] = { name: s.name, icon: s.kid ? '🧒' : s.female ? '👩' : '👨', grp: 'warga', build: (m) => buildFigure(m, s) };

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
