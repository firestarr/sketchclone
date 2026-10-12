// Solid Tools: gabung / kurangi / irisan antar-solid memakai three-bvh-csg,
// lalu segitiga hasilnya digabung kembali menjadi bidang poligon (dengan lubang).
import * as THREE from 'three';
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import * as G from './geometry.js';

const OPS = { union: ADDITION, subtract: SUBTRACTION, intersect: INTERSECTION };
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// Material (warna + tekstur) dikodekan sebagai indeks palet di atribut 'color';
// nilainya konstan di tiap segitiga asal sehingga tetap utuh setelah dipotong.
function solidBrush(model, sid, palette) {
  const pos = [], nor = [], col = [];
  for (const f of model.faces) {
    if (f.solid !== sid) continue;
    const k = `${f.color}|${f.tex || ''}|${f.texScale || 1}|${f.texScaleV || ''}|${f.texRot || 0}|${f.shiny ? 1 : 0}|${f.finish || ''}`;
    let idx = palette.findIndex((x) => x.k === k);
    if (idx < 0) idx = palette.push({ k, color: f.color, tex: f.tex || null, texScale: f.texScale || 1, texScaleV: f.texScaleV, texRot: f.texRot, shiny: !!f.shiny, finish: f.finish }) - 1;
    for (const p of G.triangulateFace(f)) {
      pos.push(...p);
      nor.push(...f.n);
      col.push(idx, 0, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const b = new Brush(g);
  b.updateMatrixWorld();
  return b;
}

// Sisipkan titik yang berada di tengah sebuah sisi (T-junction) agar sisi dalam saling meniadakan.
function splitEdges(edges, verts) {
  const out = [];
  for (const [a, b] of edges) {
    const A = V(a), B = V(b), ab = B.clone().sub(A), L2 = ab.lengthSq();
    const mids = [];
    for (const v of verts) {
      const t = V(v).sub(A).dot(ab) / L2;
      if (t <= 1e-6 || t >= 1 - 1e-6) continue;
      if (A.clone().addScaledVector(ab, t).distanceTo(V(v)) < 1e-4) mids.push({ t, v });
    }
    mids.sort((x, y) => x.t - y.t);
    let prev = a;
    for (const m of mids) {
      out.push([prev, m.v]);
      prev = m.v;
    }
    out.push([prev, b]);
  }
  return out;
}

// Solid tertutup: setiap sisi (setelah memecah T-junction) dipakai oleh jumlah bidang yang genap.
export function isClosedSolid(model, sid) {
  const faces = model.faces.filter((f) => f.solid === sid);
  if (faces.length < 4) return false;
  const verts = new Map();
  let edges = [];
  for (const f of faces) {
    for (const loop of [f.pts, ...f.holes]) {
      for (let i = 0; i < loop.length; i++) {
        verts.set(G.key(loop[i]), loop[i]);
        edges.push([loop[i], loop[(i + 1) % loop.length]]);
      }
    }
  }
  edges = splitEdges(edges, [...verts.values()]);
  const count = new Map(), len = new Map();
  let total = 0;
  for (const [a, b] of edges) {
    const ka = G.key(a), kb = G.key(b);
    const k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
    count.set(k, (count.get(k) || 0) + 1);
    const L = V(a).distanceTo(V(b));
    len.set(k, L);
    total += L;
  }
  // toleran terhadap celah mikro hasil operasi sebelumnya (< 1% panjang total sisi terbuka)
  let open = 0;
  for (const [k, c] of count) if (c % 2) open += len.get(k);
  return open <= total * 0.01;
}

function chainLoops(edges) {
  const next = new Map();
  for (const [a, b] of edges) {
    const k = G.key(a);
    if (!next.has(k)) next.set(k, []);
    next.get(k).push({ a, b });
  }
  const loops = [];
  for (;;) {
    const startEntry = [...next.entries()].find(([, v]) => v.length);
    if (!startEntry) break;
    const startKey = startEntry[0];
    const loop = [];
    let k = startKey;
    for (let guard = 0; ; guard++) {
      const list = next.get(k);
      if (!list || !list.length || guard > 100000) return null; // rantai putus
      const e = list.shift();
      loop.push(e.a);
      k = G.key(e.b);
      if (k === startKey) break;
    }
    loops.push(loop);
  }
  return loops;
}

function dropCollinear(loop) {
  let pts = loop;
  for (let changed = true; changed && pts.length > 3; ) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = V(pts[(i + pts.length - 1) % pts.length]), b = V(pts[i]), c = V(pts[(i + 1) % pts.length]);
      const cr = b.clone().sub(a).cross(c.clone().sub(b)).length();
      if (cr < 1e-7 * Math.max(1, a.distanceTo(c))) {
        pts = pts.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

export function trianglesToFaces(model, tris, sid, grp, palette) {
  // kelompokkan per bidang + material
  const groups = new Map();
  for (const t of tris) {
    const k = `${t.mat}|${t.n.map((x) => Math.round(x * 1000)).join(',')}|${Math.round(V(t.p[0]).dot(V(t.n)) * 1000)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const faces = [];
  const mk = (pts, n, mt) => {
    const f = G.makeFace(model, pts, V(n), mt.color, sid);
    if (!f) return null;
    f.group = grp;
    f.tex = mt.tex;
    f.texScale = mt.texScale;
    if (mt.texScaleV) f.texScaleV = mt.texScaleV;
    if (mt.texRot) f.texRot = mt.texRot;
    if (mt.shiny) f.shiny = true;
    if (mt.finish) f.finish = mt.finish;
    faces.push(f);
    return f;
  };
  for (const list of groups.values()) {
    const n = list[0].n, mt = palette[list[0].mat] || palette[0];
    const verts = new Map();
    for (const t of list) for (const p of t.p) verts.set(G.key(p), p);
    let edges = [];
    for (const t of list) for (let i = 0; i < 3; i++) edges.push([t.p[i], t.p[(i + 1) % 3]]);
    edges = splitEdges(edges, [...verts.values()]);
    const dir = new Map();
    for (const [a, b] of edges) {
      const fwd = G.key(a) + '>' + G.key(b), rev = G.key(b) + '>' + G.key(a);
      if (dir.has(rev)) {
        const arr = dir.get(rev);
        arr.pop();
        if (!arr.length) dir.delete(rev);
      } else {
        if (!dir.has(fwd)) dir.set(fwd, []);
        dir.get(fwd).push([a, b]);
      }
    }
    const loops = chainLoops([...dir.values()].flat());
    if (!loops) {
      for (const t of list) mk(t.p, n, mt); // cadangan: segitiga apa adanya
      continue;
    }
    if (!loops.length) continue; // semua sisi saling meniadakan (luas bersih nol)
    const bs = G.basis(n), o = V(loops[0][0]);
    const info = loops
      .map(dropCollinear)
      .filter((l) => l.length >= 3)
      .map((l) => {
        const p2 = l.map((p) => G.to2D(p, o, bs));
        let s = 0;
        for (let i = 0; i < p2.length; i++) s += p2[i].x * p2[(i + 1) % p2.length].y - p2[(i + 1) % p2.length].x * p2[i].y;
        return { l, p2, area: s / 2 };
      });
    const holes = info.filter((x) => x.area < -1e-9);
    for (const out of info.filter((x) => x.area > 1e-9)) {
      const f = mk(out.l, n, mt);
      if (f) f.holes = holes.filter((h) => G.pointInPoly2(h.p2[0], out.p2)).map((h) => h.l);
    }
  }
  return faces;
}

// op: 'union' | 'subtract' | 'intersect'. Mengembalikan 'ok', 'open' (benda tidak tertutup) atau 'empty'.
export function booleanSolids(model, sa, sb, op) {
  const fa = model.faces.find((f) => f.solid === sa);
  if (!fa || !model.faces.some((f) => f.solid === sb)) return 'empty';
  if (!isClosedSolid(model, sa) || !isClosedSolid(model, sb)) return 'open';
  const palette = [];
  const ev = new Evaluator();
  ev.attributes = ['position', 'normal', 'color'];
  ev.useGroups = false;
  const res = ev.evaluate(solidBrush(model, sa, palette), solidBrush(model, sb, palette), OPS[op]);
  const g = res.geometry;
  const P = g.attributes.position, C = g.attributes.color;
  const idx = g.index ? g.index.array : null;
  const count = idx ? idx.length : P.count;
  const tris = [];
  for (let i = 0; i < count; i += 3) {
    const ii = [0, 1, 2].map((k) => (idx ? idx[i + k] : i + k));
    const p = ii.map((j) => [P.getX(j), P.getY(j), P.getZ(j)].map((x) => Math.round(x * 1e6) / 1e6));
    const n = V(p[1]).sub(V(p[0])).cross(V(p[2]).sub(V(p[0])));
    if (n.length() < 1e-9) continue;
    n.normalize();
    tris.push({ p, n: [n.x, n.y, n.z], mat: Math.round(C.getX(ii[0])) });
  }
  if (!tris.length && op !== 'intersect') return 'empty';
  const sid = model.nextId++;
  const faces = trianglesToFaces(model, tris, sid, fa.group ?? null, palette);
  model.faces = model.faces.filter((f) => f.solid !== sa && f.solid !== sb);
  model.faces.push(...faces);
  return 'ok';
}
