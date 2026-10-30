// Motor realistis berpermukaan halus: matic (skuter otomatis) dan bebek, bentuk khas jalanan Indonesia.
// Bodi dibangun dari penampang superelips yang disambung (loft) mengikuti kurva samping, pipa dari sapuan (sweep)
// lingkaran sepanjang lintasan halus, roda dari bentuk putar. Semua bidang 'soft' (normal halus, tanpa garis tepi).
// Koordinat lokal: depan motor ke -Y, sisi kiri pengendara di +X, alas ban di z = 0.
import * as THREE from 'three';
import * as G from './geometry.js';
import { LIBRARY } from './library.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const se = (t, n) => Math.sign(t) * Math.abs(t) ** (2 / n);
const lerp = (a, b, t) => a + (b - a) * t;

function addFace(m, pts, out, color, sid, o) {
  const f = G.makeFace(m, pts, out, color, sid);
  if (!f) return;
  f.soft = o.soft !== false;
  if (o.finish) f.finish = o.finish;
  m.faces.push(f);
}

// Sambung cincin-cincin (jumlah titik sama) menjadi permukaan; cap = tutup datar di ujung
function loft(m, rings, color, o = {}) {
  const sid = m.nextId++, N = rings[0].p.length;
  for (let k = 0; k < rings.length - 1; k++) {
    const A = rings[k], B = rings[k + 1], cc = A.c.map((v, i) => (v + B.c[i]) / 2);
    for (let i = 0; i < N; i++) {
      const i1 = (i + 1) % N, a = A.p[i], b = A.p[i1], c = B.p[i1], d = B.p[i];
      for (const t of [[a, b, c], [a, c, d]]) {
        const g = [0, 1, 2].map((j) => (t[0][j] + t[1][j] + t[2][j]) / 3);
        addFace(m, t, V(g[0] - cc[0], g[1] - cc[1], g[2] - cc[2]), color, sid, o);
      }
    }
  }
  if (o.cap) {
    const ends = [[rings[0], rings[1]], [rings[rings.length - 1], rings[rings.length - 2]]];
    for (const [R, Q] of ends) addFace(m, R.p, V(R.c[0] - Q.c[0], R.c[1] - Q.c[1], R.c[2] - Q.c[2]), color, sid, { ...o, soft: false });
  }
}

// Kurva halus melalui titik kendali [[t, nilai], ...] (Hermite kubik, garis singgung Catmull-Rom)
function curve(pts) {
  if (typeof pts === 'number') return () => pts;
  if (typeof pts === 'function') return pts;
  return (t) => {
    if (t <= pts[0][0]) return pts[0][1];
    const n = pts.length - 1;
    if (t >= pts[n][0]) return pts[n][1];
    let i = 0;
    while (t > pts[i + 1][0]) i++;
    const [t0, v0] = pts[i], [t1, v1] = pts[i + 1], h = t1 - t0, u = (t - t0) / h;
    const sl = (a, b) => (pts[b][1] - pts[a][1]) / (pts[b][0] - pts[a][0]);
    const m0 = i > 0 ? (sl(i - 1, i) + sl(i, i + 1)) / 2 : sl(i, i + 1);
    const m1 = i + 1 < n ? (sl(i, i + 1) + sl(i + 1, i + 2)) / 2 : sl(i, i + 1);
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * h * m1;
  };
}
// faktor ujung membulat (kubah) sepanjang r dari kedua ujung
const dome = (s, len, r) => {
  if (!r) return 1;
  const d = Math.min(s, len - s);
  return d >= r ? 1 : Math.sqrt(Math.max(0, 1 - ((r - d) / r) ** 2));
};

// Badan memanjang searah Y: sisi atas zt(y), bawah zb(y), setengah lebar w(y) (di tengah tinggi), pusat x xc(y),
// keketatan n (2 = elips, makin besar makin bersudut). wt/wb = setengah lebar di sisi atas/bawah (penampang trapesium).
// Mengembalikan surf(y, a, lift): titik permukaan pada sudut a (0 = sisi +X, π/2 = atas), digeser 'lift' keluar.
function bodyY(m, s, color, o = {}) {
  const zt = curve(s.zt), zb = curve(s.zb), w = curve(s.w), xc = curve(s.xc ?? 0), nn = curve(s.n ?? 2.6);
  const wt = s.wt != null ? curve(s.wt) : null, wb = s.wb != null ? curve(s.wb) : null;
  const N = s.seg ?? 28, steps = s.steps ?? 28, len = s.y1 - s.y0, rings = [];
  const P = (y, a) => {
    const f = dome(y - s.y0, len, s.round ?? 0), zc = (zt(y) + zb(y)) / 2, h = ((zt(y) - zb(y)) / 2) * f, n = nn(y), sa = Math.sin(a), ww = w(y);
    const wa = (sa > 0 ? (wt ? lerp(ww, wt(y), sa) : ww) : (wb ? lerp(ww, wb(y), -sa) : ww)) * f;
    return [xc(y) + wa * se(Math.cos(a), n), y, zc + h * se(sa, n)];
  };
  for (let k = 0; k <= steps; k++) {
    const u = (1 - Math.cos((Math.PI * k) / steps)) / 2, y = s.y0 + len * u, p = [];
    for (let i = 0; i < N; i++) p.push(P(y, (2 * Math.PI * i) / N));
    rings.push({ c: [xc(y), y, (zt(y) + zb(y)) / 2], p });
  }
  loft(m, rings, color, o);
  return (y, a, lift = 0) => {
    y = Math.min(s.y1 - 1e-4, Math.max(s.y0 + 1e-4, y));
    const p = P(y, a);
    if (!lift) return p;
    const e = 1e-3, py = P(Math.min(s.y1, y + e), a), pa = P(y, a + e);
    const nr = V(py[0] - p[0], py[1] - p[1], py[2] - p[2]).cross(V(pa[0] - p[0], pa[1] - p[1], pa[2] - p[2]));
    if (nr.x * (p[0] - xc(y)) + nr.z * (p[2] - (zt(y) + zb(y)) / 2) < 0) nr.negate();
    nr.normalize();
    return [p[0] + nr.x * lift, p[1] + nr.y * lift, p[2] + nr.z * lift];
  };
}
// Tempelan pada permukaan badan (lampu, ventilasi, striping): y0..y1, rentang sudut aR(y) -> [a0, a1]
function patch(m, surf, y0, y1, aR, color, o = {}) {
  const ny = o.ny ?? 14, na = o.na ?? 8, lift = o.lift ?? 0.0015, sid = m.nextId++, Gd = [];
  for (let i = 0; i <= ny; i++) {
    const y = lerp(y0, y1, i / ny), [a0, a1] = aR(y), row = [];
    for (let j = 0; j <= na; j++) row.push([y, lerp(a0, a1, j / na)]);
    Gd.push(row);
  }
  for (let i = 0; i < ny; i++) for (let j = 0; j < na; j++) {
    const q = [Gd[i][j], Gd[i + 1][j], Gd[i + 1][j + 1], Gd[i][j + 1]], pts = q.map(([y, a]) => surf(y, a, lift));
    const yc = (q[0][0] + q[2][0]) / 2, ac = (q[0][1] + q[2][1]) / 2, p0 = surf(yc, ac, lift), p1 = surf(yc, ac, lift + 0.01);
    const out = V(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    for (const t of [[pts[0], pts[1], pts[2]], [pts[0], pts[2], pts[3]]]) addFace(m, t, out, color, sid, o);
  }
}
// rentang sudut untuk sisi kiri (+X, sx = 1) dicerminkan ke sisi kanan (-X)
const sideR = (sx, r) => (y) => { const [a0, a1] = r(y); return sx > 0 ? [a0, a1] : [Math.PI - a1, Math.PI - a0]; };
// Badan tegak searah Z (hidung / tameng depan): tepi depan yF(z), tepi belakang yB(z), setengah lebar w(z),
// wf = setengah lebar di sisi depan (trapesium). surf(z, a, lift): a = 0 sisi +X, -π/2 muka depan (-Y), π/2 belakang.
function bodyZ(m, s, color, o = {}) {
  const yF = curve(s.yF), yB = curve(s.yB), w = curve(s.w), wf = s.wf != null ? curve(s.wf) : null, n = s.n ?? 3;
  const N = s.seg ?? 32, steps = s.steps ?? 24, len = s.z1 - s.z0, rings = [];
  const P = (z, a) => {
    const f = dome(z - s.z0, len, s.round ?? 0), yc = (yF(z) + yB(z)) / 2, d = ((yB(z) - yF(z)) / 2) * f, sa = Math.sin(a), ww = w(z);
    const wa = (sa < 0 && wf ? lerp(ww, wf(z), -sa) : ww) * f;
    return [wa * se(Math.cos(a), n), yc + d * se(sa, n), z];
  };
  for (let k = 0; k <= steps; k++) {
    const u = (1 - Math.cos((Math.PI * k) / steps)) / 2, z = s.z0 + len * u, p = [];
    for (let i = 0; i < N; i++) p.push(P(z, (2 * Math.PI * i) / N));
    rings.push({ c: [0, (yF(z) + yB(z)) / 2, z], p });
  }
  loft(m, rings, color, o);
  return (z, a, lift = 0) => {
    z = Math.min(s.z1 - 1e-4, Math.max(s.z0 + 1e-4, z));
    const p = P(z, a);
    if (!lift) return p;
    const e = 1e-3, pz = P(Math.min(s.z1, z + e), a), pa = P(z, a + e);
    const nr = V(pz[0] - p[0], pz[1] - p[1], pz[2] - p[2]).cross(V(pa[0] - p[0], pa[1] - p[1], pa[2] - p[2]));
    if (nr.x * p[0] + nr.y * (p[1] - (yF(z) + yB(z)) / 2) < 0) nr.negate();
    nr.normalize();
    return [p[0] + nr.x * lift, p[1] + nr.y * lift, p[2] + nr.z * lift];
  };
}
// Badan memanjang searah X (mis. tutup stang): pusat yc(x), zc(x), setengah tebal d(x), setengah tinggi h(x)
function bodyX(m, s, color, o = {}) {
  const yc = curve(s.yc), zc = curve(s.zc), d = curve(s.d), h = curve(s.h), nn = s.n ?? 2.6;
  const N = s.seg ?? 24, steps = s.steps ?? 24, len = s.x1 - s.x0, rings = [];
  for (let k = 0; k <= steps; k++) {
    const u = (1 - Math.cos((Math.PI * k) / steps)) / 2, x = s.x0 + len * u, f = dome(x - s.x0, len, s.round ?? 0);
    const p = [];
    for (let i = 0; i < N; i++) { const a = (2 * Math.PI * i) / N; p.push([x, yc(x) + d(x) * f * se(Math.cos(a), nn), zc(x) + h(x) * f * se(Math.sin(a), nn)]); }
    rings.push({ c: [x, yc(x), zc(x)], p });
  }
  loft(m, rings, color, o);
}

// Lintasan halus Catmull-Rom melalui titik kendali
function smoothPath(ctrl, per = 8) {
  if (ctrl.length < 3) {
    const out = [];
    for (let i = 0; i <= per; i++) out.push(ctrl[0].map((v, j) => lerp(v, ctrl[1][j], i / per)));
    return out;
  }
  const P = [ctrl[0].map((v, j) => 2 * v - ctrl[1][j]), ...ctrl, ctrl[ctrl.length - 1].map((v, j) => 2 * v - ctrl[ctrl.length - 2][j])], out = [];
  for (let i = 1; i < P.length - 2; i++) {
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((j) => 0.5 * (2 * P[i][j] + (-P[i - 1][j] + P[i + 1][j]) * t + (2 * P[i - 1][j] - 5 * P[i][j] + 4 * P[i + 1][j] - P[i + 2][j]) * t2 + (-P[i - 1][j] + 3 * P[i][j] - 3 * P[i + 1][j] + P[i + 2][j]) * t3)));
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

// Sapuan penampang superelips (w = arah samping, h = arah normal) sepanjang lintasan; sec(t) -> {w, h, n}
function sweep(m, path, sec, color, o = {}) {
  const N = o.seg ?? 10, n = path.length;
  const T = path.map((p, i) => { const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)]; return V(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize(); });
  const planar = path.every((p) => Math.abs(p[0] - path[0][0]) < 1e-9);
  let side = planar ? V(1, 0, 0) : (Math.abs(T[0].z) < 0.9 ? V(0, 0, 1) : V(1, 0, 0)).cross(T[0]).normalize();
  const L = [0];
  for (let i = 1; i < n; i++) L.push(L[i - 1] + Math.hypot(...path[i].map((v, j) => v - path[i - 1][j])));
  const rings = [];
  for (let i = 0; i < n; i++) {
    if (!planar && i > 0) side = side.clone().sub(T[i].clone().multiplyScalar(side.dot(T[i]))).normalize(); // transport sejajar
    const nrm = T[i].clone().cross(side).normalize(), sc = sec(L[i] / L[n - 1]), f = dome(L[i], L[n - 1], o.round ?? 0);
    const p = [];
    for (let k = 0; k < N; k++) {
      const a = (2 * Math.PI * k) / N, cu = se(Math.cos(a), sc.n ?? 2) * sc.w * f, cv = se(Math.sin(a), sc.n ?? 2) * sc.h * f;
      p.push([0, 1, 2].map((j) => path[i][j] + side.getComponent(j) * cu + nrm.getComponent(j) * cv));
    }
    rings.push({ c: path[i], p });
  }
  loft(m, rings, color, o);
}
const pipe = (m, ctrl, r, color, o = {}) => sweep(m, smoothPath(ctrl, o.per ?? 8), () => ({ w: r, h: r }), color, { cap: true, ...o });

// Bentuk putar di c sepanjang sumbu ax; profil [[jari-jari, jarak]]; skala opsional (s = [sx, sy, sz]) terhadap c
function rev(m, c, ax, prof, color, o = {}) {
  const { ids } = G.lathe(m, c, ax, prof, o.seg ?? 24, !!o.closed, color);
  const set = new Set(ids);
  for (const f of m.faces) {
    if (!set.has(f.id)) continue;
    if (o.s) {
      f.pts = f.pts.map((p) => p.map((v, j) => c[j] + (v - c[j]) * o.s[j]));
      const nv = G.newellNormal(f.pts).normalize();
      f.n = [nv.x, nv.y, nv.z];
    }
    f.soft = o.soft !== false;
    if (o.finish) f.finish = o.finish;
  }
}
// elipsoid (lampu, sein, kepala spion)
const blob = (m, c, r, color, o = {}) => {
  const prof = [];
  for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 10; prof.push([Math.max(0, Math.cos(a)), Math.sin(a)]); }
  rev(m, c, [0, 0, 1], prof, color, { seg: o.seg ?? 16, s: r, finish: o.finish });
};

const KARET = '#18181a', KROM = '#c9ced3', HITAM = '#1d1e21', MESIN = '#3a3d41', ALU = '#a3a9ae';

// Roda: ban membulat, velg (cor lima palang ganda atau jari-jari kawat), naaf, cakram/tromol
// Roda + penanda animasi: tiap bidang roda membawa { c: pusat, ax: sumbu, r: jari-jari } (koordinat lokal)
// agar roda bisa berputar otomatis saat motor dianimasikan bergerak.
function wheel(m, y, R, o) {
  const n0 = m.faces.length;
  wheelParts(m, y, R, o);
  const roda = { c: [0, y, R], ax: [1, 0, 0], r: R };
  for (let i = n0; i < m.faces.length; i++) m.faces[i].roda = roda;
}
function wheelParts(m, y, R, o) {
  const tw = o.tire ?? 0.045, rimR = R - (o.wall ?? 0.072), c = [0, y, R];
  // penampang ban: dari tepi velg sampai tapak, membulat
  const tp = [];
  for (let i = 0; i <= 24; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 24; tp.push([rimR - 0.004 + (R - rimR + 0.004) * se(Math.cos(a), 2.4), tw * se(Math.sin(a), 2.2)]); }
  rev(m, c, [1, 0, 0], tp, KARET, { seg: 40 });
  rev(m, c, [1, 0, 0], [[rimR + 0.004, tw * 0.95], [rimR - 0.006, tw * 0.8], [rimR - 0.012, tw * 0.5], [rimR - 0.012, -tw * 0.5], [rimR - 0.006, -tw * 0.8], [rimR + 0.004, -tw * 0.95]], o.rim ?? HITAM, { seg: 40, finish: 'glossy' });
  rev(m, c, [1, 0, 0], [[0, -0.055], [0.04, -0.055], [0.05, -0.035], [0.05, 0.035], [0.04, 0.055], [0, 0.055]], ALU, { seg: 18, finish: 'metal' });
  if (o.spoke === 'kawat') {
    for (let k = 0; k < 32; k++) {
      const a = (2 * Math.PI * k) / 32, b = a + (k % 2 ? 0.35 : -0.35), sx = k % 2 ? 0.035 : -0.035;
      pipe(m, [[sx, y + 0.045 * Math.cos(a), R + 0.045 * Math.sin(a)], [sx * 0.3, y + (rimR - 0.012) * Math.cos(b), R + (rimR - 0.012) * Math.sin(b)]], 0.0018, KROM, { seg: 4, per: 1, finish: 'metal' });
    }
  } else {
    for (let k = 0; k < 5; k++) for (const d of [-0.13, 0.13]) {
      const a = (2 * Math.PI * k) / 5, b = a + d;
      sweep(m, smoothPath([[0, y + 0.045 * Math.cos(a), R + 0.045 * Math.sin(a)], [0, y + (rimR - 0.01) * Math.cos(b), R + (rimR - 0.01) * Math.sin(b)]], 4), (t) => ({ w: 0.012, h: lerp(0.016, 0.009, t), n: 2.6 }), o.rim ?? HITAM, { seg: 8, finish: 'glossy', cap: true });
    }
  }
  if (o.disc) {
    const dr = o.discR ?? 0.11;
    rev(m, [o.disc * 0.06, y, R], [1, 0, 0], [[0.06, 0], [dr, 0], [dr, 0.004], [0.06, 0.004]], '#8d9298', { seg: 32, closed: true, soft: false, finish: 'metal' });
    // kaliper di belakang-atas cakram
    bodyY(m, { y0: y + dr - 0.07, y1: y + dr + 0.01, zb: R + 0.03, zt: R + dr - 0.01, w: 0.018, xc: o.disc * 0.075, round: 0.02, n: 3 }, '#b8222a', { finish: 'glossy' });
  } else {
    rev(m, [o.drum ?? -0.06, y, R], [1, 0, 0], [[0.0, 0], [0.085, 0], [0.09, 0.02], [0.09, 0.03], [0, 0.03]], ALU, { seg: 24, finish: 'metal' });
  }
}

// Peredam kejut: tabung + pegas ulir
function shock(m, a, b, col) {
  pipe(m, [a, b], 0.011, KROM, { seg: 8, finish: 'metal' });
  const d = b.map((v, j) => v - a[j]), L = Math.hypot(...d), T = V(...d).normalize();
  const u = (Math.abs(T.z) < 0.9 ? V(0, 0, 1) : V(1, 0, 0)).cross(T).normalize(), w = T.clone().cross(u);
  const hel = [], turns = 7, z0 = 0.18 * L, z1 = 0.88 * L;
  for (let i = 0; i <= turns * 12; i++) {
    const t = i / (turns * 12), ang = 2 * Math.PI * turns * t, s = lerp(z0, z1, t), r = 0.024;
    hel.push([0, 1, 2].map((j) => a[j] + T.getComponent(j) * s + u.getComponent(j) * r * Math.cos(ang) + w.getComponent(j) * r * Math.sin(ang)));
  }
  sweep(m, hel, () => ({ w: 0.0055, h: 0.0055 }), col, { seg: 6, finish: 'glossy' });
  for (const s of [0.14, 0.92]) rev(m, a.map((v, j) => v + d[j] * s), [T.x, T.y, T.z], [[0.026, 0], [0.026, 0.012]], HITAM, { seg: 12, closed: false });
}

// Stang: tutup stang + lampu depan + spidometer + grip, tuas, spion
function frontEnd(m, s, top) {
  const { body, z0 } = s;
  bodyX(m, { x0: -0.30, x1: 0.30, yc: [[-0.3, -0.41], [0, -0.45], [0.3, -0.41]], zc: [[-0.3, z0 + 0.985], [0, z0 + 0.98], [0.3, z0 + 0.985]], d: [[-0.3, 0.045], [-0.12, 0.08], [0, 0.095], [0.12, 0.08], [0.3, 0.045]], h: [[-0.3, 0.035], [0, 0.068], [0.3, 0.035]], round: 0.035, n: 3 }, body, { finish: 'glossy' });
  // lampu depan berbentuk lonjong di muka tutup stang
  rev(m, [0, -0.535, z0 + 0.975], [0, -1, 0], [[0.1, 0], [0.1, 0.006], [0.07, 0.016], [0, 0.02]], '#eef3f6', { seg: 28, s: [1, 1, 0.42], finish: 'glass' });
  rev(m, [0, -0.528, z0 + 0.975], [0, -1, 0], [[0.105, 0], [0.105, 0.008]], HITAM, { seg: 28, s: [1, 1, 0.45], finish: 'glossy' });
  // panel spidometer
  bodyY(m, { y0: -0.47, y1: -0.385, zb: z0 + 1.02, zt: [[-0.47, z0 + 1.06], [-0.385, z0 + 1.045]], w: 0.085, round: 0.02, n: 4 }, '#111214', { finish: 'glossy' });
  rev(m, [0, -0.43, z0 + 1.062], [0, 0, 1], [[0.05, 0], [0.05, 0.002], [0, 0.003]], '#8fb3c9', { seg: 20, s: [1.3, 0.6, 1], finish: 'glass' });
  for (const sx of [-1, 1]) {
    pipe(m, [[sx * 0.27, -0.405, z0 + 0.985], [sx * 0.34, -0.385, z0 + 0.988], [sx * 0.405, -0.37, z0 + 0.99]], 0.018, KARET, { seg: 12 });
    rev(m, [sx * 0.405, -0.37, z0 + 0.99], [sx, 0.2, 0], [[0.016, 0], [0.016, 0.015], [0, 0.017]], KROM, { seg: 12, finish: 'metal' });
    pipe(m, [[sx * 0.27, -0.44, z0 + 0.99], [sx * 0.31, -0.465, z0 + 0.985], [sx * 0.39, -0.445, z0 + 0.982]], 0.0065, ALU, { seg: 6, finish: 'metal' });
    // spion
    pipe(m, [[sx * 0.2, -0.43, z0 + 1.03], [sx * 0.23, -0.435, z0 + 1.14], [sx * 0.28, -0.44, z0 + 1.21]], 0.007, HITAM, { seg: 6 });
    blob(m, [sx * 0.3, -0.44, z0 + 1.235], [0.056, 0.02, 0.032], HITAM, { finish: 'glossy' });
    blob(m, [sx * 0.3, -0.421, z0 + 1.235], [0.049, 0.004, 0.027], '#c8d6de', { finish: 'metal' });
  }
  return top;
}

export function buildMotor(m, s) {
  const bebek = s.type === 'bebek';
  const R = bebek ? 0.29 : 0.25, FY = bebek ? -0.64 : -0.62, RY = 0.62, z0 = bebek ? 0.03 : 0;
  const body = s.color, aks = s.aksen || HITAM, paint = { finish: 'glossy' };
  // ---- roda
  wheel(m, FY, R, { spoke: s.spoke ?? (bebek ? 'kawat' : 'cor'), disc: 1, rim: s.velg ?? (bebek ? KROM : HITAM), tire: bebek ? 0.04 : 0.045 });
  wheel(m, RY, R, { spoke: s.spoke ?? (bebek ? 'kawat' : 'cor'), drum: bebek ? -0.06 : 0.04, rim: s.velg ?? (bebek ? KROM : HITAM), tire: bebek ? 0.045 : 0.05 });
  // ---- garpu depan (masuk ke bodi depan)
  const head = [0, -0.43, z0 + 0.86], axle = [0, FY, R], dir = head.map((v, j) => v - axle[j]);
  for (const sx of [-1, 1]) {
    const at = (t, dx = 0) => [sx * (0.07 + dx), axle[1] + dir[1] * t, axle[2] + dir[2] * t];
    pipe(m, [at(-0.02, 0.004), at(0.5, 0.004)], 0.024, bebek ? HITAM : ALU, { seg: 12, finish: bebek ? 'glossy' : 'metal' });
    pipe(m, [at(0.45), at(0.7)], 0.016, KROM, { seg: 10, finish: 'metal' });
  }
  pipe(m, [[-0.085, FY, R], [0.085, FY, R]], 0.012, ALU, { seg: 8, finish: 'metal' });
  pipe(m, [[0, -0.47, z0 + 0.84], [0, -0.445, z0 + 0.99]], 0.05, HITAM, { seg: 16, finish: 'glossy' }); // leher stang
  // ---- spakbor depan
  const fArc = [];
  for (let i = 0; i <= 16; i++) { const a = ((bebek ? 20 : 25) + (i / 16) * (bebek ? 135 : 100)) * Math.PI / 180, r = R + 0.035; fArc.push([0, FY - r * Math.cos(a), R + r * Math.sin(a)]); }
  sweep(m, fArc, (t) => ({ w: bebek ? 0.058 : 0.064, h: 0.011, n: 3 }), body, { seg: 14, round: 0.03, ...paint });
  if (bebek) {
    // ---- bebek: tameng kaki, rangka tengah rendah, mesin terbuka, rantai, dua shock
    sweep(m, smoothPath([[0, -0.55, z0 + 0.94], [0, -0.55, z0 + 0.78], [0, -0.5, z0 + 0.58], [0, -0.42, z0 + 0.44], [0, -0.36, z0 + 0.36]], 6),
      (t) => ({ w: curve([[0, 0.14], [0.35, 0.19], [0.75, 0.2], [1, 0.12]])(t), h: curve([[0, 0.08], [0.5, 0.075], [1, 0.05]])(t), n: 3.4 }), body, { seg: 28, round: 0.04, ...paint });
    bodyY(m, { y0: -0.42, y1: 0.12, zb: [[-0.42, z0 + 0.42], [0, z0 + 0.4], [0.12, z0 + 0.46]], zt: [[-0.42, z0 + 0.6], [-0.2, z0 + 0.52], [0.12, z0 + 0.6]], w: [[-0.42, 0.09], [0, 0.08], [0.12, 0.11]], round: 0.05, n: 3 }, body, paint);
    if (s.panel) for (const sx of [-1, 1]) {
      // panel samping dua warna di tameng kaki (gaya bebek sporty)
      sweep(m, smoothPath([[sx * 0.2, -0.56, z0 + 0.82], [sx * 0.205, -0.5, z0 + 0.62], [sx * 0.19, -0.43, z0 + 0.46]], 8), () => ({ w: 0.004, h: 0.03, n: 4 }), s.panel, { seg: 8, round: 0.02, ...paint });
    }
    // mesin: bak mesin aluminium + silinder bersirip miring ke depan
    bodyY(m, { y0: -0.2, y1: 0.24, zb: z0 + 0.12, zt: [[-0.2, z0 + 0.34], [0.05, z0 + 0.38], [0.24, z0 + 0.32]], w: [[-0.2, 0.09], [0, 0.12], [0.24, 0.1]], round: 0.06, n: 2.8 }, ALU, { finish: 'metal' });
    const cyl = [];
    for (let i = 0; i <= 12; i++) cyl.push([i % 2 ? 0.07 : 0.06, i * 0.016]);
    rev(m, [0, -0.17, z0 + 0.27], [0, -0.6, 0.8].map((v) => v / 1), cyl.concat([[0.0, 0.2]]), MESIN, { seg: 16 });
    // penutup rantai (kiri) + lengan ayun + dua shock
    bodyY(m, { y0: 0.12, y1: RY + 0.06, zb: [[0.12, R - 0.02], [RY, R - 0.035]], zt: [[0.12, R + 0.1], [RY, R + 0.05]], w: 0.016, xc: 0.085, round: 0.04, n: 3 }, HITAM, paint);
    for (const sx of [-1, 1]) {
      pipe(m, [[sx * 0.09, 0.16, z0 + 0.27], [sx * 0.095, RY, R]], 0.016, HITAM, { seg: 8 });
      shock(m, [sx * 0.11, RY - 0.03, R + 0.04], [sx * 0.12, 0.47, z0 + 0.66], s.pegas || '#d4a017');
      pipe(m, [[sx * 0.19, -0.04, z0 + 0.3], [sx * 0.27, -0.03, z0 + 0.3]], 0.016, KARET, { seg: 10 }); // pijakan kaki
    }
    // knalpot kanan (-X): leher dari silinder melengkung ke bawah mesin, peredam krom-hitam panjang
    pipe(m, [[-0.02, -0.33, z0 + 0.37], [-0.05, -0.36, z0 + 0.22], [-0.07, -0.2, z0 + 0.1], [-0.12, 0.15, z0 + 0.16], [-0.15, 0.25, z0 + 0.22]], 0.019, '#5b5048', { seg: 10, finish: 'metal' });
    bodyY(m, { y0: 0.2, y1: 0.92, zb: [[0.2, z0 + 0.19], [0.92, z0 + 0.28]], zt: [[0.2, z0 + 0.31], [0.92, z0 + 0.38]], w: 0.05, xc: -0.15, round: 0.06, n: 2.2 }, HITAM, { finish: 'glossy' });
    bodyY(m, { y0: 0.3, y1: 0.66, zb: [[0.3, z0 + 0.24], [0.66, z0 + 0.27]], zt: [[0.3, z0 + 0.34], [0.66, z0 + 0.36]], w: 0.012, xc: -0.205, round: 0.03, n: 3 }, KROM, { finish: 'metal' });
  } else {
    // ---- matic: bodi depan (apron + tameng kaki), dek pijakan datar, mesin CVT kiri, satu shock
    sweep(m, smoothPath([[0, -0.52, 0.93], [0, -0.535, 0.76], [0, -0.48, 0.56], [0, -0.38, 0.41], [0, -0.31, 0.33]], 6),
      (t) => ({ w: curve([[0, 0.15], [0.3, 0.17], [0.65, 0.19], [1, 0.16]])(t), h: curve([[0, 0.1], [0.35, 0.095], [0.7, 0.075], [1, 0.065]])(t), n: 3.6 }), body, { seg: 32, round: 0.04, ...paint });
    // garis aksen di sisi bodi depan
    for (const sx of [-1, 1]) sweep(m, smoothPath([[sx * 0.172, -0.6, 0.86], [sx * 0.19, -0.53, 0.66], [sx * 0.2, -0.45, 0.5]], 8), () => ({ w: 0.004, h: 0.012, n: 4 }), aks, { seg: 8, round: 0.01, ...paint });
    bodyY(m, { y0: -0.36, y1: 0.08, zb: 0.235, zt: 0.345, w: [[-0.36, 0.15], [0, 0.145], [0.08, 0.15]], round: 0.03, n: 5 }, aks, paint);
    bodyY(m, { y0: -0.33, y1: 0.03, zb: 0.33, zt: 0.352, w: 0.125, round: 0.015, n: 8 }, KARET);
    // blok mesin + rumah CVT (kiri, +X) + saringan udara
    const cyl = [];
    for (let i = 0; i <= 10; i++) cyl.push([i % 2 ? 0.068 : 0.058, i * 0.016]);
    rev(m, [0.02, 0.0, 0.25], [0, -1, 0.15], cyl.concat([[0, 0.17]]), MESIN, { seg: 16 });
    bodyY(m, { y0: -0.02, y1: RY + 0.08, zb: [[-0.02, 0.2], [0.3, 0.16], [RY, 0.16], [RY + 0.08, 0.18]], zt: [[-0.02, 0.42], [0.3, 0.4], [RY, 0.34], [RY + 0.08, 0.33]], w: 0.05, xc: 0.12, round: 0.08, n: 2.8 }, MESIN, { finish: 'glossy' });
    bodyY(m, { y0: 0.06, y1: RY - 0.02, zb: [[0.06, 0.23], [RY - 0.02, 0.2]], zt: [[0.06, 0.39], [RY - 0.02, 0.31]], w: 0.012, xc: 0.168, round: 0.05, n: 3 }, ALU, { finish: 'metal' });
    bodyY(m, { y0: 0.14, y1: 0.46, zb: 0.37, zt: 0.47, w: 0.045, xc: 0.115, round: 0.04, n: 3 }, HITAM, paint);
    shock(m, [0.125, RY - 0.03, 0.34], [0.125, 0.48, 0.64], s.pegas || '#c62828');
    // knalpot kanan (-X)
    pipe(m, [[0.0, -0.12, 0.24], [-0.03, -0.12, 0.14], [-0.08, 0.1, 0.16], [-0.13, 0.22, 0.27]], 0.018, '#5b5048', { seg: 10, finish: 'metal' });
    bodyY(m, { y0: 0.18, y1: 0.78, zb: [[0.18, 0.25], [0.78, 0.29]], zt: [[0.18, 0.39], [0.5, 0.42], [0.78, 0.41]], w: [[0.18, 0.05], [0.6, 0.06], [0.78, 0.05]], xc: -0.14, round: 0.08, n: 2.4 }, '#2a2b2e', { finish: 'glossy' });
    bodyY(m, { y0: 0.26, y1: 0.56, zb: 0.29, zt: 0.42, w: 0.012, xc: -0.195, round: 0.04, n: 3 }, KROM, { finish: 'metal' });
    rev(m, [-0.14, 0.785, 0.35], [0, 1, 0], [[0.022, 0], [0.026, 0.02], [0.018, 0.022]], KROM, { seg: 14, finish: 'metal' });
    for (const sx of [-1, 1]) pipe(m, [[sx * 0.165, 0.36, 0.38], [sx * 0.21, 0.37, 0.38]], 0.012, KARET, { seg: 8 }); // pijakan boncenger
  }
  // ---- bodi belakang (di bawah jok) + garis aksen
  const zt = curve(bebek ? [[0, z0 + 0.66], [0.25, z0 + 0.7], [0.6, z0 + 0.72], [0.9, z0 + 0.76], [1.0, z0 + 0.76]] : [[0, 0.66], [0.2, 0.7], [0.6, 0.72], [0.9, 0.76], [1.0, 0.76]]);
  const zb = bebek ? [[0.02, z0 + 0.46], [0.3, z0 + 0.5], [0.55, z0 + 0.62], [0.8, z0 + 0.64], [1.0, z0 + 0.68]] : [[0, 0.27], [0.12, 0.31], [0.3, 0.44], [0.5, 0.57], [0.75, 0.6], [1.0, 0.66]];
  const wR = curve([[0, 0.14], [0.15, 0.16], [0.5, 0.165], [0.8, 0.13], [1.0, 0.075]]);
  bodyY(m, { y0: bebek ? 0.02 : 0.0, y1: 1.0, zt: (y) => zt(y), zb, w: (y) => wR(y), round: 0.06, n: 2.8, steps: 32, seg: 32 }, body, paint);
  for (const sx of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 20; i++) { const y = lerp(0.18, 0.92, i / 20); pts.push([sx * (wR(y) * 0.985 + 0.003), y, zt(y) - 0.07 - 0.04 * (i / 20)]); }
    sweep(m, pts, () => ({ w: 0.003, h: 0.01, n: 4 }), s.garis || aks, { seg: 8, round: 0.02, ...paint });
  }
  // jok
  bodyY(m, { y0: bebek ? -0.06 : 0.04, y1: 0.87, zb: (y) => zt(y) - 0.025, zt: (y) => zt(y) + curve([[0, 0.07], [0.5, 0.075], [0.75, 0.06], [0.87, 0.05]])(y) + (y > 0.6 ? 0.012 : 0), w: curve([[0, 0.11], [0.25, 0.15], [0.6, 0.14], [0.87, 0.11]]), round: 0.05, n: 2.3, steps: 30, seg: 30 }, '#141416');
  // lampu belakang + sein
  bodyY(m, { y0: 0.955, y1: 1.035, zb: z0 + 0.705, zt: z0 + 0.765, w: 0.062, round: 0.03, n: 3 }, '#c0141c', { finish: 'glossy' });
  for (const sx of [-1, 1]) {
    blob(m, [sx * 0.085, 0.985, z0 + 0.69], [0.022, 0.03, 0.015], '#f0a020', { finish: 'glossy' });
    blob(m, [sx * (bebek ? 0.2 : 0.165), bebek ? -0.56 : -0.56, z0 + 0.86], [0.02, 0.035, 0.016], '#f0a020', { finish: 'glossy' });
  }
  // pegangan boncenger
  pipe(m, [[0.135, 0.5, z0 + 0.735], [0.15, 0.82, z0 + 0.79], [0.07, 0.95, z0 + 0.81], [-0.07, 0.95, z0 + 0.81], [-0.15, 0.82, z0 + 0.79], [-0.135, 0.5, z0 + 0.735]], 0.011, s.rail ?? ALU, { seg: 10, finish: 'metal' });
  // spakbor belakang + plat nomor (hitam, tepi putih)
  sweep(m, smoothPath([[0, 0.86, z0 + 0.64], [0, 0.97, z0 + 0.55], [0, 1.0, z0 + 0.43]], 6), () => ({ w: 0.07, h: 0.009, n: 3 }), HITAM, { seg: 12, round: 0.02 });
  bodyY(m, { y0: 1.0, y1: 1.008, zb: z0 + 0.4, zt: z0 + 0.51, w: 0.103, n: 14, seg: 32, steps: 2 }, '#f2f2ee', { cap: true });
  bodyY(m, { y0: 1.008, y1: 1.012, zb: z0 + 0.405, zt: z0 + 0.505, w: 0.097, n: 14, seg: 32, steps: 2 }, '#141414', { cap: true });
  // plat depan
  bodyY(m, { y0: -0.645, y1: -0.637, zb: z0 + 0.55, zt: z0 + 0.64, w: 0.1, n: 14, seg: 32, steps: 2 }, '#f2f2ee', { cap: true });
  bodyY(m, { y0: -0.649, y1: -0.645, zb: z0 + 0.555, zt: z0 + 0.635, w: 0.094, n: 14, seg: 32, steps: 2 }, '#141414', { cap: true });
  // stang, lampu, spion; standar samping (kiri, +X)
  frontEnd(m, { body, z0 });
  pipe(m, [[0.1, 0.05, z0 + 0.2], [0.17, 0.1, z0 + 0.09], [0.21, 0.14, 0.012]], 0.009, HITAM, { seg: 6 });
}

// ---------- Sport full-fairing (gaya sport 250 cc): fairing bersudut, lampu kembar menyipit ke belakang, kaca depan,
// ventilasi samping, perut hitam, tangki besar, jok terpisah, buntut lancip, knalpot pendek bersudut ----------
export function buildSport(m, s) {
  const body = s.color, aks = s.aksen || HITAM, gar = s.garis || '#f2f2f2', paint = { finish: 'glossy' };
  const FY = -0.71, RY = 0.7, Rf = 0.3, Rr = 0.315;
  wheel(m, FY, Rf, { spoke: 'cor', disc: 1, discR: 0.145, rim: s.velg ?? HITAM, tire: 0.055, wall: 0.075 });
  wheel(m, RY, Rr, { spoke: 'cor', disc: -1, discR: 0.11, rim: s.velg ?? HITAM, tire: 0.07, wall: 0.09 });
  // garpu teleskopik: tabung luar gelap, tabung dalam krom
  const head = [0, -0.5, 0.95], axle = [0, FY, Rf], dir = head.map((v, j) => v - axle[j]);
  for (const sx of [-1, 1]) {
    const at = (t) => [sx * 0.085, axle[1] + dir[1] * t, axle[2] + dir[2] * t];
    pipe(m, [at(-0.03), at(0.42)], 0.026, s.garpu ?? '#34373b', { seg: 12, finish: 'metal' });
    pipe(m, [at(0.38), at(0.78)], 0.019, KROM, { seg: 10, finish: 'metal' });
  }
  pipe(m, [[-0.1, FY, Rf], [0.1, FY, Rf]], 0.012, ALU, { seg: 8, finish: 'metal' });
  // spakbor depan bersudut
  const fa = [];
  for (let i = 0; i <= 14; i++) { const a = (40 + i * 6.5) * Math.PI / 180, r = Rf + 0.028; fa.push([0, FY - r * Math.cos(a), Rf + r * Math.sin(a)]); }
  sweep(m, fa, (t) => ({ w: lerp(0.05, 0.072, Math.min(1, t * 2)), h: 0.01, n: 4 }), body, { seg: 16, round: 0.025, ...paint });
  // fairing depan bersudut (atas sempit, bawah lebar)
  const cT = curve([[-0.9, 0.79], [-0.8, 0.85], [-0.66, 0.92], [-0.52, 0.97], [-0.42, 0.99]]);
  const cB = curve([[-0.9, 0.755], [-0.8, 0.7], [-0.66, 0.63], [-0.52, 0.57], [-0.42, 0.56]]);
  const cW = curve([[-0.9, 0.02], [-0.8, 0.09], [-0.66, 0.155], [-0.52, 0.2], [-0.42, 0.205]]);
  const cowl = bodyY(m, { y0: -0.9, y1: -0.42, zt: cT, zb: cB, w: cW, wt: (y) => cW(y) * 0.55, wb: (y) => cW(y) * 0.8, round: 0.02, n: 3.6, steps: 36, seg: 40 }, body, paint);
  // lampu kembar: lebar di depan, menyipit ke belakang (bingkai gelap + kaca)
  for (const sx of [-1, 1]) {
    const eye = (pad) => (y) => { const t = Math.min(1, Math.max(0, (y + 0.885) / 0.205)), ac = lerp(-0.05, 0.28, t), hw = lerp(0.42, 0.05, t ** 0.8) + pad; return [ac - hw, ac + hw]; };
    patch(m, cowl, -0.888, -0.66, sideR(sx, eye(0.06)), '#16181a', { lift: 0.001, ny: 14, na: 8 });
    patch(m, cowl, -0.882, -0.68, sideR(sx, eye(0)), '#e3ebf0', { lift: 0.0025, ny: 14, na: 8, finish: 'metal' });
    pipe(m, [[sx * 0.16, -0.63, 0.78], [sx * 0.21, -0.64, 0.775]], 0.006, HITAM, { seg: 6 });
    blob(m, [sx * 0.225, -0.645, 0.775], [0.024, 0.018, 0.011], '#f0a020', { finish: 'glossy' }); // sein bertangkai
  }
  patch(m, cowl, -0.895, -0.8, () => [-Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55], '#141518', { lift: 0.0015, ny: 6, na: 8 }); // lubang udara dagu
  // kaca depan berwarna gelap, naik ke belakang
  bodyY(m, { y0: -0.72, y1: -0.45, zb: (y) => cT(y) - 0.012, zt: (y) => cT(y) + curve([[-0.72, 0], [-0.6, 0.05], [-0.45, 0.1]])(y), w: (y) => cW(y) * 0.58, wt: (y) => cW(y) * 0.42, round: 0.02, n: 2.8 }, '#4a5966', { finish: 'glass' });
  // fairing samping: panel bawah hitam + garis putih + ventilasi berkisi
  const fT = curve([[-0.54, 0.94], [-0.38, 0.88], [-0.15, 0.8], [0.08, 0.74]]), fB = curve([[-0.54, 0.52], [-0.4, 0.42], [-0.18, 0.38], [0.08, 0.48]]);
  const fW = curve([[-0.54, 0.205], [-0.3, 0.212], [0.08, 0.15]]);
  const side = bodyY(m, { y0: -0.54, y1: 0.08, zt: fT, zb: fB, w: fW, wt: (y) => fW(y) * 0.7, wb: (y) => fW(y) * 0.72, round: 0.04, n: 3.8, steps: 34, seg: 40 }, body, paint);
  for (const sx of [-1, 1]) {
    const edge = (y) => lerp(-0.42, -0.08, (y + 0.5) / 0.56);
    patch(m, side, -0.5, 0.06, sideR(sx, (y) => [-1.4, edge(y)]), aks, { ny: 16, na: 6, ...paint });
    patch(m, side, -0.47, 0.04, sideR(sx, (y) => [edge(y) + 0.02, edge(y) + 0.07]), gar, { ny: 16, na: 2, lift: 0.002, ...paint });
    patch(m, side, -0.5, -0.33, sideR(sx, (y) => [0.12, 0.58 - (y + 0.5) * 1.2]), '#141518', { ny: 6, na: 6, lift: 0.002 });
    for (const a of [0.22, 0.34, 0.46]) patch(m, side, -0.49, -0.35, sideR(sx, () => [a, a + 0.035]), body, { ny: 4, na: 1, lift: 0.0035, ...paint });
  }
  // radiator di balik roda depan, mesin dua silinder, perut bawah hitam
  bodyY(m, { y0: -0.47, y1: -0.43, zb: 0.42, zt: 0.7, w: 0.15, n: 6, round: 0.01 }, '#202226');
  bodyY(m, { y0: -0.3, y1: 0.14, zb: 0.2, zt: 0.55, w: 0.15, round: 0.04, n: 3.6 }, '#232427', paint);
  bodyY(m, { y0: -0.42, y1: 0.12, zb: 0.17, zt: 0.37, w: [[-0.42, 0.12], [-0.1, 0.145], [0.12, 0.1]], wt: [[-0.42, 0.13], [0.12, 0.12]], wb: [[-0.42, 0.06], [0.12, 0.05]], round: 0.04, n: 3.6 }, aks, paint);
  // tangki besar bersudut
  const tank = bodyY(m, { y0: -0.46, y1: 0.14, zb: [[-0.46, 0.82], [0.14, 0.75]], zt: [[-0.46, 0.96], [-0.3, 1.0], [-0.08, 0.99], [0.14, 0.85]], w: [[-0.46, 0.13], [-0.2, 0.17], [0.14, 0.125]], wt: (y) => curve([[-0.46, 0.07], [-0.2, 0.095], [0.14, 0.07]])(y), wb: (y) => curve([[-0.46, 0.12], [-0.2, 0.16], [0.14, 0.12]])(y), round: 0.05, n: 3.4, steps: 30, seg: 36 }, body, paint);
  for (const sx of [-1, 1]) patch(m, tank, -0.12, 0.12, sideR(sx, () => [-0.75, 0.15]), aks, { ny: 8, na: 6, ...paint }); // pelindung lutut
  rev(m, [0, -0.2, 0.996], [0, 0.12, 1], [[0.036, 0], [0.036, 0.008], [0, 0.01]], ALU, { seg: 14, finish: 'metal' });
  // jok pengendara, buntut lancip + jok boncenger, lampu belakang
  bodyY(m, { y0: 0.1, y1: 0.45, zb: 0.76, zt: [[0.1, 0.84], [0.3, 0.825], [0.45, 0.845]], w: [[0.1, 0.12], [0.3, 0.14], [0.45, 0.105]], wt: (y) => curve([[0.1, 0.1], [0.3, 0.12], [0.45, 0.09]])(y), round: 0.04, n: 3.2 }, '#141416');
  const tT = curve([[0.06, 0.8], [0.44, 0.82], [0.62, 0.865], [1.0, 0.935]]), tW = curve([[0.06, 0.14], [0.42, 0.13], [0.72, 0.1], [1.0, 0.035]]);
  const tail = bodyY(m, { y0: 0.06, y1: 1.0, zb: [[0.06, 0.62], [0.4, 0.68], [1.0, 0.87]], zt: tT, w: tW, wt: (y) => tW(y) * 0.75, wb: (y) => tW(y) * 0.6, round: 0.03, n: 3.6, steps: 32, seg: 36 }, body, paint);
  for (const sx of [-1, 1]) {
    patch(m, tail, 0.5, 0.96, sideR(sx, (y) => [-0.9, lerp(-0.25, -0.05, (y - 0.5) / 0.46)]), aks, { ny: 12, na: 4, ...paint });
    patch(m, tail, 0.52, 0.94, sideR(sx, (y) => { const e = lerp(-0.25, -0.05, (y - 0.52) / 0.42); return [e + 0.02, e + 0.06]; }), gar, { ny: 12, na: 2, lift: 0.002, ...paint });
  }
  bodyY(m, { y0: 0.47, y1: 0.77, zb: (y) => tT(y) - 0.02, zt: (y) => tT(y) + 0.045, w: [[0.47, 0.09], [0.77, 0.06]], wt: [[0.47, 0.075], [0.77, 0.05]], round: 0.03, n: 3.2 }, '#141416');
  bodyY(m, { y0: 0.93, y1: 1.006, zb: 0.84, zt: 0.88, w: [[0.93, 0.06], [1.006, 0.028]], round: 0.01, n: 4 }, '#c0141c', { finish: 'glossy' });
  // spakbor belakang + plat + sein
  sweep(m, smoothPath([[0, 0.88, 0.81], [0, 1.0, 0.69], [0, 1.05, 0.56]], 6), () => ({ w: 0.06, h: 0.008, n: 4 }), HITAM, { seg: 12, round: 0.02 });
  bodyY(m, { y0: 1.05, y1: 1.058, zb: 0.45, zt: 0.555, w: 0.103, n: 14, seg: 32, steps: 2 }, '#f2f2ee', { cap: true });
  bodyY(m, { y0: 1.058, y1: 1.062, zb: 0.455, zt: 0.55, w: 0.097, n: 14, seg: 32, steps: 2 }, '#141414', { cap: true });
  for (const sx of [-1, 1]) {
    pipe(m, [[sx * 0.04, 1.02, 0.63], [sx * 0.1, 1.03, 0.63]], 0.006, HITAM, { seg: 6 });
    blob(m, [sx * 0.115, 1.03, 0.63], [0.024, 0.018, 0.012], '#f0a020', { finish: 'glossy' });
  }
  // dua leher knalpot -> peredam pendek bersudut (pelindung panas perak) di kanan
  for (const dx of [0.035, -0.035]) pipe(m, [[dx, -0.45, 0.42], [dx, -0.43, 0.2], [dx * 0.5 - 0.05, -0.15, 0.15], [-0.12, 0.15, 0.22]], 0.02, '#5b5048', { seg: 10, finish: 'metal' });
  const muf = bodyY(m, { y0: 0.2, y1: 0.66, zb: [[0.2, 0.24], [0.66, 0.41]], zt: [[0.2, 0.37], [0.66, 0.55]], w: 0.065, wt: 0.05, wb: 0.05, xc: -0.17, round: 0.05, n: 3.8 }, s.knalpot ?? '#26272a', { finish: 'metal' });
  patch(m, muf, 0.27, 0.6, () => [Math.PI - 0.7, Math.PI + 0.6], ALU, { ny: 10, na: 6, lift: 0.004, finish: 'metal' });
  rev(m, [-0.17, 0.665, 0.48], [0, 1, 0.38], [[0.035, 0], [0.04, 0.02], [0.03, 0.022]], KROM, { seg: 14, finish: 'metal' });
  // lengan ayun aluminium, gir & rantai
  for (const sx of [-1, 1]) sweep(m, smoothPath([[sx * 0.095, 0.14, 0.4], [sx * 0.095, RY, Rr]], 4), () => ({ w: 0.018, h: 0.042, n: 4 }), ALU, { seg: 12, finish: 'metal', cap: true });
  rev(m, [0.115, RY, Rr], [1, 0, 0], [[0.1, 0], [0.1, 0.008]], HITAM, { seg: 28, closed: false });
  pipe(m, [[0.115, 0.14, 0.42], [0.115, RY, Rr + 0.1]], 0.006, '#3b3b3b', { seg: 6 });
  pipe(m, [[0.115, 0.14, 0.34], [0.115, RY, Rr - 0.1]], 0.006, '#3b3b3b', { seg: 6 });
  // setang jepit, spion di fairing, pijakan, standar
  for (const sx of [-1, 1]) {
    pipe(m, [[sx * 0.09, -0.46, 0.94], [sx * 0.22, -0.42, 0.925], [sx * 0.31, -0.39, 0.915]], 0.012, HITAM, { seg: 8 });
    pipe(m, [[sx * 0.215, -0.415, 0.925], [sx * 0.33, -0.385, 0.915]], 0.018, KARET, { seg: 12 });
    pipe(m, [[sx * 0.21, -0.45, 0.93], [sx * 0.26, -0.475, 0.925], [sx * 0.32, -0.45, 0.92]], 0.006, ALU, { seg: 6, finish: 'metal' });
    pipe(m, [[sx * 0.15, -0.6, 0.92], [sx * 0.22, -0.59, 0.965], [sx * 0.25, -0.58, 0.985]], 0.008, HITAM, { seg: 6 });
    bodyY(m, { y0: -0.6, y1: -0.555, zb: 0.97, zt: 1.02, w: 0.05, wt: 0.04, xc: sx * 0.285, round: 0.012, n: 3.6 }, HITAM, paint);
    blob(m, [sx * 0.285, -0.553, 0.995], [0.042, 0.003, 0.02], '#c8d6de', { finish: 'metal' });
    pipe(m, [[sx * 0.15, 0.12, 0.38], [sx * 0.21, 0.12, 0.38]], 0.011, ALU, { seg: 8, finish: 'metal' });
    pipe(m, [[sx * 0.14, 0.42, 0.5], [sx * 0.19, 0.42, 0.5]], 0.011, HITAM, { seg: 8 });
  }
  pipe(m, [[0.11, 0.08, 0.22], [0.18, 0.12, 0.1], [0.22, 0.16, 0.012]], 0.009, HITAM, { seg: 6 });
}

// ---------- Motor laki (sport naked klasik): lampu bulat krom, dua jam, tangki bersudut dengan striping miring,
// tutup samping segitiga, mesin satu silinder bersirip berkelir perak, knalpot krom panjang, dua shock ----------
export function buildNaked(m, s) {
  const body = s.color, gar = s.garis ?? '#f2f2f2', paint = { finish: 'glossy' };
  const FY = -0.68, RY = 0.66, Rf = 0.3, Rr = 0.31;
  wheel(m, FY, Rf, { spoke: s.spoke ?? 'cor', disc: 1, discR: 0.13, rim: s.velg ?? HITAM, tire: 0.045, wall: 0.075 });
  wheel(m, RY, Rr, { spoke: s.spoke ?? 'cor', drum: -0.07, rim: s.velg ?? HITAM, tire: 0.055, wall: 0.08 });
  const head = [0, -0.47, 0.95], axle = [0, FY, Rf], dir = head.map((v, j) => v - axle[j]);
  for (const sx of [-1, 1]) {
    const at = (t) => [sx * 0.08, axle[1] + dir[1] * t, axle[2] + dir[2] * t];
    pipe(m, [at(-0.03), at(0.45)], 0.024, ALU, { seg: 12, finish: 'metal' });
    pipe(m, [at(0.4), at(1.04)], 0.017, KROM, { seg: 10, finish: 'metal' });
  }
  for (const t of [0.86, 1.03]) pipe(m, [[-0.1, axle[1] + dir[1] * t, axle[2] + dir[2] * t], [0.1, axle[1] + dir[1] * t, axle[2] + dir[2] * t]], 0.022, HITAM, { seg: 10 });
  pipe(m, [[-0.1, FY, Rf], [0.1, FY, Rf]], 0.012, ALU, { seg: 8, finish: 'metal' });
  // lampu bulat: rumah hitam, bingkai krom, kaca; dua jam krom; sein bulat bertangkai
  const hl = [0, -0.62, 0.9];
  rev(m, hl, [0, -1, 0], [[0, -0.1], [0.07, -0.09], [0.095, -0.05], [0.1, 0]], s.lampu ?? HITAM, { seg: 32, finish: 'glossy' });
  rev(m, hl, [0, -1, 0], [[0.1, 0], [0.104, 0.008], [0.098, 0.016]], KROM, { seg: 32, finish: 'metal' });
  rev(m, hl, [0, -1, 0], [[0.096, 0.012], [0.07, 0.025], [0, 0.03]], '#eef3f6', { seg: 32, finish: 'glass' });
  for (const sx of [-1, 1]) {
    rev(m, [sx * 0.065, -0.54, 1.04], [0, -0.35, 0.94], [[0, 0], [0.042, 0], [0.047, 0.01], [0.047, 0.04], [0, 0.04]], KROM, { seg: 20, finish: 'metal' });
    rev(m, [sx * 0.065, -0.54 - 0.35 * 0.041, 1.04 + 0.94 * 0.041], [0, -0.35, 0.94], [[0.041, 0], [0, 0.002]], '#e9eef0', { seg: 20, finish: 'glass' });
    rev(m, [sx * 0.065, -0.54 - 0.35 * 0.0425, 1.04 + 0.94 * 0.0425], [0, -0.35, 0.94], [[0.036, 0], [0, 0.0005]], '#1b1d20', { seg: 20 });
    pipe(m, [[sx * 0.09, -0.6, 0.84], [sx * 0.19, -0.6, 0.85]], 0.007, HITAM, { seg: 6 });
    rev(m, [sx * 0.2, -0.6, 0.85], [0, -1, 0], [[0, -0.03], [0.026, -0.025], [0.03, 0], [0.026, 0.008], [0, 0.012]], '#f0a020', { seg: 16, finish: 'glossy' });
  }
  // setang pipa krom + grip + tuas + spion bulat
  pipe(m, [[-0.38, -0.38, 1.08], [-0.24, -0.44, 1.06], [-0.1, -0.47, 1.04], [0.1, -0.47, 1.04], [0.24, -0.44, 1.06], [0.38, -0.38, 1.08]], 0.011, KROM, { seg: 10, finish: 'metal' });
  for (const sx of [-1, 1]) {
    pipe(m, [[sx * 0.27, -0.425, 1.065], [sx * 0.4, -0.37, 1.082]], 0.018, KARET, { seg: 12 });
    pipe(m, [[sx * 0.24, -0.47, 1.06], [sx * 0.3, -0.5, 1.055], [sx * 0.38, -0.46, 1.07]], 0.006, ALU, { seg: 6, finish: 'metal' });
    pipe(m, [[sx * 0.21, -0.45, 1.07], [sx * 0.24, -0.45, 1.17], [sx * 0.28, -0.45, 1.25]], 0.006, KROM, { seg: 6, finish: 'metal' });
    rev(m, [sx * 0.29, -0.45, 1.27], [0, 1, 0], [[0, -0.012], [0.045, -0.01], [0.048, 0], [0.045, 0.006], [0, 0.007]], HITAM, { seg: 18 });
    rev(m, [sx * 0.29, -0.443, 1.27], [0, 1, 0], [[0.04, 0], [0, 0.001]], '#c8d6de', { seg: 18, finish: 'metal' });
  }
  // rangka pipa (cradle) + rangka belakang
  pipe(m, [[0, -0.46, 0.9], [0, -0.38, 0.62], [0, -0.3, 0.3], [0, -0.15, 0.17], [0, 0.15, 0.18], [0, 0.24, 0.45], [0, 0.26, 0.72]], 0.02, HITAM, { seg: 10, per: 6 });
  pipe(m, [[0, -0.46, 0.92], [0, 0.0, 0.85], [0, 0.26, 0.76]], 0.025, HITAM, { seg: 10 });
  for (const sx of [-1, 1]) pipe(m, [[sx * 0.1, 0.24, 0.6], [sx * 0.1, 0.6, 0.76], [sx * 0.1, 0.92, 0.78]], 0.013, HITAM, { seg: 8 });
  // mesin: bak mesin perak bersudut, tutup kopling (kanan) & magnet (kiri), silinder hitam bersirip bertepi perak
  bodyY(m, { y0: -0.24, y1: 0.22, zb: 0.2, zt: [[-0.24, 0.42], [0, 0.47], [0.22, 0.44]], w: [[-0.24, 0.1], [0, 0.125], [0.22, 0.11]], wt: 0.1, wb: 0.09, round: 0.06, n: 3.6 }, ALU, { finish: 'metal' });
  rev(m, [-0.12, 0.03, 0.32], [-1, 0, 0], [[0, 0], [0.09, 0], [0.095, 0.015], [0.08, 0.03], [0, 0.035]], ALU, { seg: 24, finish: 'metal' });
  rev(m, [0.12, -0.12, 0.3], [1, 0, 0], [[0, 0], [0.07, 0], [0.074, 0.012], [0.06, 0.025], [0, 0.028]], ALU, { seg: 20, finish: 'metal' });
  const cy0 = [0, -0.13, 0.42], cax = [0, -0.26, 0.97];
  rev(m, cy0, cax, [[0.066, 0], [0.066, 0.22], [0, 0.22]], s.mesin ?? MESIN, { seg: 20, finish: 'glossy' });
  for (let i = 0; i < 7; i++) {
    const c = cy0.map((v, j) => v + cax[j] * (0.03 + i * 0.027));
    rev(m, c, cax, [[0.066, 0], [0.088, 0.002], [0.088, 0.009], [0.066, 0.011]], i % 1 ? MESIN : '#2c2f33', { seg: 24, finish: 'glossy' });
    rev(m, c, cax, [[0.0885, 0.002], [0.0885, 0.009]], ALU, { seg: 24, finish: 'metal' });
  }
  blob(m, [0, -0.2, 0.67], [0.075, 0.07, 0.035], ALU, { finish: 'metal' });
  bodyY(m, { y0: 0.0, y1: 0.18, zb: 0.55, zt: 0.68, w: 0.055, xc: 0.03, round: 0.04, n: 3 }, HITAM, paint);
  // tangki bersudut + striping miring + emblem + karet lutut
  const tank = bodyY(m, { y0: -0.44, y1: 0.12, zb: [[-0.44, 0.84], [-0.2, 0.8], [0.12, 0.78]], zt: [[-0.44, 0.96], [-0.28, 1.04], [-0.05, 1.02], [0.12, 0.91]], w: [[-0.44, 0.1], [-0.2, 0.155], [0.12, 0.115]], wt: (y) => curve([[-0.44, 0.06], [-0.2, 0.095], [0.12, 0.07]])(y), wb: (y) => curve([[-0.44, 0.09], [-0.2, 0.14], [0.12, 0.1]])(y), round: 0.06, n: 3.2, steps: 32, seg: 36 }, body, paint);
  for (const sx of [-1, 1]) {
    for (const [d, wd] of [[0, 0.09], [0.13, 0.035]]) patch(m, tank, -0.4, 0.08, sideR(sx, (y) => { const c = lerp(0.95, -0.55, (y + 0.4) / 0.48) - d; return [c - wd, c + wd]; }), gar, { ny: 16, na: 3, lift: 0.0015, ...paint });
    patch(m, tank, -0.3, -0.16, sideR(sx, () => [0.05, 0.42]), s.emblem ?? '#d9dde0', { ny: 6, na: 4, lift: 0.0028, finish: 'metal' });
    patch(m, tank, -0.02, 0.1, sideR(sx, () => [-0.55, 0.05]), KARET, { ny: 5, na: 4, lift: 0.002 });
  }
  rev(m, [0, -0.22, 1.035], [0, 0, 1], [[0.035, 0], [0.035, 0.01], [0, 0.012]], KROM, { seg: 16, finish: 'metal' });
  // tutup samping segitiga + striping, jok datar panjang, pegangan krom
  const sc = bodyY(m, { y0: 0.02, y1: 0.42, zb: [[0.02, 0.62], [0.22, 0.52], [0.42, 0.66]], zt: 0.8, w: 0.115, wt: 0.105, wb: 0.09, round: 0.035, n: 4.2 }, body, paint);
  for (const sx of [-1, 1]) patch(m, sc, 0.06, 0.38, sideR(sx, () => [0.28, 0.42]), gar, { ny: 8, na: 2, lift: 0.0018, ...paint });
  bodyY(m, { y0: 0.04, y1: 0.86, zb: 0.79, zt: [[0.04, 0.88], [0.35, 0.875], [0.86, 0.88]], w: [[0.04, 0.11], [0.3, 0.135], [0.86, 0.12]], wt: (y) => curve([[0.04, 0.09], [0.3, 0.12], [0.86, 0.105]])(y), round: 0.045, n: 3.6, steps: 30, seg: 32 }, '#141416');
  pipe(m, [[0.125, 0.55, 0.82], [0.13, 0.86, 0.85], [0.05, 0.93, 0.86], [-0.05, 0.93, 0.86], [-0.13, 0.86, 0.85], [-0.125, 0.55, 0.82]], 0.011, KROM, { seg: 10, finish: 'metal' });
  // spakbor depan/belakang, lampu belakang kotak di atas spakbor, plat, sein bulat
  const fa = [];
  for (let i = 0; i <= 16; i++) { const a = (15 + i * 8.5) * Math.PI / 180, r = Rf + 0.04; fa.push([0, FY - r * Math.cos(a), Rf + r * Math.sin(a)]); }
  sweep(m, fa, () => ({ w: 0.06, h: 0.01, n: 3 }), s.spakbor ?? body, { seg: 14, round: 0.03, ...paint });
  const ra = [];
  for (let i = 0; i <= 16; i++) { const a = (20 + i * 6) * Math.PI / 180, r = Rr + 0.05; ra.push([0, RY + r * Math.cos(a), Rr + r * Math.sin(a)]); }
  sweep(m, ra, () => ({ w: 0.075, h: 0.01, n: 3 }), s.spakbor ?? body, { seg: 14, round: 0.03, ...paint });
  bodyY(m, { y0: 0.9, y1: 0.99, zb: 0.735, zt: 0.79, w: 0.065, wt: 0.06, round: 0.012, n: 6 }, '#c0141c', { finish: 'glossy' });
  bodyY(m, { y0: 0.9, y1: 0.985, zb: 0.715, zt: 0.738, w: 0.06, round: 0.01, n: 6 }, KROM, { finish: 'metal' });
  bodyY(m, { y0: 0.98, y1: 0.988, zb: 0.29, zt: 0.39, w: 0.103, n: 14, seg: 32, steps: 2 }, '#f2f2ee', { cap: true });
  bodyY(m, { y0: 0.988, y1: 0.992, zb: 0.295, zt: 0.385, w: 0.097, n: 14, seg: 32, steps: 2 }, '#141414', { cap: true });
  for (const sx of [-1, 1]) {
    pipe(m, [[sx * 0.07, 0.92, 0.7], [sx * 0.16, 0.93, 0.7]], 0.007, HITAM, { seg: 6 });
    rev(m, [sx * 0.17, 0.93, 0.7], [0, 1, 0], [[0, -0.03], [0.026, -0.025], [0.03, 0], [0.026, 0.008], [0, 0.012]], '#f0a020', { seg: 16, finish: 'glossy' });
  }
  // knalpot krom panjang (kanan) dengan pelindung panas hitam, dua shock, lengan ayun, penutup rantai, pijakan, standar
  pipe(m, [[-0.02, -0.33, 0.6], [-0.06, -0.36, 0.42], [-0.11, -0.2, 0.27], [-0.15, 0.2, 0.31]], 0.02, KROM, { seg: 10, finish: 'metal' });
  const muf = bodyY(m, { y0: 0.18, y1: 0.98, zb: [[0.18, 0.26], [0.98, 0.37]], zt: [[0.18, 0.37], [0.98, 0.48]], w: 0.052, xc: -0.16, round: 0.08, n: 2.0, steps: 30 }, KROM, { finish: 'metal' });
  patch(m, muf, 0.22, 0.46, () => [Math.PI - 0.95, Math.PI + 0.8], '#1f2023', { ny: 8, na: 6, lift: 0.004, finish: 'glossy' });
  rev(m, [-0.16, 0.985, 0.425], [0, 1, 0.14], [[0.03, 0], [0.036, 0.012], [0.026, 0.016]], HITAM, { seg: 16 });
  for (const sx of [-1, 1]) {
    pipe(m, [[sx * 0.09, 0.16, 0.32], [sx * 0.095, RY, Rr]], 0.018, HITAM, { seg: 8 });
    shock(m, [sx * 0.12, RY - 0.03, Rr + 0.05], [sx * 0.12, 0.54, 0.79], s.pegas ?? KROM);
    pipe(m, [[sx * 0.15, 0.05, 0.33], [sx * 0.22, 0.05, 0.33]], 0.015, KARET, { seg: 10 });
    pipe(m, [[sx * 0.13, 0.42, 0.42], [sx * 0.19, 0.42, 0.42]], 0.012, KARET, { seg: 8 });
  }
  bodyY(m, { y0: 0.14, y1: RY + 0.05, zb: [[0.14, Rr], [RY, Rr - 0.02]], zt: [[0.14, Rr + 0.1], [RY, Rr + 0.06]], w: 0.012, xc: 0.105, round: 0.03, n: 3 }, HITAM, paint);
  pipe(m, [[0.1, 0.06, 0.22], [0.17, 0.11, 0.1], [0.21, 0.15, 0.012]], 0.009, HITAM, { seg: 6 });
}

// ---------- Bebek klasik (gaya bebek 100 cc akhir 90-an): lampu trapesium lebar di tutup stang dengan sein di kedua ujung,
// tameng kaki tipis tegak + penutup leher stang, spakbor depan panjang, roda jari-jari, striping miring di bodi samping ----------
export function buildSupra(m, s) {
  const body = s.color, paint = { finish: 'glossy' };
  const R = 0.29, FY = -0.63, RY = 0.6, z0 = 0.03, Z = (v) => z0 + v;
  wheel(m, FY, R, { spoke: 'kawat', disc: 1, rim: KROM, tire: 0.04 });
  wheel(m, RY, R, { spoke: 'kawat', drum: -0.06, rim: KROM, tire: 0.045 });
  const head = [0, -0.44, Z(0.86)], axle = [0, FY, R], dir = head.map((v, j) => v - axle[j]);
  for (const sx of [-1, 1]) {
    const at = (t) => [sx * 0.07, axle[1] + dir[1] * t, axle[2] + dir[2] * t];
    pipe(m, [at(-0.02), at(0.5)], 0.024, ALU, { seg: 12, finish: 'metal' });
    pipe(m, [at(0.45), at(0.72)], 0.016, KROM, { seg: 10, finish: 'metal' });
  }
  pipe(m, [[-0.085, FY, R], [0.085, FY, R]], 0.012, ALU, { seg: 8, finish: 'metal' });
  // spakbor depan panjang melengkung
  const fa = [];
  for (let i = 0; i <= 18; i++) { const a = (14 + i * 8.4) * Math.PI / 180, r = R + 0.034; fa.push([0, FY - r * Math.cos(a), R + r * Math.sin(a)]); }
  sweep(m, fa, () => ({ w: 0.056, h: 0.011, n: 3 }), body, { seg: 16, round: 0.035, ...paint });
  // penutup leher stang di depan tameng + tameng kaki tipis tegak (lebar di lutut)
  bodyZ(m, { z0: Z(0.6), z1: Z(0.975), yF: [[Z(0.6), -0.55], [Z(0.8), -0.555], [Z(0.975), -0.53]], yB: [[Z(0.6), -0.47], [Z(0.975), -0.45]], w: [[Z(0.6), 0.05], [Z(0.8), 0.07], [Z(0.975), 0.075]], round: 0.025, n: 3, steps: 20, seg: 28 }, body, paint);
  sweep(m, smoothPath([[0, -0.49, Z(0.95)], [0, -0.495, Z(0.8)], [0, -0.465, Z(0.6)], [0, -0.42, Z(0.45)], [0, -0.37, Z(0.37)]], 6),
    (t) => ({ w: curve([[0, 0.12], [0.35, 0.19], [0.72, 0.205], [1, 0.16]])(t), h: curve([[0, 0.035], [0.5, 0.042], [1, 0.035]])(t), n: 3.6 }), body, { seg: 32, round: 0.035, ...paint });
  // rangka tengah rendah + pijakan
  bodyY(m, { y0: -0.41, y1: 0.12, zb: [[-0.41, Z(0.42)], [0, Z(0.4)], [0.12, Z(0.46)]], zt: [[-0.41, Z(0.6)], [-0.2, Z(0.52)], [0.12, Z(0.6)]], w: [[-0.41, 0.09], [0, 0.08], [0.12, 0.11]], round: 0.05, n: 2.8 }, body, paint);
  // mesin perak + silinder, penutup rantai, lengan ayun, dua shock berpegas kuning, pijakan
  bodyY(m, { y0: -0.2, y1: 0.24, zb: Z(0.12), zt: [[-0.2, Z(0.34)], [0.05, Z(0.38)], [0.24, Z(0.32)]], w: [[-0.2, 0.09], [0, 0.12], [0.24, 0.1]], round: 0.06, n: 2.8 }, ALU, { finish: 'metal' });
  const cyl = [];
  for (let i = 0; i <= 12; i++) cyl.push([i % 2 ? 0.07 : 0.06, i * 0.016]);
  rev(m, [0, -0.17, Z(0.27)], [0, -0.6, 0.8], cyl.concat([[0.0, 0.2]]), MESIN, { seg: 16 });
  bodyY(m, { y0: 0.12, y1: RY + 0.06, zb: [[0.12, R - 0.02], [RY, R - 0.035]], zt: [[0.12, R + 0.1], [RY, R + 0.05]], w: 0.016, xc: 0.085, round: 0.04, n: 3 }, HITAM, paint);
  for (const sx of [-1, 1]) {
    pipe(m, [[sx * 0.09, 0.16, Z(0.27)], [sx * 0.095, RY, R]], 0.016, HITAM, { seg: 8 });
    shock(m, [sx * 0.11, RY - 0.03, R + 0.04], [sx * 0.12, 0.45, Z(0.66)], s.pegas || '#d4a017');
    pipe(m, [[sx * 0.19, -0.04, Z(0.3)], [sx * 0.27, -0.03, Z(0.3)]], 0.016, KARET, { seg: 10 });
  }
  // knalpot hitam berpelindung krom (kanan)
  pipe(m, [[-0.02, -0.33, Z(0.37)], [-0.05, -0.36, Z(0.22)], [-0.07, -0.2, Z(0.1)], [-0.12, 0.15, Z(0.16)], [-0.15, 0.25, Z(0.22)]], 0.019, '#5b5048', { seg: 10, finish: 'metal' });
  const muf = bodyY(m, { y0: 0.2, y1: 0.9, zb: [[0.2, Z(0.19)], [0.9, Z(0.29)]], zt: [[0.2, Z(0.31)], [0.9, Z(0.39)]], w: 0.05, xc: -0.15, round: 0.06, n: 2.2 }, HITAM, { finish: 'glossy' });
  patch(m, muf, 0.3, 0.66, () => [Math.PI - 0.8, Math.PI + 0.7], KROM, { ny: 10, na: 6, lift: 0.004, finish: 'metal' });
  // bodi samping membulat + striping miring tiga warna
  const rT = curve([[0, Z(0.66)], [0.25, Z(0.7)], [0.6, Z(0.72)], [0.9, Z(0.76)], [1.0, Z(0.76)]]), rW = curve([[0, 0.14], [0.15, 0.16], [0.5, 0.165], [0.8, 0.13], [1.0, 0.075]]);
  const rear = bodyY(m, { y0: 0.02, y1: 1.0, zt: rT, zb: [[0.02, Z(0.46)], [0.3, Z(0.5)], [0.55, Z(0.62)], [0.8, Z(0.64)], [1.0, Z(0.68)]], w: rW, round: 0.06, n: 2.8, steps: 32, seg: 32 }, body, paint);
  const st = s.striping ?? ['#2e9e4f', '#e8c21a', '#f2f2f2'];
  for (const sx of [-1, 1]) st.forEach((c, k) => patch(m, rear, 0.12 + k * 0.03, 0.9, sideR(sx, (y) => { const e = lerp(-0.6, 0.45, (y - 0.12) / 0.78) - k * 0.24, hw = lerp(0.05, 0.11, (y - 0.12) / 0.78); return [e - hw, e + hw]; }), c, { ny: 18, na: 4, lift: 0.0015 + k * 0.0003, ...paint }));
  // jok panjang datar, pegangan krom, lampu belakang + sein
  bodyY(m, { y0: -0.06, y1: 0.87, zb: (y) => rT(y) - 0.025, zt: (y) => rT(y) + curve([[0, 0.07], [0.5, 0.075], [0.75, 0.065], [0.87, 0.055]])(y), w: curve([[0, 0.11], [0.25, 0.15], [0.6, 0.14], [0.87, 0.11]]), round: 0.05, n: 2.4, steps: 30, seg: 30 }, '#141416');
  pipe(m, [[0.135, 0.5, Z(0.735)], [0.15, 0.82, Z(0.79)], [0.07, 0.95, Z(0.81)], [-0.07, 0.95, Z(0.81)], [-0.15, 0.82, Z(0.79)], [-0.135, 0.5, Z(0.735)]], 0.011, KROM, { seg: 10, finish: 'metal' });
  bodyY(m, { y0: 0.955, y1: 1.035, zb: Z(0.705), zt: Z(0.765), w: 0.062, round: 0.03, n: 3 }, '#c0141c', { finish: 'glossy' });
  for (const sx of [-1, 1]) blob(m, [sx * 0.085, 0.985, Z(0.69)], [0.024, 0.03, 0.016], '#f0a020', { finish: 'glossy' });
  sweep(m, smoothPath([[0, 0.86, Z(0.64)], [0, 0.97, Z(0.55)], [0, 1.0, Z(0.43)]], 6), () => ({ w: 0.07, h: 0.009, n: 3 }), HITAM, { seg: 12, round: 0.02 });
  bodyY(m, { y0: 1.0, y1: 1.008, zb: Z(0.4), zt: Z(0.51), w: 0.103, n: 14, seg: 32, steps: 2 }, '#f2f2ee', { cap: true });
  bodyY(m, { y0: 1.008, y1: 1.012, zb: Z(0.405), zt: Z(0.505), w: 0.097, n: 14, seg: 32, steps: 2 }, '#141414', { cap: true });
  bodyY(m, { y0: -0.885, y1: -0.877, zb: 0.49, zt: 0.58, w: 0.1, n: 14, seg: 32, steps: 2 }, '#f2f2ee', { cap: true });
  bodyY(m, { y0: -0.889, y1: -0.885, zb: 0.495, zt: 0.575, w: 0.094, n: 14, seg: 32, steps: 2 }, '#141414', { cap: true });
  // tutup stang membulat: lampu trapesium lebar di muka, sein oranye di kedua ujung, spidometer di atas
  bodyX(m, { x0: -0.3, x1: 0.3, yc: [[-0.3, -0.42], [0, -0.46], [0.3, -0.42]], zc: [[-0.3, Z(0.985)], [0, Z(0.98)], [0.3, Z(0.985)]], d: [[-0.3, 0.05], [-0.15, 0.085], [0, 0.095], [0.15, 0.085], [0.3, 0.05]], h: [[-0.3, 0.04], [0, 0.068], [0.3, 0.04]], round: 0.035, n: 3 }, body, paint);
  bodyY(m, { y0: -0.556, y1: -0.538, zb: Z(0.94), zt: Z(1.012), w: 0.142, wt: 0.118, wb: 0.142, round: 0.006, n: 6 }, HITAM, paint);
  bodyY(m, { y0: -0.561, y1: -0.548, zb: Z(0.946), zt: Z(1.006), w: 0.134, wt: 0.11, wb: 0.134, round: 0.005, n: 6 }, '#e3ebf0', { finish: 'metal' });
  for (const sx of [-1, 1]) {
    blob(m, [sx * 0.235, -0.5, Z(0.978)], [0.05, 0.03, 0.026], '#f0a020', { finish: 'glossy' });
    pipe(m, [[sx * 0.27, -0.405, Z(0.99)], [sx * 0.34, -0.385, Z(0.993)], [sx * 0.405, -0.37, Z(0.995)]], 0.018, KARET, { seg: 12 });
    pipe(m, [[sx * 0.27, -0.44, Z(0.995)], [sx * 0.31, -0.465, Z(0.99)], [sx * 0.39, -0.445, Z(0.987)]], 0.0065, ALU, { seg: 6, finish: 'metal' });
    pipe(m, [[sx * 0.2, -0.43, Z(1.04)], [sx * 0.23, -0.435, Z(1.14)], [sx * 0.28, -0.44, Z(1.21)]], 0.007, HITAM, { seg: 6 });
    blob(m, [sx * 0.3, -0.44, Z(1.235)], [0.052, 0.02, 0.034], HITAM, { finish: 'glossy' });
    blob(m, [sx * 0.3, -0.421, Z(1.235)], [0.045, 0.004, 0.028], '#c8d6de', { finish: 'metal' });
  }
  bodyY(m, { y0: -0.47, y1: -0.385, zb: Z(1.02), zt: [[-0.47, Z(1.06)], [-0.385, Z(1.045)]], w: 0.085, round: 0.02, n: 4 }, '#111214', { finish: 'glossy' });
  rev(m, [0, -0.43, Z(1.062)], [0, 0, 1], [[0.05, 0], [0.05, 0.002], [0, 0.003]], '#8fb3c9', { seg: 20, s: [1.3, 0.6, 1], finish: 'metal' });
  pipe(m, [[0.1, 0.05, Z(0.2)], [0.17, 0.1, Z(0.09)], [0.21, 0.14, 0.012]], 0.009, HITAM, { seg: 6 });
}

export const MOTOR = {
  matic_merah: { name: 'Motor matic merah (halus)', type: 'matic', color: '#c3161c', aksen: '#1c1d20', garis: '#f2f2f2' },
  matic_putih: { name: 'Motor matic putih (halus)', type: 'matic', color: '#efefec', aksen: '#1c1d20', garis: '#c3161c', velg: '#c3161c' },
  matic_hitam: { name: 'Motor matic hitam (halus)', type: 'matic', color: '#1b1c1f', aksen: '#2b2c30', garis: '#d4a017', velg: '#d4a017', pegas: '#d4a017' },
  matic_biru: { name: 'Motor matic biru (halus)', type: 'matic', color: '#1f4fa3', aksen: '#1c1d20', garis: '#e8e8e8' },
  bebek_merah: { name: 'Motor bebek merah (halus)', type: 'bebek', color: '#b5161c', aksen: '#1c1d20', garis: '#f2f2f2' },
  bebek_biru: { name: 'Motor bebek biru (halus)', type: 'bebek', color: '#22489a', aksen: '#1c1d20', garis: '#f2f2f2' },
  bebek_hitam: { name: 'Motor bebek hitam (halus)', type: 'bebek', color: '#1b1c1f', aksen: '#2b2c30', garis: '#c3161c' },
  bebek_klasik_hitam: { name: 'Bebek klasik hitam, gaya 90-an (halus)', type: 'supra', color: '#1e2124', striping: ['#2e9e4f', '#e8c21a', '#7fc8e8'] },
  bebek_klasik_biru: { name: 'Bebek klasik biru, gaya 90-an (halus)', type: 'supra', color: '#1f5fa8', striping: ['#e8c21a', '#2e9e4f', '#f2f2f2'] },
  sport_hijau: { name: 'Sport fairing hijau (halus)', type: 'sport', color: '#4caf2a', aksen: '#1c1d20', garis: '#f2f2f2', velg: '#4caf2a' },
  sport_merah: { name: 'Sport fairing merah (halus)', type: 'sport', color: '#c3161c', aksen: '#1c1d20', garis: '#f2f2f2' },
  sport_hitam: { name: 'Sport fairing hitam (halus)', type: 'sport', color: '#1b1c1f', aksen: '#2b2c30', garis: '#d4a017', velg: '#d4a017' },
  laki_merah: { name: 'Motor laki merah (halus)', type: 'laki', color: '#a3161b', garis: '#f2f2f2' },
  laki_hitam: { name: 'Motor laki hitam (halus)', type: 'laki', color: '#1b1c1f', garis: '#d4a017', emblem: '#d4a017' },
  laki_silver: { name: 'Motor laki silver, jari-jari (halus)', type: 'laki', color: '#aeb3b8', garis: '#1c1d20', spoke: 'kawat', velg: KROM },
};
const BUILD = { sport: buildSport, laki: buildNaked, supra: buildSupra };
for (const [k, s] of Object.entries(MOTOR)) LIBRARY['kendaraan_' + k] = { name: s.name, icon: s.type === 'matic' ? '🛵' : '🏍️', grp: 'kendaraan', build: (m) => (BUILD[s.type] || buildMotor)(m, s) };
