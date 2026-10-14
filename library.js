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
