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
// Tubuh dibangun dari bentuk putar halus (lathe) dengan proporsi manusia nyata (dewasa ~7,5 kepala, anak ~5,5),
// penampang elips (badan lebih lebar daripada tebal). Pakaian khas: batik, lurik, kebaya, sarung, jarik, peci,
// blangkon, udeng, kerudung, caping, selendang songket, seragam SD merah-putih. Menghadap -Y, alas di z = 0.
function slab(m, pts, n, color, t) {
  const f = face(m, pts, n, color);
  if (f) G.pushPull(m, f.id, t);
}
// bentuk putar di titik c sepanjang sumbu n, lalu diskalakan (sx, sy, sz) terhadap c; semua bidang dihaluskan
function rev(m, c, n, prof, color, o = {}) {
  const { ids } = G.lathe(m, c, n, prof, o.seg ?? 16, false, color);
  const set = new Set(ids), sx = o.sx ?? 1, sy = o.sy ?? 1, sz = o.sz ?? 1;
  for (const f of m.faces) {
    if (!set.has(f.id)) continue;
    if (sx !== 1 || sy !== 1 || sz !== 1) {
      f.pts = f.pts.map((p) => [c[0] + (p[0] - c[0]) * sx, c[1] + (p[1] - c[1]) * sy, c[2] + (p[2] - c[2]) * sz]);
      const nv = G.newellNormal(f.pts).normalize();
      f.n = [nv.x, nv.y, nv.z];
    }
    f.soft = true;
    if (o.tex) {
      f.tex = o.tex;
      f.texScale = o.texScale ?? 0.3;
    }
  }
  return ids;
}
const ell = (R, a0, a1, n, cz = 0) => [...Array(n + 1)].map((_, i) => {
  const a = a0 + ((a1 - a0) * i) / n;
  return [Math.max(0, R * Math.cos(a)), cz + R * Math.sin(a)];
});
const UP = [0, 0, 1];

export function buildFigure(m, s) {
  const kid = !!s.kid, fem = !!s.female;
  const H = s.h ?? (kid ? 1.15 : fem ? 1.56 : 1.68);
  const k = H / 1.7; // skala lebar
  const hh = kid ? H / 5.4 : H / 7.4; // tinggi kepala (dagu - ubun-ubun)
  const chin = H - hh;
  const Z = kid
    ? { ankle: 0.05, knee: 0.25, crotch: 0.41, hip: 0.46, waist: 0.53, chest: 0.63, shoulder: 0.72, neck: 0.75 }
    : { ankle: 0.045, knee: 0.28, crotch: 0.47, hip: 0.52, waist: 0.6, chest: 0.72, shoulder: 0.815, neck: 0.835 };
  for (const key in Z) Z[key] *= H;
  const W = kid
    ? { hip: 0.15, waist: 0.14, chest: 0.15, shoulder: 0.165 }
    : fem ? { hip: 0.175, waist: 0.125, chest: 0.155, shoulder: 0.17 } : { hip: 0.165, waist: 0.145, chest: 0.175, shoulder: 0.2 };
  for (const key in W) W[key] *= kid ? H / 1.15 : k;
  const skin = s.skin ?? '#b98256', hair = s.hair ?? '#1c1410', shoe = s.shoes ?? '#2a2018';
  const shirt = s.shirt ?? '#c0392b', shirtTex = s.shirtTex ? { tex: s.shirtTex, texScale: s.texScale ?? (kid ? 0.2 : 0.28) } : {};
  const bottom = s.bottom ?? 'celana', bc = s.bottomColor ?? '#2c3e50';
  const pantsCol = bottom === 'celana' ? bc : skin; // di bawah sarung/jarik/rok: kaki (tidak terlihat)
  const legX = W.hip * 0.5, dep = 0.62; // tebal badan = 62% lebar
  // ---- kaki
  const thigh = W.hip * 0.47, kneeR = thigh * 0.62, calf = thigh * 0.68, ankleR = thigh * 0.42;
  for (const sx of [-1, 1]) {
    const x = sx * legX;
    const prof = [[0, 0], [ankleR, 0.005], [calf, Z.knee * 0.55 - Z.ankle], [kneeR, Z.knee - Z.ankle], [thigh, Z.crotch - Z.ankle - 0.04], [thigh * 1.05, Z.crotch - Z.ankle + 0.03], [0, Z.crotch - Z.ankle + 0.04]];
    if (s.shorts) {
      rev(m, [x, 0, Z.ankle], UP, prof.slice(0, 5).concat([[0, Z.crotch - Z.ankle - 0.04]]), skin, { sy: 0.95 });
      rev(m, [x, 0, Z.knee + 0.04], UP, [[0, 0], [thigh * 1.12, 0], [thigh * 1.12, Z.crotch - Z.knee], [0, Z.crotch - Z.knee + 0.02]], bc, { sy: 0.95 });
    } else rev(m, [x, 0, Z.ankle], UP, prof, pantsCol, { sy: 0.95 });
    // sepatu/sandal: memanjang ke depan (-Y), dipipihkan
    const fl = (kid ? 0.17 : 0.25) * (kid ? 1 : k);
    rev(m, [x, 0.045 * k, ankleR * 1.25 * 0.75], [0, -1, 0], [[0, 0], [ankleR * 0.9, 0.01], [ankleR * 1.25, fl * 0.3], [ankleR * 1.15, fl * 0.8], [ankleR * 0.6, fl * 0.98], [0, fl]], shoe, { sz: 0.75, seg: 12 });
  }
  // ---- panggul + badan (bawah: warna celana/kain, atas: baju)
  const shirtBottom = s.tuck ? Z.waist : Z.hip - 0.02 * k;
  rev(m, [0, 0, Z.crotch - 0.03], UP, [[0, 0], [W.hip * 0.75, 0.01], [W.hip, Z.hip - Z.crotch], [W.waist * 1.02, shirtBottom - Z.crotch + 0.04], [0, shirtBottom - Z.crotch + 0.05]], bottom === 'celana' ? bc : (bottom === 'rok' ? bc : skin), { sy: dep });
  const neckR = 0.05 * k * (kid ? 1.1 : 1);
  rev(m, [0, 0, shirtBottom], UP, [[0, 0], [W.waist * 1.05 + (fem ? 0.01 : 0), 0.01], [W.waist * 1.03, Z.waist - shirtBottom], [W.chest, Z.chest - shirtBottom], [W.shoulder, Z.shoulder - shirtBottom - 0.02], [W.shoulder * 0.7, Z.neck - shirtBottom], [neckR * 1.3, Z.neck - shirtBottom + 0.012], [0, Z.neck - shirtBottom + 0.014]], shirt, { sy: dep, ...shirtTex });
  // ---- leher + kepala
  rev(m, [0, 0.008, Z.neck - 0.02], UP, [[0, 0], [neckR, 0], [neckR * 0.95, chin - Z.neck + 0.05], [0, chin - Z.neck + 0.06]], skin);
  const rw = hh * (kid ? 0.47 : 0.41); // jari-jari kepala
  const headProf = [[0, 0], [rw * 0.5, hh * 0.03], [rw * 0.82, hh * 0.18], [rw * 0.98, hh * 0.42], [rw, hh * 0.58], [rw * 0.88, hh * 0.8], [rw * 0.55, hh * 0.95], [0, hh]];
  rev(m, [0, 0, chin], UP, headProf, skin, { sx: 0.9, sy: 1.08, seg: 20 });
  const front = -rw * 1.08; // permukaan wajah (y)
  // cangkang mengikuti bentuk kepala: bagian profil di atas zFrom, diperbesar f
  const shell = (f, zFrom) => {
    const pts = headProf.filter(([, z]) => z >= zFrom * hh).map(([r, z]) => [r * f, hh * 0.5 + (z - hh * 0.5) * f]);
    const [r0, z0] = pts[0];
    return [[r0 * 0.98, z0 - 0.004], ...pts];
  };
  // telinga
  for (const sx of [-1, 1]) rev(m, [sx * rw * 0.88, 0.01, chin + hh * 0.4], UP, ell(hh * 0.09, -Math.PI / 2, Math.PI / 2, 6), skin, { sx: 0.5, seg: 8 });
  // mata, alis, hidung, mulut
  const eyeZ = chin + hh * (kid ? 0.5 : 0.55), eyeX = rw * 0.34;
  for (const sx of [-1, 1]) {
    rev(m, [sx * eyeX, front * 0.9, eyeZ - 0.011], UP, ell(kid ? 0.012 : 0.009, -Math.PI / 2, Math.PI / 2, 4), '#f4f1ea', { sx: 1.35, sy: 0.5, seg: 8 });
    rev(m, [sx * eyeX, front * 0.93, eyeZ - 0.008], UP, ell(kid ? 0.009 : 0.0068, -Math.PI / 2, Math.PI / 2, 4), '#2a1a12', { sy: 0.5, seg: 8 });
    box(m, sx * eyeX - 0.017, front * 0.92 - 0.003, eyeZ + 0.02, 0.034, 0.005, 0.005, hair);
  }
  rev(m, [0, front * 0.94, chin + hh * 0.36], [0, -1, 0], [[0, 0], [0.014 * k, 0.002], [0.004, 0.026 * k], [0, 0.028 * k]], skin, { seg: 8, sz: 1.3 });
  box(m, -0.018 * k, front * 0.86 - 0.004, chin + hh * 0.22, 0.036 * k, 0.006, 0.008, kid ? '#c0504d' : '#8a4b3a');
  if (s.kumis) box(m, -0.028 * k, front * 0.88 - 0.008, chin + hh * 0.27, 0.056 * k, 0.01, 0.012, hair);
  if (s.janggut) rev(m, [0, front * 0.62, chin + hh * 0.02], UP, ell(rw * 0.5, -Math.PI / 2, Math.PI / 2, 6), hair, { sy: 0.45, sz: 0.7, seg: 12 });
  if (s.kacamata) for (const sx of [-1, 1]) {
    const x = sx * eyeX;
    box(m, x - 0.022, front * 0.97 - 0.006, eyeZ - 0.016, 0.044, 0.004, 0.004, '#1c1c1c');
    box(m, x - 0.022, front * 0.97 - 0.006, eyeZ + 0.014, 0.044, 0.004, 0.004, '#1c1c1c');
  }
  // ---- rambut (tidak tampak bila memakai kerudung)
  const hc = chin + hh * 0.5;
  if (s.head !== 'kerudung') {
    rev(m, [0, rw * 0.07, chin], UP, shell(1.06, 0.6), hair, { sx: 0.9, sy: 1.08, seg: 20 });
    rev(m, [0, rw * 0.38, chin + hh * 0.42], UP, ell(rw * 0.86, -Math.PI / 2, Math.PI / 2, 8), hair, { sx: 1.0, sy: 0.75, seg: 16 });
    if (s.longHair) rev(m, [0, rw * 0.62, Z.shoulder - 0.08 * k], UP, [[0, 0], [rw * 0.8, 0.02], [rw * 0.92, chin + hh * 0.55 - Z.shoulder + 0.08 * k], [0, chin + hh * 0.75 - Z.shoulder + 0.08 * k]], hair, { sy: 0.42, seg: 12 });
    if (s.sanggul) rev(m, [0, rw * 1.05, chin + hh * 0.5], UP, ell(rw * 0.42, -Math.PI / 2, Math.PI / 2, 6), hair, { sy: 0.8, seg: 12 });
  }
  // ---- lengan (+ lengan baju) dan tangan
  const armLen = (kid ? 0.33 : 0.37) * H, upper = armLen * 0.48;
  const aR = W.shoulder * (kid ? 0.3 : 0.27);
  const sleeveLen = s.longSleeve ? armLen * 0.95 : upper * 0.62;
  for (const sx of [-1, 1]) {
    const tilt = 0.1, n = [sx * Math.sin(tilt), 0, -Math.cos(tilt)];
    const c = [sx * (W.shoulder - aR * 0.6), 0, Z.shoulder - 0.03 * k];
    rev(m, c, n, [[0, 0], [aR * 0.9, 0.01], [aR, upper * 0.3], [aR * 0.78, upper], [aR * 0.74, upper + 0.03], [aR * 0.58, armLen - 0.01], [0, armLen]], skin, { seg: 12 });
    rev(m, c, n, [[0, -0.01], [aR * 1.12, 0.0], [aR * 1.14, Math.min(sleeveLen, upper) * 0.5], [s.longSleeve ? aR * 0.7 : aR * 1.05, sleeveLen], [0, sleeveLen + 0.002]], shirt, { seg: 12, ...shirtTex });
    const w = [c[0] + n[0] * armLen, c[1], c[2] + n[2] * armLen];
    rev(m, [w[0], w[1], w[2] - 0.075 * (kid ? 0.75 : k)], UP, [[0, 0], [aR * 0.55, 0.012], [aR * 0.8, 0.045 * k], [aR * 0.68, 0.075 * k], [0, 0.085 * k]], skin, { sx: 0.6, seg: 10 });
  }
  // ---- bawahan: sarung, jarik (batik panjang), rok
  if (bottom === 'sarung' || bottom === 'jarik' || bottom === 'rok') {
    const z0 = bottom === 'jarik' ? Z.ankle + 0.02 : bottom === 'rok' ? (kid ? Z.knee - 0.02 : Z.knee - 0.08) : H * 0.2;
    const r1 = W.hip * 1.07, r0 = bottom === 'jarik' ? W.hip * 0.82 : bottom === 'rok' ? W.hip * 1.18 : W.hip * 1.0;
    const tex = s.bottomTex ? { tex: s.bottomTex, texScale: 0.32 } : {};
    rev(m, [0, 0, z0], UP, [[0, 0], [r0, 0], [r1, Z.hip - z0], [W.waist * 1.08, Z.waist - z0 + 0.01], [0, Z.waist - z0 + 0.012]], bc, { sy: dep * 1.08, seg: 20, ...tex });
    if (bottom === 'sarung') rev(m, [0, 0, Z.waist - 0.05 * k], UP, [[0, 0], [W.waist * 1.12, 0], [W.waist * 1.14, 0.03], [W.waist * 1.1, 0.06 * k], [0, 0.062 * k]], s.bottomColor2 ?? bc, { sy: dep * 1.1, seg: 20, ...tex });
  }
  // ---- selendang songket (pita miring di dada), celemek, tas
  const chestY = -W.chest * dep - 0.008;
  if (s.selendang) {
    const f = face(m, [[-W.shoulder * 0.7, chestY, Z.shoulder - 0.02], [-W.shoulder * 0.7 + 0.09, chestY, Z.shoulder - 0.02], [W.waist, chestY + 0.02, Z.waist - 0.04], [W.waist - 0.09, chestY + 0.02, Z.waist - 0.04]].reverse(), V(0, -1, 0), s.selendang);
    if (f) {
      f.tex = 'b:songket';
      f.texScale = 0.12;
      G.pushPull(m, f.id, 0.008);
    }
  }
  if (s.celemek) box(m, -W.waist * 0.75, -W.chest * dep - 0.02, Z.knee + 0.12 * k, W.waist * 1.5, 0.01, Z.chest - Z.knee - 0.12 * k, fem ? '#ece4d0' : '#6e4a2e');
  if (s.tas) box(m, -W.chest * 0.6, W.chest * dep - 0.01, Z.waist, W.chest * 1.2, kid ? 0.1 : 0.13, (Z.shoulder - Z.waist) * 0.85, s.tas);
  // ---- rompi kerja (reflektif), tali kartu pengenal, ikat pinggang + radio (satpam), kuncir kuda
  if (s.vest) {
    const vb = shirtBottom + 0.03, vt = Z.shoulder - 0.035;
    rev(m, [0, 0, vb], UP, [[0, 0], [W.waist * 1.1, 0.0], [W.waist * 1.1, Z.waist - vb], [W.chest * 1.09, Z.chest - vb], [W.shoulder * 0.9, vt - vb], [W.shoulder * 0.55, vt - vb + 0.012], [0, vt - vb + 0.013]], s.vest, { sy: dep * 1.04, seg: 20 });
    for (const dz of [0.1, 0.21]) {
      const zz = Z.waist + dz;
      const r = W.waist * 1.1 + (W.chest * 1.09 - W.waist * 1.1) * (dz / (Z.chest - Z.waist));
      rev(m, [0, 0, zz], UP, [[r * 1.003, 0], [r * 1.003, 0.032]], s.vestStripe ?? '#e8e6d0', { sy: dep * 1.04, seg: 20 });
    }
  }
  if (s.lanyard) {
    const fy = -W.chest * dep * 1.12 - 0.006;
    for (const sx of [-1, 1]) {
      const a = [sx * neckR * 1.3, -neckR * 0.6, Z.neck - 0.01], b = [sx * 0.012, fy, Z.chest - 0.02];
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d);
      rev(m, a, d.map((v) => v / L), [[0.004, 0], [0.004, L]], s.lanyard, { seg: 5 });
    }
    box(m, -0.035, fy - 0.006, Z.chest - 0.12, 0.07, 0.006, 0.095, '#f2f2f2');
    box(m, -0.035, fy - 0.0075, Z.chest - 0.04, 0.07, 0.002, 0.018, s.lanyard);
  }
  if (s.belt) {
    rev(m, [0, 0, Z.waist - 0.03], UP, [[W.waist * 1.075, 0], [W.waist * 1.075, 0.05]], '#17171a', { sy: dep * 1.06, seg: 20 });
    box(m, W.waist * 0.75, -0.06, Z.waist - 0.07, 0.045, 0.045, 0.16, '#202225'); // radio HT di pinggang kanan
    box(m, -0.03, -W.waist * dep * 1.1 - 0.012, Z.waist - 0.03, 0.06, 0.01, 0.05, '#c9a227');   // gesper
  }
  if (s.ponytail) rev(m, [0, rw * 1.02, chin + hh * 0.5], UP, [[0.03, 0.02], [0.034, -0.03], [0.028, -0.12], [0.016, -0.22], [0, -0.26]], hair, { sy: 0.9, seg: 8 });
  // ---- penutup kepala khas
  const top = H;
  switch (s.head) {
    case 'peci':
      rev(m, [0, 0.005, chin + hh * 0.7], UP, [[0, 0], [rw * 1.04, 0], [rw * 1.0, hh * 0.34], [0, hh * 0.35]], '#111114', { sx: 0.9, sy: 1.1, seg: 20 });
      break;
    case 'blangkon':
      rev(m, [0, rw * 0.05, chin], UP, shell(1.11, 0.56), s.headColor ?? '#6b3f1d', { sx: 0.9, sy: 1.08, seg: 20, tex: 'b:batik_parang', texScale: 0.15 });
      rev(m, [0, rw * 1.05, chin + hh * 0.48], UP, ell(rw * 0.38, -Math.PI / 2, Math.PI / 2, 6), '#3b2414', { sy: 0.9, seg: 12 }); // mondolan
      break;
    case 'udeng':
      rev(m, [0, 0, chin + hh * 0.62], UP, [[rw * 1.08, 0], [rw * 1.1, hh * 0.08], [rw * 1.06, hh * 0.16]], s.headColor ?? '#f2f2ee', { sx: 0.92, sy: 1.08, seg: 20, tex: 'b:poleng', texScale: 0.08 });
      rev(m, [0, front * 0.98, chin + hh * 0.72], UP, [[0, 0], [0.03 * k, 0], [0, 0.09 * k]], s.headColor ?? '#f2f2ee', { sy: 0.5, seg: 8, tex: 'b:poleng', texScale: 0.08 });
      break;
    case 'kerudung': {
      const kc = s.headColor ?? '#2e4053';
      rev(m, [0, rw * 0.32, chin], UP, [[0, -0.01], ...shell(1.13, 0.03)], kc, { sx: 0.92, sy: 1.04, seg: 20 });
      rev(m, [0, rw * 0.15, Z.shoulder - 0.06 * k], UP, [[0, 0], [W.shoulder * 0.92, 0], [rw * 1.0, chin - Z.shoulder + 0.08 * k + hh * 0.05], [0, chin - Z.shoulder + 0.1 * k + hh * 0.05]], kc, { sy: dep * 1.15, seg: 20 });
      break;
    }
    case 'caping':
      cone(m, 0, 0, top - hh * 0.12, (kid ? 0.25 : 0.33) * k, 0.17 * k, '#d8b25a', 16);
      break;
    case 'topi_satpam': {
      const tc = s.headColor ?? '#1b2733';
      rev(m, [0, 0.01, chin + hh * 0.62], UP, [[0, 0], [rw * 1.1, 0], [rw * 1.08, hh * 0.2], [rw * 0.86, hh * 0.36], [0, hh * 0.4]], tc, { sx: 0.92, sy: 1.12, seg: 20 });
      rev(m, [0, front * 1.0, chin + hh * 0.64], UP, [[0, 0], [rw * 0.8, 0], [rw * 0.8, 0.007], [0, 0.007]], '#101216', { sy: 0.85, seg: 16 });
      box(m, -0.02, front * 1.03, chin + hh * 0.73, 0.04, 0.005, 0.03, '#c9a227');
      break;
    }
    case 'topi_sd': {
      const tc = s.headColor ?? '#c62828';
      rev(m, [0, rw * 0.05, chin], UP, shell(1.09, 0.62), tc, { sx: 0.9, sy: 1.08, seg: 20 });
      rev(m, [0, front * 1.12, chin + hh * 0.7], UP, [[0, 0], [rw * 0.7, 0], [rw * 0.7, 0.012], [0, 0.012]], tc, { sy: 0.7, seg: 16 });
      box(m, -0.02, front * 1.02, chin + hh * 0.76, 0.04, 0.005, 0.035, '#f9d71c');
      break;
    }
    default: break;
  }
  if (s.pita) for (const sx of [-1, 1]) rev(m, [sx * rw * 0.25, rw * 0.5, top - hh * 0.06], UP, ell(rw * 0.2, -Math.PI / 2, Math.PI / 2, 4), s.pita, { sx: 1.2, sy: 0.45, seg: 8 });
}

// spesifikasi warga (id sama dengan game) - SD: kemeja putih, bawahan merah
const SD = { shirt: '#f4f4f2', bottomColor: '#c0392b', shoes: '#1d1d1d', tas: '#1565c0', tuck: true };
export const FIGURES = {
  joko: { name: 'Pak Joko (tukang kayu)', shirt: '#b49674', shirtTex: 'b:lurik', bottom: 'sarung', bottomColor: '#1e463c', bottomTex: 'b:sarung_hijau', head: 'blangkon', kumis: true, skin: '#94603c' },
  wulan: { name: 'Wulan (bidan)', female: true, shirt: '#7fc4e8', bottom: 'rok', bottomColor: '#2e4053', head: 'kerudung', headColor: '#f4f4f2', longSleeve: true, skin: '#c99468' },
  lastri: { name: 'Bu Lastri (penjual jamu)', female: true, shirt: '#e8b830', shirtTex: 'b:batik_kawung_kuning', bottom: 'jarik', bottomColor: '#784824', bottomTex: 'b:batik_parang', selendang: '#7a1020', sanggul: true, longSleeve: true, skin: '#a87048' },
  udin: { name: 'Pak Udin (pembuat perahu)', shirt: '#1f618d', bottom: 'sarung', bottomColor: '#7a1c28', bottomTex: 'b:sarung_merah', head: 'peci', kumis: true, skin: '#7f5132' },
  kartika: { name: 'Kartika (penyelam mutiara)', female: true, shirt: '#285ca0', shirtTex: 'b:batik_mega', bottom: 'celana', bottomColor: '#1b4f72', sanggul: true, skin: '#94603c' },
  rizal: { name: 'Rizal (penjaga mercusuar)', shirt: '#285ca0', shirtTex: 'b:batik_mega', bottom: 'celana', bottomColor: '#2c3e50', tas: '#7a5232', skin: '#b98256' },
  hana: { name: 'Bu Hana (penjual es kelapa)', female: true, shirt: '#f5b041', bottom: 'rok', bottomColor: '#5b4a3a', head: 'kerudung', headColor: '#16a085', celemek: true, longSleeve: true, skin: '#c99468' },
  darto: { name: 'Mbah Darto (dalang)', shirt: '#2e6b3a', shirtTex: 'b:batik_parang_hijau', bottom: 'jarik', bottomColor: '#784824', bottomTex: 'b:batik_parang', head: 'blangkon', janggut: true, hair: '#b3afa8', h: 1.62, skin: '#a87048' },
  sekar: { name: 'Sekar (penari)', female: true, shirt: '#a8322a', shirtTex: 'b:batik_kawung_merah', bottom: 'jarik', bottomColor: '#26345c', bottomTex: 'b:batik_kawung', selendang: '#e2b33c', sanggul: true, longSleeve: true, skin: '#b98256' },
  yoga: { name: 'Yoga (fotografer alam)', shirt: '#28b463', bottom: 'celana', bottomColor: '#4b5320', head: 'udeng', tas: '#d35400', skin: '#94603c', h: 1.74 },
  liong: { name: 'Koh Liong (toko roti)', shirt: '#a8322a', shirtTex: 'b:batik_kawung_merah', bottom: 'celana', bottomColor: '#3b3b3b', kacamata: true, skin: '#e7bf98' },
  maya: { name: 'Maya (barista)', female: true, shirt: '#a04000', bottom: 'celana', bottomColor: '#2e2e3a', celemek: true, longHair: true, skin: '#c99468' },
  arif: { name: 'Pak Arif (polisi)', shirt: '#8a7a5a', bottom: 'celana', bottomColor: '#5b4a3a', head: 'peci', kumis: true, tuck: true, h: 1.75, skin: '#b98256' },
  rini: { name: 'Bu Rini (penjahit)', female: true, shirt: '#784824', shirtTex: 'b:batik_parang', bottom: 'rok', bottomColor: '#4d2c19', head: 'kerudung', headColor: '#7d3c98', kacamata: true, longSleeve: true, skin: '#d9aa7e' },
  putri: { name: 'Putri (anak SD)', kid: true, female: true, ...SD, bottom: 'rok', pita: '#e91e63', tas: '#e91e63', longHair: true, skin: '#c99468' },
  raka: { name: 'Raka (anak SD)', kid: true, ...SD, bottom: 'celana', shorts: true, head: 'topi_sd', skin: '#b98256' },
  bima: { name: 'Bima (anak SD)', kid: true, ...SD, bottom: 'celana', shorts: true, head: 'peci', tas: '#117864', skin: '#7f5132' },
  lala: { name: 'Lala (anak TK)', kid: true, female: true, shirt: '#f7dc6f', bottom: 'rok', bottomColor: '#2e86c1', shoes: '#e8e8e8', pita: '#f1c40f', h: 1.02, tuck: true, skin: '#d9aa7e' },
  adit: { name: 'Adit (anak SD)', kid: true, ...SD, bottom: 'celana', shorts: true, head: 'topi_sd', tas: '#2e7d32', skin: '#94603c' },
  kiki: { name: 'Kiki (anak SD)', kid: true, female: true, ...SD, bottom: 'rok', head: 'kerudung', headColor: '#f4f4f2', tas: '#8e44ad', longSleeve: true, skin: '#c99468' },
};
// ---- tokoh cerita "Alamat Terakhir" (grup 'tokoh'; tidak dihitung dalam 20 figur warga)
export const TOKOH = {
  rani: { name: 'Rani (petugas pendataan)', female: true, h: 1.58, shirt: '#e9e6df', bottom: 'celana', bottomColor: '#20232a', shoes: '#d9d9d6', vest: '#e8661a', lanyard: '#1f3a5f', ponytail: true, tas: '#17171a', skin: '#c99468', hair: '#1a1210', longSleeve: true },
  darmo: { name: 'Pak Darmo (satpam)', h: 1.69, shirt: '#8da0b3', bottom: 'celana', bottomColor: '#1b2733', shoes: '#101216', head: 'topi_satpam', belt: true, tuck: true, longSleeve: true, kumis: true, skin: '#8f5d3a' },
  tini: { name: 'Bu Tini (warung)', female: true, h: 1.52, shirt: '#8e5b73', shirtTex: 'b:batik_kawung_merah', bottom: 'rok', bottomColor: '#4b3a33', head: 'kerudung', headColor: '#5b6b4a', celemek: true, longSleeve: true, shoes: '#3a2f27', skin: '#b6825a' },
  wiryo: { name: 'Pak Wiryo (penghuni lama)', h: 1.60, shirt: '#d6d1c4', bottom: 'sarung', bottomColor: '#4a3f33', bottomTex: 'b:sarung_hijau', head: 'peci', hair: '#c9c5bd', kacamata: true, longSleeve: true, shoes: '#2a2218', skin: '#a77751' },
  hendra: { name: 'Pak Hendra (pengelola)', h: 1.72, shirt: '#b9b4a3', shirtTex: 'b:batik_kawung_merah', bottom: 'celana', bottomColor: '#2a2d33', shoes: '#16161a', hair: '#2b2622', kacamata: true, longSleeve: true, belt: true, tuck: true, skin: '#a97c59' },
  polisi: { name: 'Petugas polisi', h: 1.72, shirt: '#7b5d3c', bottom: 'celana', bottomColor: '#3c2f22', shoes: '#0d0d0f', head: 'topi_satpam', belt: true, tuck: true, longSleeve: true, skin: '#9a6a46' },
  sosok: { name: 'Sosok perempuan lansia', female: true, h: 1.5, shirt: '#c9c3b3', bottom: 'rok', bottomColor: '#3b3033', head: 'kerudung', headColor: '#cfc9bd', longSleeve: true, shoes: '#2a2625', skin: '#a89c8c' },
};
for (const [k, s] of Object.entries(TOKOH)) LIBRARY['tokoh_' + k] = { name: s.name, icon: s.female ? '👩' : '👨', grp: 'tokoh', build: (m) => buildFigure(m, s) };
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

// ============================================================================
// Peniru (figur horor "Malam Terakhir di Kampung") + sandal jepit
// Perempuan jangkung (~2,1 m) berdaster batik lusuh, leher & lengan terlalu panjang, jari panjang, kaki telanjang.
// opt.part: 'all' | 'body' | 'armL' | 'armR' | 'head_ibu' | 'head_asli' | 'eyes_asli'; opt.face: 'ibu' | 'asli'
// 'ibu' = wajah tenang menyerupai Ibu; 'asli' = rongga mata hitam, pupil menyala, mulut sobek bergigi, helai rambut
// menutupi sebagian wajah. Menghadap -Y, alas di z = 0. Semua bagian memakai koordinat yang sama (mudah dipecah).
// ============================================================================
export const PN = {
  H: 2.1, hh: 0.3, chin: 1.8, neckZ: 1.56, shoulder: 1.5, armX: 0.185,
  skin: '#cbc4b6', skinDark: '#a79f90', hair: '#0b0909', dress: '#8a625c', mud: '#4a3a34', lip: '#9a5a52',
};
const UPV = [0, 0, 1];
function strand(m, c, n, len, r0, r1, color) {
  rev(m, c, n, [[r0, 0], [(r0 + r1) / 2, len * 0.5], [r1, len * 0.92], [0, len]], color, { seg: 6 });
}
function pnHand(m, c, side, color, curl = 0.35) {
  // telapak pipih + 5 jari panjang bersendi (dua ruas) + kuku gelap, menjuntai ke bawah
  rev(m, [c[0], c[1], c[2]], [0, 0, -1], [[0, 0], [0.02, 0.01], [0.034, 0.05], [0.028, 0.1], [0, 0.108]], color, { sx: 1.0, sy: 0.45, seg: 10 });
  const lens = [0.085, 0.13, 0.15, 0.135, 0.105];
  for (let i = 0; i < 5; i++) {
    const x = c[0] + (i - 2) * 0.014 * (side || 1);
    const z = c[2] - 0.1;
    const y = c[1] + (i === 0 ? -0.012 : 0);
    const L = lens[i];
    rev(m, [x, y, z], [0, -0.1 * curl, -1], [[0.0085, 0], [0.0075, L * 0.5], [0.0065, L * 0.52]], color, { seg: 6 });
    const e = [x, y + (-0.1 * curl) * L * 0.5, z - L * 0.5];
    rev(m, e, [0, -0.45 * curl - 0.2, -1], [[0.0065, 0], [0.005, L * 0.5], [0, L * 0.55]], '#2a2220', { seg: 6 });
  }
}
export function buildPeniru(m, opt = {}) {
  const part = opt.part ?? 'all', face = opt.face ?? 'ibu';
  const P = PN;
  const want = (n) => part === 'all' || part === n;
  const wantHead = part === 'all' || part === 'head_' + (face === 'ibu' ? 'ibu' : 'asli');
  const skin = P.skin;
  if (want('body')) {
    for (const sx of [-1, 1]) {   // kaki telanjang kurus, telapak + jari kaki
      const x = sx * 0.085;
      rev(m, [x, 0, 0.05], UPV, [[0, 0], [0.028, 0.004], [0.034, 0.1], [0.046, 0.27], [0.056, 0.45], [0.062, 0.7], [0, 0.78]], skin, { sy: 0.95, seg: 12 });
      rev(m, [x, 0.04, 0.04], [0, -1, 0], [[0, 0], [0.03, 0.008], [0.036, 0.07], [0.033, 0.17], [0.026, 0.2], [0, 0.21]], skin, { sz: 0.55, seg: 10 });
      for (let t = 0; t < 5; t++) {
        rev(m, [x + (t - 2) * 0.0125, -0.155, 0.018], [0, -1, 0], [[0.0085 - t * 0.0008, 0], [0.0075 - t * 0.0008, 0.03 - t * 0.003], [0, 0.036 - t * 0.003]], skin, { seg: 6 });
      }
    }
    // daster batik lusuh; ujung bawah berlumpur dan compang-camping
    const z0 = 0.22;
    rev(m, [0, 0, z0], UPV, [[0, 0], [0.265, 0], [0.245, 0.14], [0.2, 0.42], [0.165, 0.66], [0.125, 0.86], [0.112, 0.94], [0.138, 1.08], [0.15, 1.22], [0.07, 1.34], [0, 1.35]],
      P.dress, { sy: 0.64, seg: 24, tex: 'b:batik_kawung_merah', texScale: 0.22 });
    rev(m, [0, 0, z0 - 0.005], UPV, [[0, 0], [0.272, 0], [0.262, 0.07], [0.252, 0.12], [0, 0.125]], P.mud, { sy: 0.65, seg: 24 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.2;
      cone(m, Math.cos(a) * 0.262, Math.sin(a) * 0.262 * 0.64, z0 - 0.07 - (i % 3) * 0.02, 0.03, 0.07 + (i % 3) * 0.02, P.dress, 5);
    }
    // leher panjang kurus + tulang selangka
    rev(m, [0, 0.004, 1.5], UPV, [[0, 0], [0.044, 0], [0.04, 0.12], [0.036, 0.22], [0.04, 0.3], [0, 0.31]], skin, { sy: 0.95, seg: 14 });
    for (const sx of [-1, 1]) rev(m, [sx * 0.045, -0.062, 1.495], [sx * 0.9, 0, -0.18], [[0.007, 0], [0.007, 0.09], [0, 0.092]], P.skinDark, { seg: 6 });
  }
  for (const [pn, sx] of [['armL', -1], ['armR', 1]]) {
    if (!want(pn)) continue;
    const c = [sx * P.armX, 0, P.shoulder];
    const D = [0, 0, -1];
    rev(m, c, D, [[0, -0.02], [0.05, 0], [0.047, 0.17], [0.038, 0.36]], skin, { seg: 12 });
    rev(m, c, D, [[0, -0.03], [0.068, 0.0], [0.07, 0.1], [0.06, 0.19], [0, 0.192]], P.dress, { seg: 14, tex: 'b:batik_kawung_merah', texScale: 0.22 });
    rev(m, [c[0], c[1], c[2] - 0.36], D, [[0.038, 0], [0.03, 0.2], [0.024, 0.45], [0.019, 0.55]], skin, { seg: 12 });
    pnHand(m, [c[0], c[1], c[2] - 0.91], sx, skin);
  }
  if (wantHead) {
    const hh = P.hh, chin = P.chin, rw = hh * 0.29;
    const headProf = [[0, 0], [rw * 0.32, hh * 0.015], [rw * 0.58, hh * 0.12], [rw * 0.88, hh * 0.35], [rw, hh * 0.56], [rw * 0.9, hh * 0.8], [rw * 0.55, hh * 0.95], [0, hh]];
    rev(m, [0, 0, chin], UPV, headProf, skin, { sx: 0.88, sy: 1.12, seg: 22 });
    const front = -rw * 1.12;
    // y permukaan wajah pada ketinggian relatif tertentu (interpolasi profil kepala, sy = 1,12)
    const sfc = (fz) => {
      const z = fz * hh;
      for (let i = 0; i + 1 < headProf.length; i++) {
        const [r0, z0] = headProf[i], [r1, z1] = headProf[i + 1];
        if (z >= z0 && z <= z1) return -(r0 + ((r1 - r0) * (z - z0)) / (z1 - z0 || 1)) * 1.12;
      }
      return front;
    };
    const shell = (f, zFrom) => {
      const pts = headProf.filter(([, z]) => z >= zFrom * hh).map(([r, z]) => [r * f, hh * 0.5 + (z - hh * 0.5) * f]);
      const [r0, z0] = pts[0];
      return [[r0 * 0.98, z0 - 0.004], ...pts];
    };
    const eyeZ = chin + hh * 0.56, eyeX = rw * 0.36;
    for (const sx of [-1, 1]) rev(m, [sx * rw * 0.86, 0.012, chin + hh * 0.4], UPV, ell(hh * 0.1, -Math.PI / 2, Math.PI / 2, 6), skin, { sx: 0.45, seg: 8 });
    // rambut: tudung kepala, rambut belakang panjang bergelombang, helai samping jatuh ke depan bahu
    rev(m, [0, rw * 0.08, chin], UPV, shell(1.07, 0.56), P.hair, { sx: 0.9, sy: 1.12, seg: 22 });
    rev(m, [0, rw * 0.45, chin + hh * 0.4], UPV, ell(rw * 0.9, -Math.PI / 2, Math.PI / 2, 8), P.hair, { sx: 1.0, sy: 0.78, seg: 16 });
    rev(m, [0, rw * 0.78, chin + hh * 0.72], UPV, [[0, 0], [rw * 0.92, -0.01], [rw * 1.0, -0.3], [rw * 0.9, -0.62], [rw * 0.7, -0.84], [0, -0.9]], P.hair, { sy: 0.4, seg: 14 });
    for (let i = 0; i < 14; i++) {
      const a = -0.9 + i * 0.14;
      strand(m, [Math.sin(a) * rw * 1.0, rw * 0.9 + Math.cos(a) * 0.01, chin + hh * 0.7 - 0.55], [Math.sin(a) * 0.04, 0.03, -1], 0.62 + (i % 4) * 0.07, 0.014, 0.006, P.hair);
    }
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const x = sx * (rw * 0.93 + k * 0.011);
        strand(m, [x, front * 0.34 - k * 0.012, chin + hh * 0.6], [sx * 0.03, -0.1, -1], 0.85 + k * 0.09, 0.018, 0.005, P.hair);
      }
    }
    if (face === 'ibu') {
      for (const sx of [-1, 1]) {
        rev(m, [sx * eyeX, front * 0.9, eyeZ - 0.011], UPV, ell(0.0125, -Math.PI / 2, Math.PI / 2, 4), '#f4f1ea', { sx: 1.4, sy: 0.5, seg: 8 });
        rev(m, [sx * eyeX, front * 0.93, eyeZ - 0.009], UPV, ell(0.0085, -Math.PI / 2, Math.PI / 2, 4), '#3a2418', { sy: 0.5, seg: 8 });
        box(m, sx * eyeX - 0.02, front * 0.93 - 0.002, eyeZ + 0.022, 0.04, 0.005, 0.005, P.hair);
      }
      rev(m, [0, front * 0.95, chin + hh * 0.37], [0, -1, 0], [[0, 0], [0.013, 0.002], [0.004, 0.026], [0, 0.028]], skin, { seg: 8, sz: 1.3 });
      rev(m, [0, front * 0.9, chin + hh * 0.23], UPV, ell(0.02, -Math.PI / 2, Math.PI / 2, 4), P.lip, { sx: 1.6, sy: 0.5, sz: 0.8, seg: 10 });
    } else {
      // wajah asli: pipi cekung, rongga mata hitam, hidung celah, mulut sobek lebar bergigi runcing
      for (const sx of [-1, 1]) {
        rev(m, [sx * rw * 0.62, front * 0.78, chin + hh * 0.3], UPV, ell(0.02, -Math.PI / 2, Math.PI / 2, 5), P.skinDark, { sx: 0.8, sy: 0.4, sz: 1.5, seg: 10 });
        rev(m, [sx * eyeX, front * 0.86, eyeZ - 0.001], UPV, ell(0.03, -Math.PI / 2, Math.PI / 2, 6), '#040202', { sx: 0.95, sy: 0.5, sz: 1.45, seg: 12 });
        rev(m, [sx * eyeX * 1.04, front * 0.9, eyeZ + 0.034], [sx * 0.5, 0, -1], [[0.005, 0], [0.005, 0.045], [0, 0.047]], P.hair, { seg: 5 });
      }
      rev(m, [0, sfc(0.38) + 0.004, chin + hh * 0.38], UPV, ell(0.009, -Math.PI / 2, Math.PI / 2, 4), '#120808', { sx: 1.1, sy: 0.5, sz: 1.6, seg: 8 });
      const my = sfc(0.2), mz = chin + hh * 0.2;
      rev(m, [0, my + 0.004, mz], UPV, ell(0.056, -Math.PI / 2, Math.PI / 2, 8), '#050202', { sx: 1.0, sy: 0.4, sz: 0.62, seg: 18 });   // mulut sobek
      for (let t = -6; t <= 6; t++) {
        const x = t * 0.0075, d = 1 - Math.abs(t) / 9;
        rev(m, [x, my - 0.0145, mz + 0.0125], [0, 0, -1], [[0.0034, 0], [0, 0.028 * d + 0.01]], '#e8e1c8', { seg: 4 });
        rev(m, [x + 0.0035, my - 0.0145, mz - 0.0125], UPV, [[0.0034, 0], [0, 0.024 * d + 0.009]], '#e8e1c8', { seg: 4 });
      }
      for (let k = 0; k < 4; k++) {   // beberapa helai menutupi sisi kanan wajah (tidak seluruhnya)
        const x = 0.026 + k * 0.013;
        strand(m, [x, sfc(0.96) - 0.004, chin + hh * 0.93], [0.015, -0.08, -1], 0.22 + (k % 3) * 0.07, 0.011, 0.004, P.hair);
      }
    }
  }
  if ((part === 'all' && face === 'asli') || part === 'eyes_asli') {
    const rw = P.hh * 0.29, front = -rw * 1.12, eyeZ = P.chin + P.hh * 0.56, eyeX = rw * 0.36;
    for (const sx of [-1, 1]) rev(m, [sx * eyeX, front * 1.0, eyeZ - 0.006], UPV, ell(0.0048, -Math.PI / 2, Math.PI / 2, 4), '#fff1c4', { sy: 0.5, seg: 8 });
  }
}
LIBRARY.peniru_ibu = { name: 'Peniru — wajah Ibu', icon: '👩', grp: 'horor', build: (m) => buildPeniru(m, { face: 'ibu' }) };
LIBRARY.peniru_asli = { name: 'Peniru — wajah asli', icon: '👹', grp: 'horor', build: (m) => buildPeniru(m, { face: 'asli' }) };

// Sandal jepit karet (sepasang): sol oval berlapis, tali V, penjepit. Menghadap -Y.
export function buildSandalJepit(m, o = {}) {
  const sole = o.sole ?? '#2a63b8', under = o.under ?? '#16376b', strap = o.strap ?? '#ecece6';
  for (const sx of [-1, 1]) {
    const x = sx * 0.065;
    rev(m, [x, 0.0, 0], UPV, [[0, 0], [0.045, 0], [0.05, 0.007], [0, 0.007]], under, { sx: 1.0, sy: 2.55, seg: 22 });
    rev(m, [x, 0.0, 0.007], UPV, [[0, 0], [0.05, 0], [0.052, 0.006], [0.046, 0.011], [0, 0.011]], sole, { sx: 1.0, sy: 2.5, seg: 22 });
    const top = 0.019, toe = [x, -0.085];
    for (const s2 of [-1, 1]) {   // tali V dari penjepit ke sisi tengah sol
      const e = [x + s2 * 0.043, -0.01];
      const dx = e[0] - toe[0], dy = e[1] - toe[1], L = Math.hypot(dx, dy);
      rev(m, [toe[0], toe[1], top + 0.012], [dx / L, dy / L, -0.16], [[0.0075, 0], [0.0075, L], [0, L + 0.004]], strap, { seg: 8 });
    }
    rev(m, [toe[0], toe[1], 0.012], UPV, [[0.0075, 0], [0.007, 0.022], [0, 0.024]], strap, { seg: 8 });
  }
}
LIBRARY.sandal_jepit = { name: 'Sandal jepit (sepasang)', icon: '🩴', grp: 'horor', build: (m) => buildSandalJepit(m) };

// ============================================================================
// Properti kompleks perumahan Indonesia (grup 'kompleks'): tandon menara, tiang listrik beton, AC outdoor,
// kursi plastik, motor bebek. Dipakai game "Alamat Terakhir" (ekspor OBJ + warna). Alas di z = 0.
// ============================================================================
export function buildTandonMenara(m, o = {}) {
  const hgt = o.height ?? 6.0, R = o.radius ?? 1.0, steel = '#8a8f93', tank = o.tank ?? '#3d6f8f', leg = 0.5;
  // tangki: silinder bertutup kubah + sambungan, di atas rangka baja
  const zt = hgt;
  rev(m, [0, 0, zt], UPV, [[0, 0], [R * 0.98, 0], [R, 0.05], [R, 1.55], [R * 0.97, 1.6], [R * 0.7, 1.82], [R * 0.25, 1.95], [0, 1.96]], tank, { seg: 28 });
  for (let i = 1; i <= 3; i++) rev(m, [0, 0, zt + i * 0.38], UPV, [[R * 1.01, 0], [R * 1.01, 0.03]], '#2d5670', { seg: 28 }); // sabuk tangki
  rev(m, [0, 0, zt + 1.95], UPV, [[0.18, 0], [0.18, 0.1], [0.12, 0.13], [0, 0.14]], '#cfd4d6', { seg: 12 });             // tutup lubang
  // empat kaki baja + penyangga silang + cincin dudukan
  const lx = R * 0.72;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    rev(m, [sx * lx, sy * lx, 0], UPV, [[0.06, 0], [0.06, zt]], steel, { seg: 8 });
    rev(m, [sx * (lx + 0.14), sy * (lx + 0.14), 0], UPV, [[0.1, 0], [0.1, 0.12]], '#6b6e70', { seg: 8 });             // dudukan beton kecil
  }
  for (const zz of [zt * 0.33, zt * 0.66]) {
    for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
      const p = [a[0] * lx, a[1] * lx, zz], q = [b[0] * lx, b[1] * lx, zz];
      const d = [q[0] - p[0], q[1] - p[1], 0], L = Math.hypot(d[0], d[1]);
      rev(m, p, [d[0] / L, d[1] / L, 0], [[0.03, 0], [0.03, L]], steel, { seg: 6 });
    }
  }
  // silang diagonal di dua sisi bawah
  for (const [a, b] of [[[-1, -1], [1, -1]], [[1, 1], [-1, 1]]]) {
    const p = [a[0] * lx, a[1] * lx, 0.1], q = [b[0] * lx, b[1] * lx, zt * 0.33];
    const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], L = Math.hypot(...d);
    rev(m, p, d.map((v) => v / L), [[0.02, 0], [0.02, L]], steel, { seg: 6 });
  }
  // dasar tangki + pipa turun
  rev(m, [R * 0.55, 0, zt - 0.1], UPV, [[0.05, 0], [0.05, -zt + 0.15]], '#bfc3c6', { seg: 8 });
  // tangga baja kecil di satu kaki
  for (let k = 0; k < Math.floor(zt / 0.35); k++) box(m, lx + 0.12, -0.2, 0.3 + k * 0.35, 0.03, 0.4, 0.03, steel);
  rev(m, [lx + 0.12, -0.2, 0], UPV, [[0.015, 0], [0.015, zt]], steel, { seg: 6 });
  rev(m, [lx + 0.12, 0.2, 0], UPV, [[0.015, 0], [0.015, zt]], steel, { seg: 6 });
}
LIBRARY.tandon_menara = { name: 'Tandon air menara', icon: '🛢️', grp: 'kompleks', build: (m) => buildTandonMenara(m) };
LIBRARY.tandon_pendek = { name: 'Tandon air pendek', icon: '🛢️', grp: 'kompleks', build: (m) => buildTandonMenara(m, { height: 2.2, radius: 0.55, tank: '#c9702a' }) };

export function buildTiangListrik(m, o = {}) {
  const hgt = o.height ?? 9.0, con = '#8f8e88';
  rev(m, [0, 0, 0], UPV, [[0.15, 0], [0.145, hgt * 0.5], [0.105, hgt]], con, { seg: 14 });
  for (let i = 0; i < 6; i++) rev(m, [0, 0, 1.2 + i * 0.04], UPV, [[0.152 - i * 0.0, 0], [0.152, 0.012]], '#6f6e69', { seg: 14 });
  const zc = hgt - 0.5;
  box(m, -0.75, -0.04, zc, 1.5, 0.08, 0.08, '#3d3a35');                  // palang
  for (const x of [-0.65, -0.22, 0.22, 0.65]) rev(m, [x, 0, zc + 0.08], UPV, [[0.035, 0], [0.04, 0.1], [0.03, 0.16], [0, 0.17]], '#b9b6a8', { seg: 8 });  // isolator
  box(m, -0.07, -0.20, zc - 1.1, 0.14, 0.12, 0.7, '#4b4a46');             // kabel turun / kotak
  rev(m, [0, -0.17, zc - 0.5], UPV, [[0.03, 0], [0.03, -0.5]], '#2c2c2c', { seg: 6 });
  // pelat nomor tiang (kosong; teks dipasang sebagai tekstur di game)
  box(m, -0.18, -0.152, 2.1, 0.36, 0.012, 0.26, '#f0efe6');
}
LIBRARY.tiang_listrik = { name: 'Tiang listrik beton', icon: '⚡', grp: 'kompleks', build: (m) => buildTiangListrik(m) };

export function buildAcOutdoor(m, o = {}) {
  const w = 0.82, d = 0.3, h = 0.6, body = o.body ?? '#d8d9d2', dirt = '#9a9a8e';
  box(m, -w / 2, -d / 2, 0.18, w, d, h, body);                                  // rumah kondensor
  box(m, -w / 2 - 0.02, -d / 2 + 0.02, 0.0, 0.05, 0.26, 0.2, '#555a5e');          // kaki braket kiri
  box(m, w / 2 - 0.03, -d / 2 + 0.02, 0.0, 0.05, 0.26, 0.2, '#555a5e');
  // kisi/ grill kipas di sisi depan (-Y): cincin + bilah
  const cy = -d / 2 - 0.004, cz = 0.18 + h * 0.5;
  for (const r of [0.07, 0.12, 0.17, 0.22]) rev(m, [0, cy, cz], [0, -1, 0], [[r, 0], [r, 0.012]], '#8a8d8e', { seg: 20 });
  rev(m, [0, cy, cz], [0, -1, 0], [[0.05, 0], [0.05, 0.03], [0, 0.03]], '#6f7274', { seg: 12 });
  for (let k = 0; k < 8; k++) box(m, -0.012, cy - 0.01, cz - 0.24 + k * 0.06, 0.024, 0.01, 0.01, '#8a8d8e');
  // sisi kanan: sirip kondensor kotor + pipa tembaga
  box(m, w / 2 - 0.12, -d / 2 + 0.02, 0.24, 0.12, d - 0.04, h - 0.12, dirt);
  rev(m, [w / 2 - 0.05, d / 2 - 0.02, 0.3], UPV, [[0.011, 0], [0.011, 0.25]], '#b8733a', { seg: 6 });
  rev(m, [w / 2 - 0.09, d / 2 - 0.02, 0.3], UPV, [[0.016, 0], [0.016, 0.25]], '#e9e9e4', { seg: 6 });   // pipa terisolasi
}
LIBRARY.ac_outdoor = { name: 'AC outdoor (kondensor)', icon: '❄️', grp: 'kompleks', build: (m) => buildAcOutdoor(m) };

export function buildKursiPlastik(m, o = {}) {
  const c = o.color ?? '#c0392b';
  box(m, -0.21, -0.2, 0.43, 0.42, 0.4, 0.035, c);                          // dudukan
  for (const [x, y] of [[-0.19, -0.17], [0.19, -0.17], [-0.19, 0.17], [0.19, 0.17]]) rev(m, [x, y, 0], UPV, [[0.022, 0], [0.018, 0.43]], c, { seg: 8 });
  box(m, -0.21, 0.16, 0.465, 0.42, 0.03, 0.34, c);                         // sandaran
  for (let k = 0; k < 5; k++) box(m, -0.17 + k * 0.085, 0.158, 0.52 + (k % 2) * 0.02, 0.045, 0.034, 0.22, '#d1473a');
}
LIBRARY.kursi_plastik = { name: 'Kursi plastik', icon: '🪑', grp: 'kompleks', build: (m) => buildKursiPlastik(m) };

// Motor bebek (underbone) Indonesia: roda ber-ban + velg + jari-jari, garpu, stang + spion, lampu depan + sein, bodi (legshield, penutup tengah,
// jok, tameng belakang), spakbor, mesin + knalpot, lengan ayun + shock, standar, plat nomor. Panjang ±1,9 m, tinggi jok ±0,74 m.
// Menghadap -Y (depan di -Y), alas z = 0. Warna bodi dapat diganti.
// profil samping (y,z) diekstrusi selebar w di sekitar x = 0
function sideProfile(m, pts, w, color, x = 0) {
  const f = face(m, pts.map(([y, z]) => [x + w / 2, y, z]), V(-1, 0, 0), color);
  if (f) G.pushPull(m, f.id, w);
}
// busur (spakbor) di bidang YZ: pita antara radius r0..r1 dari sudut a0..a1 (derajat, 0 = +Y, 90 = atas), lebar w
function arcBand(m, cy, cz, r0, r1, a0, a1, w, color, n = 14, x = 0) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([x + w / 2, cy + r1 * Math.cos(a), cz + r1 * Math.sin(a)]);
  }
  for (let i = n; i >= 0; i--) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([x + w / 2, cy + r0 * Math.cos(a), cz + r0 * Math.sin(a)]);
  }
  const f = face(m, pts, V(-1, 0, 0), color);
  if (f) G.pushPull(m, f.id, w);
}
function tube(m, a, b, r, color, seg = 8) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d);
  rev(m, a, d.map((v) => v / L), [[r, 0], [r, L], [0, L + 0.001]], color, { seg });
}
function motorWheel(m, cy, cz) {
  const tire = '#1b1b1d', rimc = '#c9cdd1', hub = '#8f9499';
  // ban: penampang membulat
  rev(m, [0, cy, cz], [1, 0, 0], [[0.205, -0.062], [0.25, -0.07], [0.288, -0.052], [0.302, -0.02], [0.304, 0.0]], tire, { seg: 28, sx: 1, sy: 1 });
  rev(m, [0, cy, cz], [1, 0, 0], [[0.304, 0.0], [0.302, 0.02], [0.288, 0.052], [0.25, 0.07], [0.205, 0.062]], tire, { seg: 28 });
  // velg: cincin + piringan
  rev(m, [0, cy, cz], [1, 0, 0], [[0.205, -0.05], [0.19, -0.04], [0.19, 0.04], [0.205, 0.05]], rimc, { seg: 28 });
  rev(m, [0, cy, cz], [1, 0, 0], [[0.0, -0.02], [0.19, -0.02]], rimc, { seg: 28 });
  rev(m, [0, cy, cz], [1, 0, 0], [[0.0, 0.02], [0.19, 0.02]], rimc, { seg: 28 });
  // jari-jari kasar (lima lengan cor)
  for (let k = 0; k < 5; k++) {
    const a = (k * 2 * Math.PI) / 5;
    const d = [0, Math.cos(a), Math.sin(a)];
    for (const sx of [-0.026, 0.026]) tube(m, [sx, cy + d[1] * 0.05, cz + d[2] * 0.05], [sx, cy + d[1] * 0.18, cz + d[2] * 0.18], 0.011, rimc, 6);
  }
  rev(m, [-0.075, cy, cz], [1, 0, 0], [[0.0, 0], [0.055, 0], [0.055, 0.15], [0.0, 0.15]], hub, { seg: 14 });       // naaf + tromol
  rev(m, [-0.085, cy, cz], [1, 0, 0], [[0.0, 0], [0.11, 0], [0.11, 0.045], [0.0, 0.045]], '#5c6166', { seg: 20 });    // tromol rem
}
export function buildMotorBebek(m, o = {}) {
  const body = o.color ?? '#a32626', seatC = '#1c1c1f', chrome = '#c8ccd0', black = '#17171a', eng = '#8a8f94', rubber = '#222225';
  const FY = -0.62, RY = 0.62, WZ = 0.305;
  motorWheel(m, FY, WZ);
  motorWheel(m, RY, WZ);
  // ---- garpu depan + stang
  for (const sx of [-1, 1]) {
    tube(m, [sx * 0.07, FY - 0.01, WZ], [sx * 0.055, -0.505, 0.93], 0.017, chrome, 8);      // tabung dalam
    tube(m, [sx * 0.055, -0.52, 0.60], [sx * 0.05, -0.505, 0.96], 0.024, black, 8);         // pelindung atas
  }
  tube(m, [-0.06, -0.50, 0.96], [0.06, -0.50, 0.96], 0.03, black, 8);                       // segitiga atas (head)
  tube(m, [-0.36, -0.48, 1.03], [0.36, -0.48, 1.03], 0.012, black, 8);                       // batang stang
  tube(m, [-0.36, -0.48, 1.03], [-0.44, -0.47, 1.03], 0.021, rubber, 8);                     // grip
  tube(m, [0.36, -0.48, 1.03], [0.44, -0.47, 1.03], 0.021, rubber, 8);
  for (const sx of [-1, 1]) {                                                                // tuas rem + spion
    tube(m, [sx * 0.36, -0.49, 1.035], [sx * 0.31, -0.58, 1.02], 0.006, chrome, 5);
    tube(m, [sx * 0.33, -0.49, 1.045], [sx * 0.34, -0.50, 1.27], 0.006, black, 5);
    rev(m, [sx * 0.34, -0.5, 1.29], [0, 0, 1], [[0, 0], [0.05, 0.0], [0.045, 0.012], [0, 0.014]], black, { sx: 1.4, sy: 0.55, seg: 12 });
    rev(m, [sx * 0.34, -0.5, 1.29], [0, 1, 0], [[0, 0], [0.043, 0.0], [0, 0.002]], '#9fb4c4', { sx: 1.35, sy: 0.9, seg: 12 });
  }
  // kluster speedometer + lampu depan + sein
  rev(m, [0, -0.50, 1.07], [0, 0, 1], [[0, 0], [0.085, 0], [0.085, 0.045], [0.06, 0.07], [0, 0.07]], black, { sx: 1.0, sy: 0.8, seg: 14 });
  rev(m, [0, -0.60, 0.95], [0, -1, 0], [[0, 0], [0.12, 0], [0.135, 0.04], [0.12, 0.09], [0.0, 0.1]], body, { sx: 1.0, sy: 1.0, sz: 1.0, seg: 18 }); // rumah lampu
  rev(m, [0, -0.695, 0.95], [0, -1, 0], [[0, 0], [0.105, 0], [0.11, 0.012], [0.0, 0.028]], '#f7f2d6', { seg: 18 });                            // lensa
  for (const sx of [-1, 1]) {
    rev(m, [sx * 0.2, -0.55, 0.95], [sx, 0, 0], [[0.0, 0], [0.028, 0], [0.03, 0.03], [0, 0.04]], '#e9a21e', { seg: 10 });                  // sein depan
    rev(m, [sx * 0.2, 1.0, 0.70], [sx, 0, 0], [[0.0, 0], [0.026, 0], [0.028, 0.03], [0, 0.04]], '#e9a21e', { seg: 10 });                   // sein belakang
  }
  // ---- bodi (profil samping)
  sideProfile(m, [[-0.50, 0.36], [-0.42, 0.36], [-0.44, 0.70], [-0.50, 0.98], [-0.60, 0.95], [-0.56, 0.62]], 0.30, body);                     // legshield
  sideProfile(m, [[-0.34, 0.24], [0.02, 0.24], [0.02, 0.29], [-0.34, 0.29]], 0.40, rubber);                                                 // pijakan kaki (karet)
  sideProfile(m, [[-0.10, 0.29], [0.34, 0.29], [0.46, 0.63], [0.18, 0.66], [-0.02, 0.45]], 0.26, body);                                     // penutup tengah
  sideProfile(m, [[0.04, 0.70], [0.92, 0.70], [0.98, 0.76], [0.94, 0.80], [0.10, 0.80], [0.0, 0.74]], 0.27, seatC);                          // jok
  sideProfile(m, [[0.70, 0.60], [1.02, 0.68], [1.10, 0.84], [0.96, 0.84], [0.62, 0.74]], 0.19, body);                                        // tameng belakang
  sideProfile(m, [[1.02, 0.60], [1.12, 0.62], [1.12, 0.70], [1.02, 0.70]], 0.14, '#9c1d1d');                                                  // lampu belakang
  rev(m, [0, 1.125, 0.66], [0, 1, 0], [[0, 0], [0.05, 0], [0.05, 0.01], [0, 0.012]], '#d83a2e', { sx: 1.5, sy: 1.0, seg: 12 });               // lensa belakang
  sideProfile(m, [[1.04, 0.42], [1.08, 0.42], [1.08, 0.54], [1.04, 0.54]], 0.16, '#efeee4');                                                  // plat nomor
  // ---- spakbor
  arcBand(m, FY, WZ, 0.33, 0.355, 5, 160, 0.13, body);                                                                                          // depan
  arcBand(m, RY, WZ, 0.325, 0.345, 10, 120, 0.12, black);                                                                                       // belakang
  // ---- mesin + rangka bawah + lengan ayun + knalpot + rantai
  box(m, -0.10, 0.02, 0.15, 0.20, 0.34, 0.26, eng);                                                                                             // blok mesin
  rev(m, [0, 0.10, 0.34], [0, -0.6, 0.8], [[0.07, 0], [0.07, 0.17], [0.06, 0.2], [0, 0.2]], eng, { seg: 12 });                                  // kepala silinder miring
  for (const sx of [-1, 1]) {
    tube(m, [sx * 0.09, 0.18, 0.26], [sx * 0.09, RY, WZ], 0.018, black, 6);                                                                     // lengan ayun
    tube(m, [sx * 0.15, 0.78, 0.52], [sx * 0.11, 0.60, 0.30], 0.015, chrome, 6);                                                                // shock
    tube(m, [sx * 0.15, 0.78, 0.52], [sx * 0.14, 0.68, 0.43], 0.027, '#b02020', 6);
    box(m, sx * 0.19 - 0.025, 0.04, 0.22, 0.05, 0.14, 0.04, black);                                                                             // footpeg
  }
  tube(m, [0.15, 0.20, 0.20], [0.17, 0.62, 0.21], 0.04, chrome, 10);                                                                            // knalpot (pipa)
  tube(m, [0.17, 0.55, 0.22], [0.17, 1.02, 0.28], 0.056, '#a9adb1', 12);                                                                        // peredam
  tube(m, [0.17, 1.02, 0.28], [0.17, 1.06, 0.30], 0.05, black, 10);
  tube(m, [-0.06, 0.24, 0.20], [-0.06, RY, WZ], 0.03, black, 6);                                                                                // penutup rantai
  tube(m, [0.07, -0.01, 0.15], [0.07, 0.06, 0.04], 0.012, black, 5);                                                                            // standar sisi
  tube(m, [0.10, 0.06, 0.04], [0.10, 0.20, 0.0], 0.01, black, 5);
  // tangki kecil dekat jok (tutup bensin)
  rev(m, [0, 0.22, 0.82], [0, 0, 1], [[0, 0], [0.05, 0], [0.05, 0.012], [0, 0.012]], chrome, { seg: 10 });
}
LIBRARY.motor_bebek = { name: 'Motor bebek (merah)', icon: '🏍️', grp: 'kompleks', build: (m) => buildMotorBebek(m) };
LIBRARY.motor_bebek_hitam = { name: 'Motor bebek (hitam)', icon: '🏍️', grp: 'kompleks', build: (m) => buildMotorBebek(m, { color: '#202225' }) };
LIBRARY.motor_bebek_biru = { name: 'Motor bebek (biru)', icon: '🏍️', grp: 'kompleks', build: (m) => buildMotorBebek(m, { color: '#2a4f8f' }) };
