// Animasi ala Blender (versi ringan): keyframe objek & kamera, lintasan, roda berputar otomatis,
// daun pintu/jendela berengsel, tahapan pembangunan, dan tulang sederhana untuk figur manusia.
// Murni data (tanpa DOM) agar bisa diuji di Node. Semua matriks kunci disimpan RELATIF terhadap grup induk,
// sehingga anak ikut bergerak bersama induknya (pintu di dalam rumah yang berputar, dsb.).
import * as THREE from 'three';
import * as G from './geometry.js';

const M4 = (a) => new THREE.Matrix4().fromArray(a);
const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const UP = new THREE.Vector3(0, 0, 1);

export const EASE = {
  halus: (t) => t * t * (3 - 2 * t),
  linear: (t) => t,
  masuk: (t) => t * t,
  keluar: (t) => 1 - (1 - t) * (1 - t),
  konstan: () => 0,
};
export const EASE_NAMES = { halus: 'Halus (pelan–cepat–pelan)', linear: 'Linear (rata)', masuk: 'Pelan di awal', keluar: 'Pelan di akhir', konstan: 'Lompat (tanpa transisi)' };
export const ACTIONS = { jalan: 'Berjalan', melambai: 'Melambai', duduk: 'Duduk' };

export function animOf(m) {
  m.anim ||= { dur: 10, tracks: {}, cam: { mode: 'bebas', keys: [] } };
  m.anim.tracks ||= {};
  m.anim.cam ||= { mode: 'bebas', keys: [] };
  return m.anim;
}
// buang trek milik grup yang sudah tidak ada
export function pruneAnim(m) {
  if (!m.anim) return;
  for (const k of Object.keys(m.anim.tracks)) if (!m.groups[k]) delete m.anim.tracks[k];
  const c = m.anim.cam;
  if (c.follow && !m.groups[c.follow.gid]) c.follow = null;
}
const trackOf = (m, gid) => m.anim?.tracks?.[gid] || null;
const hasMotion = (tr) => !!tr && (tr.keys?.length || tr.path || tr.aksi?.length || tr.buka?.length);
export function animatedGids(m) {
  if (!m.anim) return [];
  return Object.keys(m.anim.tracks).map(Number).filter((g) => m.groups[g] && hasMotion(m.anim.tracks[g]));
}

// ---------- matriks ----------
const parentM = (m, gid) => {
  const p = m.groups[gid]?.parent;
  return p != null && m.groups[p] ? M4(m.groups[p].m) : new THREE.Matrix4();
};
export const relMat = (m, gid) => parentM(m, gid).invert().multiply(M4(m.groups[gid].m));
const dec = (M) => {
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  M.decompose(p, q, s);
  return { p, q, s };
};
function lerpM(a, b, u) {
  const A = dec(a), B = dec(b);
  return new THREE.Matrix4().compose(A.p.lerp(B.p, u), A.q.slerp(B.q, u), A.s.lerp(B.s, u));
}

// Kunci: [{ t, m:[16] relatif induk, vis, ease }] urut waktu. Kemudahan (ease) milik kunci tujuan.
export function sampleKeys(keys, t) {
  if (!keys.length) return null;
  if (t <= keys[0].t) return { M: M4(keys[0].m), vis: keys[0].vis !== false };
  const last = keys[keys.length - 1];
  if (t >= last.t) return { M: M4(last.m), vis: last.vis !== false };
  let i = 0;
  while (keys[i + 1].t < t) i++;
  const a = keys[i], b = keys[i + 1], u = (EASE[b.ease] || EASE.halus)((t - a.t) / Math.max(1e-6, b.t - a.t));
  return { M: lerpM(M4(a.m), M4(b.m), u), vis: a.vis !== false };
}
export function setKey(keys, key) {
  const i = keys.findIndex((k) => Math.abs(k.t - key.t) < 1 / 120);
  if (i >= 0) keys[i] = { ...keys[i], ...key };
  else keys.push(key);
  keys.sort((a, b) => a.t - b.t);
  return keys;
}

// ---------- lintasan ----------
// Ubah kumpulan garis terpilih jadi satu polyline berurutan (dipakai untuk lintasan objek / kamera).
export function polylineFromLines(lines) {
  if (!lines.length) return null;
  const segs = lines.map((l) => [l.a, l.b]);
  const k = (p) => G.key(p);
  const out = [...segs.shift()];
  for (let grew = true; grew && segs.length; ) {
    grew = false;
    for (let i = 0; i < segs.length; i++) {
      const [a, b] = segs[i];
      if (k(a) === k(out[out.length - 1])) out.push(b);
      else if (k(b) === k(out[out.length - 1])) out.push(a);
      else if (k(b) === k(out[0])) out.unshift(a);
      else if (k(a) === k(out[0])) out.unshift(b);
      else continue;
      segs.splice(i, 1);
      grew = true;
      break;
    }
  }
  return out;
}
function pathAt(pts, s) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + V(pts[i]).distanceTo(V(pts[i - 1])));
  const tot = L[L.length - 1] || 1, d = clamp(s, 0, 1) * tot;
  let i = 1;
  while (i < pts.length - 1 && L[i] < d) i++;
  const a = V(pts[i - 1]), b = V(pts[i]), u = (d - L[i - 1]) / Math.max(1e-9, L[i] - L[i - 1]);
  // arah dihaluskan di sekitar titik belok agar putaran tidak patah
  const dir = b.clone().sub(a).normalize();
  if (u > 0.7 && i < pts.length - 1) dir.lerp(V(pts[i + 1]).sub(b).normalize(), (u - 0.7) / 0.6).normalize();
  if (u < 0.3 && i > 1) dir.lerp(a.clone().sub(V(pts[i - 2])).normalize(), (0.3 - u) / 0.6).normalize();
  return { p: a.lerp(b, u), dir, len: tot };
}
// Jalur objek: { pts, t0, t1, ease, fwd:[x,y,z] arah depan lokal, base:[16] matriks dunia saat dibuat }
function pathPose(path, t) {
  const s = (EASE[path.ease] || EASE.linear)(clamp((t - path.t0) / Math.max(1e-6, path.t1 - path.t0), 0, 1));
  const { p, dir } = pathAt(path.pts, s);
  const B = dec(M4(path.base));
  const fwd = V(path.fwd || [0, -1, 0]).applyQuaternion(B.q);
  const yaw = Math.atan2(dir.y, dir.x) - Math.atan2(fwd.y, fwd.x);
  const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(B.q);
  return new THREE.Matrix4().compose(p, q, B.s);
}

// ---------- pose dunia sebuah grup pada waktu t ----------
// cache: Map gid -> { W, vis } untuk satu waktu (agar induk tidak dihitung berulang)
export function poseAt(m, gid, t, cache = new Map()) {
  if (cache.has(gid)) return cache.get(gid);
  const g = m.groups[gid], tr = trackOf(m, gid);
  const par = g.parent != null && m.groups[g.parent] ? poseAt(m, g.parent, t, cache) : null;
  let rel = null, vis = true;
  const s = tr?.keys?.length ? sampleKeys(tr.keys, t) : null;
  if (s) ({ M: rel, vis } = s);
  let W;
  if (tr?.path && (!par || g.parent == null)) {
    W = pathPose(tr.path, t);
    if (par) W = par.W.clone().multiply(parentM(m, gid).invert().multiply(W));
  } else W = (par ? par.W.clone() : new THREE.Matrix4()).multiply(rel || relMat(m, gid));
  const out = { W, vis: vis && (!par || par.vis) };
  cache.set(gid, out);
  return out;
}

// ---------- engsel pintu & jendela ----------
// Kunci sudut: tr.buka = [{ t, deg }] (derajat). Mengembalikan daftar daun: { ids, hinge (titik dunia), axis, sign }
export function hingeLeaves(m, gid) {
  const g = m.groups[gid];
  if (!g?.opening) return [];
  const tree = G.entitiesInTree(m, gid), fr = g.opening.frame, GM = M4(g.m);
  const o = V(fr.o).applyMatrix4(GM), u = V(fr.u).transformDirection(GM);
  const fw = 0.06, leaves = new Map();
  for (const f of m.faces) {
    if (!tree.has(f.id)) continue;
    const isLeaf = g.opening.type === 'pintu' ? f.part === 'leaf' || (f.color && /^#c9a227$/i.test(f.color)) : f.finish === 'glass';
    if (!isLeaf) continue;
    const k = g.opening.type === 'pintu' ? 'daun' : 's' + f.solid;
    if (!leaves.has(k)) leaves.set(k, []);
    leaves.get(k).push(f);
  }
  // gagang pintu (kuning) ikut daun
  const out = [];
  const W = g.opening.w;
  for (const fs of leaves.values()) {
    let mn = Infinity, mx = -Infinity;
    const c = new THREE.Vector3();
    let n = 0;
    for (const f of fs) for (const p of f.pts) {
      const x = V(p).sub(o).dot(u);
      mn = Math.min(mn, x), (mx = Math.max(mx, x));
      c.add(V(p)), n++;
    }
    c.divideScalar(n);
    // daun kanan pada jendela dua daun berengsel di sisi kanan, berputar berlawanan
    const right = g.opening.type !== 'pintu' && mn > W / 2 - 0.03;
    const hx = right ? mx : g.opening.type === 'pintu' ? fw : mn;
    const hinge = c.clone().addScaledVector(u, hx - c.clone().sub(o).dot(u));
    out.push({ ids: new Set(fs.map((f) => f.id)), hinge, axis: UP.clone(), sign: right ? -1 : 1 });
  }
  return out;
}
export function hingeDeg(tr, t) {
  const k = tr?.buka;
  if (!k?.length) return 0;
  if (t <= k[0].t) return k[0].deg;
  if (t >= k[k.length - 1].t) return k[k.length - 1].deg;
  let i = 0;
  while (k[i + 1].t < t) i++;
  const u = EASE.halus((t - k[i].t) / Math.max(1e-6, k[i + 1].t - k[i].t));
  return k[i].deg + (k[i + 1].deg - k[i].deg) * u;
}

// ---------- roda ----------
// Kumpulkan roda dalam pohon grup: kunci = pusat roda; grup pemilik koordinat lokal = f.group (grup pustaka).
export function wheelSets(m, ids) {
  const out = new Map();
  for (const f of m.faces) {
    if (!f.roda || !ids.has(f.id) || f.group == null) continue;
    const k = f.group + '|' + f.roda.c.join(',');
    if (!out.has(k)) out.set(k, { lib: f.group, roda: f.roda, ids: new Set() });
    out.get(k).ids.add(f.id);
  }
  return [...out.values()];
}
// Tabel sudut putar roda & fase langkah kaki per grup, disampling per 1/fps detik (integrasi jarak tempuh).
export function motionTable(m, gid, dur, fps = 30, axisLocal = null, radius = 1) {
  const n = Math.ceil(dur * fps) + 1, ang = new Float32Array(n), dist = new Float32Array(n);
  let prev = null, a = 0, d = 0;
  for (let i = 0; i < n; i++) {
    const W = poseAt(m, gid, i / fps).W, P = dec(W);
    if (prev) {
      const dp = P.p.clone().sub(prev);
      dp.z = 0;
      if (axisLocal) a += UP.clone().cross(dp).dot(V(axisLocal).applyQuaternion(P.q).normalize()) / radius;
      d += dp.length();
    }
    prev = P.p;
    ang[i] = a;
    dist[i] = d;
  }
  return { fps, ang, dist, at: (arr, t) => { const x = clamp(t * fps, 0, n - 1), i = Math.floor(x), f = x - i; return arr[i] + ((arr[Math.min(n - 1, i + 1)] ?? arr[i]) - arr[i]) * f; } };
}

// ---------- tahapan pembangunan ----------
const RANK = (g) => (g.struct || g.column ? 0 : g.room ? 1 : g.wall ? 2 : g.beam ? 3 : g.opening ? 4 : g.slab ? 5 : g.stair ? 6 : g.roof ? 7 : g.mep ? 8 : 9);
export const STAGE_NAMES = ['Pondasi, sloof & kolom', 'Lantai', 'Dinding', 'Balok', 'Kusen pintu & jendela', 'Plat lantai/dak', 'Tangga', 'Atap', 'Listrik & sanitasi', 'Lain-lain'];
// Setiap grup teratas "tumbuh" dari bawah sesuai urutan pekerjaan. Mengembalikan jumlah tahap.
export function buildStages(m, o = {}) {
  const A = animOf(m), per = o.per ?? 1.2, start = o.start ?? 0.5, gap = o.gap ?? 0.15;
  const tops = Object.keys(m.groups).map(Number).filter((g) => m.groups[g].parent == null && !m.groups[g].hidden);
  const items = tops.map((gid) => ({ gid, rank: RANK(m.groups[gid]), box: G.bboxOf(m, G.entitiesInTree(m, gid)) })).filter((x) => !x.box.isEmpty());
  items.sort((a, b) => a.rank - b.rank || a.box.min.z - b.box.min.z || a.box.min.x - b.box.min.x);
  const ranks = [...new Set(items.map((x) => x.rank))];
  let t = start;
  const stages = [];
  for (const r of ranks) {
    const its = items.filter((x) => x.rank === r);
    const step = its.length > 1 ? Math.min(0.25, per / its.length) : 0;
    its.forEach((x, i) => {
      const t0 = t + i * step, rest = M4(m.groups[x.gid].m);
      const zb = x.box.min.z;
      const flat = new THREE.Matrix4().makeTranslation(0, 0, zb).multiply(new THREE.Matrix4().makeScale(1, 1, 0.002)).multiply(new THREE.Matrix4().makeTranslation(0, 0, -zb)).multiply(rest);
      A.tracks[x.gid] = { ...(A.tracks[x.gid] || {}), keys: [
        { t: 0, m: flat.toArray(), vis: false },
        { t: t0, m: flat.toArray(), vis: true, ease: 'konstan' },
        { t: t0 + per, m: rest.toArray(), vis: true, ease: 'keluar' },
      ] };
    });
    stages.push({ name: STAGE_NAMES[r], t0: t, n: its.length });
    t += per + step * Math.max(0, its.length - 1) + gap;
  }
  A.dur = Math.max(A.dur || 0, +(t + 1).toFixed(2));
  return stages;
}

// ---------- kamera ----------
const shortAng = (a, b) => a + ((((b - a) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
export function camKeysAt(keys, t) {
  if (!keys.length) return null;
  const pick = (k) => ({ target: V(k.c.target), dist: k.c.dist, az: k.c.az, el: k.c.el });
  if (t <= keys[0].t) return pick(keys[0]);
  if (t >= keys[keys.length - 1].t) return pick(keys[keys.length - 1]);
  let i = 0;
  while (keys[i + 1].t < t) i++;
  const a = keys[i].c, b = keys[i + 1].c, u = (EASE[keys[i + 1].ease] || EASE.halus)((t - keys[i].t) / Math.max(1e-6, keys[i + 1].t - keys[i].t));
  return { target: V(a.target).lerp(V(b.target), u), dist: a.dist * Math.pow(b.dist / a.dist, u), az: a.az + (shortAng(a.az, b.az) - a.az) * u, el: a.el + (b.el - a.el) * u };
}
const viewFrom = (eye, target) => {
  const d = eye.clone().sub(target), dist = Math.max(0.2, d.length());
  return { target, dist, az: Math.atan2(d.y, d.x), el: Math.asin(clamp(d.z / dist, -1, 1)) };
};
// Hasil: { target, dist, az, el } atau null (kamera bebas)
export function cameraAt(m, t) {
  const c = m.anim?.cam;
  if (!c || c.mode === 'bebas') return null;
  if (c.mode === 'kunci') return camKeysAt(c.keys || [], t);
  if (c.mode === 'lintasan' && c.path?.pts?.length > 1) {
    const s = (EASE[c.path.ease] || EASE.halus)(clamp((t - (c.path.t0 ?? 0)) / Math.max(1e-6, (c.path.t1 ?? m.anim.dur) - (c.path.t0 ?? 0)), 0, 1));
    const h = c.path.h ?? 1.6, a = pathAt(c.path.pts, s), eye = a.p.clone().add(new THREE.Vector3(0, 0, h));
    let target;
    if (c.path.look != null && m.groups[c.path.look]) target = dec(poseAt(m, c.path.look, t).W).p.add(new THREE.Vector3(0, 0, 0.8));
    else target = eye.clone().add(a.dir.clone().setZ(0).normalize().multiplyScalar(3)).add(new THREE.Vector3(0, 0, -0.25));
    return viewFrom(eye, target);
  }
  if (c.mode === 'ikuti' && c.follow && m.groups[c.follow.gid]) {
    const P = dec(poseAt(m, c.follow.gid, t).W).p, target = P.clone().add(V(c.follow.look || [0, 0, 0.8]));
    return viewFrom(target.clone().add(V(c.follow.off)), target);
  }
  return null;
}

// ---------- tulang figur manusia ----------
export const BONES = ['pinggul', 'perut', 'dada', 'kepala', 'pahaKi', 'betisKi', 'kakiKi', 'pahaKa', 'betisKa', 'kakiKa', 'lenganKi', 'hastaKi', 'tanganKi', 'lenganKa', 'hastaKa', 'tanganKa'];
export const BONE_PARENT = [-1, 0, 1, 2, 0, 4, 5, 0, 7, 8, 2, 10, 11, 2, 13, 14];
// "Ki" = sisi +X lokal (kiri figur yang menghadap -Y), "Ka" = sisi -X.
export function isFigure(g) {
  return !!g && typeof g.def === 'string' && /^lib:manusia_/.test(g.def);
}
// Sendi dari titik-titik lokal figur (alas z=0, menghadap -Y). Batas lengan–badan dicari dari celah |x| per irisan.
export function figureRig(pts) {
  let H = 0;
  for (const p of pts) H = Math.max(H, p[2]);
  const band = (z0, z1, f) => pts.filter((p) => p[2] >= z0 * H && p[2] <= z1 * H && f(p));
  const mean = (a, f) => (a.length ? a.reduce((s, p) => s + f(p), 0) / a.length : 0);
  const hands = band(0.4, 0.45, (p) => Math.abs(p[0]) > 0.12 * H);
  const xh = hands.length ? mean(hands, (p) => Math.abs(p[0])) : 0.17 * H;
  const yc = mean(band(0.45, 0.6, () => true), (p) => p[1]);
  const hipX = Math.max(0.03 * H, mean(band(0.15, 0.3, () => true), (p) => Math.abs(p[0])));
  const j = {
    H, yc, xh, hipX,
    hipZ: 0.5 * H, kneeZ: 0.28 * H, ankleZ: 0.045 * H,
    shZ: 0.8 * H, elZ: 0.61 * H, wrZ: 0.455 * H,
    shX: 0.6 * xh, elX: 0.86 * xh, wrX: 0.97 * xh,
  };
  j.pos = [
    [0, yc, j.hipZ], [0, yc, 0.64 * H], [0, yc, 0.78 * H], [0, yc, 0.86 * H],
    [hipX, yc, j.hipZ], [hipX, yc, j.kneeZ], [hipX, yc, j.ankleZ],
    [-hipX, yc, j.hipZ], [-hipX, yc, j.kneeZ], [-hipX, yc, j.ankleZ],
    [j.shX, yc, j.shZ], [j.elX, yc, j.elZ], [j.wrX, yc, j.wrZ],
    [-j.shX, yc, j.shZ], [-j.elX, yc, j.elZ], [-j.wrX, yc, j.wrZ],
  ];
  return j;
}
// Ruas tiap tulang (dari sendinya ke ujung) + tebal; bobot kulit = kedekatan ke ruas, dinormalkan tebal tulang,
// sehingga badan yang tebal tidak "mencuri" titik lengan dan tangan yang menempel di paha tetap ikut tangan.
function boneSegs(j) {
  if (j.segs) return j.segs;
  const H = j.H, k = H / 1.7, P = j.pos, yc = j.yc;
  const end = [
    [0, yc, 0.6 * H], [0, yc, 0.74 * H], [0, yc, 0.84 * H], [0, yc, H],
    P[5], P[6], [j.hipX, yc - 0.12 * k, 0.015 * H],
    P[8], P[9], [-j.hipX, yc - 0.12 * k, 0.015 * H],
    P[11], P[12], [j.wrX, yc, 0.39 * H],
    P[14], P[15], [-j.wrX, yc, 0.39 * H],
  ];
  const start = P.map((p, i) => (i === 0 ? [0, yc, 0.43 * H] : p));
  const r = [0.15, 0.14, 0.15, 0.11, 0.075, 0.06, 0.055, 0.075, 0.06, 0.055, 0.05, 0.045, 0.04, 0.05, 0.045, 0.04].map((x) => x * k);
  j.segs = start.map((a, i) => ({ a, b: end[i], r: r[i] }));
  return j.segs;
}
const segDist = (p, a, b) => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const L = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1e-9, t = clamp((ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L, 0, 1);
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
};
// Golongan tulang dari label bagian tubuh bidang (f.bp dari manusia.js): A lengan, L kaki, T badan, H kepala; null = bebas.
export function boneHint(bp, j, x, y, z) {
  if (bp === 'A' || bp === 'L' || bp === 'T') return bp;
  if (bp === 'r' || bp === 'm') return 'H';
  if (bp === 'k') return z > 0.84 * j.H ? 'H' : z < 0.08 * j.H ? 'L' : Math.abs(x) > 0.09 * j.H ? 'A' : 'T';
  return null;
}
const ALLOW = {
  A: [2, 10, 11, 12, 13, 14, 15],
  L: [0, 4, 5, 6, 7, 8, 9],
  T: [0, 1, 2, 3, 4, 7, 10, 13],
  H: [2, 3],
};
// Bobot kulit (maks. 4 tulang) untuk titik lokal (x, y, z); hint membatasi tulang yang boleh dipilih
export function skinWeights(j, x, y, z, hint = null) {
  const p = [x, y, z], d = boneSegs(j).map((s) => segDist(p, s.a, s.b) / s.r);
  // kaki kiri hanya untuk sisi +X, kanan untuk -X (kecuali dekat garis tengah: sarung/rok dibagi rata)
  const side = clamp(x / (0.016 * j.H) + 0.5, 0, 1);
  for (let i = 4; i <= 6; i++) d[i] += (1 - side) * 4;
  for (let i = 7; i <= 9; i++) d[i] += side * 4;
  if (hint === 'T') for (const i of [4, 7, 10, 13]) d[i] += 0.8; // ujung baju & bahu boleh ikut paha/lengan sedikit
  if (hint === 'A') d[2] += 0.5;
  const ok = hint ? new Set(ALLOW[hint]) : null;
  const cand = d.map((v, i) => [i, v]).filter(([i]) => !ok || ok.has(i));
  const dmin = Math.min(...cand.map((c) => c[1]));
  const arr = cand.map(([i, v]) => [i, Math.exp(-7 * (v - dmin))]).sort((a, b) => b[1] - a[1]).slice(0, 4).filter((q) => q[1] > 0.02);
  const sum = arr.reduce((s, q) => s + q[1], 0);
  while (arr.length < 4) arr.push([0, 0]);
  return { idx: arr.map((q) => q[0]), wt: arr.map((q) => q[1] / sum) };
}
// Aksi: tr.aksi = [{ a: 'jalan'|'melambai'|'duduk', t0, t1 }]. phase: fase langkah (radian). Hasil: rotasi per tulang + turun pinggul (× H)
export function figurePose(aksi, t, phase) {
  const rot = BONES.map(() => [0, 0, 0]), out = { rot, drop: 0 };
  for (const ac of aksi || []) {
    const k = sstep(ac.t0 - 0.01, ac.t0 + 0.35, t) * (1 - sstep(ac.t1 - 0.35, ac.t1 + 0.01, t));
    if (k <= 0) continue;
    const r = (b, i, v) => (rot[b][i] += k * v);
    if (ac.a === 'jalan') {
      const s = Math.sin(phase), c = Math.cos(phase);
      r(4, 0, -0.42 * s); r(7, 0, 0.42 * s);
      r(5, 0, 0.9 * Math.pow(Math.max(0, c), 1.5) + 0.08); r(8, 0, 0.9 * Math.pow(Math.max(0, -c), 1.5) + 0.08);
      r(6, 0, -0.15 * Math.max(0, c)); r(9, 0, -0.15 * Math.max(0, -c));
      r(10, 0, 0.32 * s); r(13, 0, -0.32 * s);
      r(11, 0, -0.25); r(14, 0, -0.25);
      r(1, 2, 0.06 * s); r(1, 0, -0.03);
      out.drop += k * 0.008 * (1 + Math.cos(2 * phase));
    } else if (ac.a === 'melambai') {
      r(13, 1, 2.25); r(14, 1, 0.65 + 0.45 * Math.sin(2 * Math.PI * 1.6 * t));
    } else if (ac.a === 'duduk') {
      r(4, 0, -1.45); r(7, 0, -1.45); r(5, 0, 1.45); r(8, 0, 1.45);
      r(10, 0, -0.2); r(13, 0, -0.2); r(11, 0, -0.95); r(14, 0, -0.95);
      out.drop += k * 0.22;
    }
  }
  return out;
}
