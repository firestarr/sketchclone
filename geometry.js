// Inti geometri: model data murni (tanpa DOM) + operasi pemodelan.
// Model: { faces:[{id,pts,holes,n,color,solid}], lines:[{id,a,b}], nextId }
// Satuan: meter, sumbu Z ke atas.
import * as THREE from 'three';

const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
const A = (v) => [v.x, v.y, v.z];

export const key = (p) => p.map((x) => Math.round(x * 1e4)).join(',');
export const newModel = () => ({ faces: [], lines: [], guides: [], groups: {}, labels: [], dims: [], section: null, tags: [], scenes: [], style: null, nextId: 1 });
export function normalizeModel(m) {
  m.guides ||= [];
  m.groups ||= {};
  m.labels ||= [];
  m.dims ||= [];
  m.lights ||= [];
  if (m.section === undefined) m.section = null;
  m.tags ||= [];
  m.scenes ||= [];
  if (m.style === undefined) m.style = null;
  return m;
}
const gOf = (e) => e.group ?? null;
export const cloneModel = (m) => structuredClone(m);

export function newellNormal(pts) {
  const n = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n.x += (a[1] - b[1]) * (a[2] + b[2]);
    n.y += (a[2] - b[2]) * (a[0] + b[0]);
    n.z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return n; // panjang = 2 * luas
}

// Basis (u, v, N) dengan u x v = N.
export function basis(nArr) {
  const N = V(nArr).normalize();
  const ref = Math.abs(N.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(ref, N).normalize();
  const v = new THREE.Vector3().crossVectors(N, u);
  return { u, v, N };
}

export function to2D(p, o, bs) {
  const d = V(p).sub(o);
  return new THREE.Vector2(d.dot(bs.u), d.dot(bs.v));
}

export function pointInPoly2(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const signedArea2 = (poly) => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
};

function dedupe(pts) {
  const out = [];
  for (const p of pts) if (!out.length || key(out[out.length - 1]) !== key(p)) out.push(p);
  if (out.length > 1 && key(out[0]) === key(out[out.length - 1])) out.pop();
  return out;
}

export function makeFace(model, pts, hint, color = '#e9e4d4', solid = null) {
  pts = dedupe(pts);
  if (pts.length < 3) return null;
  const n = newellNormal(pts);
  if (n.length() / 2 < 1e-8) return null;
  n.normalize();
  if (!hint && Math.abs(n.z) > 0.99) hint = new THREE.Vector3(0, 0, 1); // bidang datar menghadap atas
  if (hint && n.dot(hint) < 0) {
    pts = pts.slice().reverse();
    n.negate();
  }
  return { id: model.nextId++, pts, holes: [], n: A(n), color, solid, group: null };
}

const flipFace = (f) => {
  f.pts.reverse();
  f.holes.forEach((h) => h.reverse());
  f.n = f.n.map((x) => -x);
};

export function faceArea(f) {
  const area = (loop) => newellNormal(loop).length() / 2;
  return area(f.pts) - f.holes.reduce((s, h) => s + area(h), 0);
}

export function triangulateFace(f) {
  const bs = basis(f.n);
  const o = V(f.pts[0]);
  const c2 = f.pts.map((p) => to2D(p, o, bs));
  const h2 = f.holes.map((h) => h.map((p) => to2D(p, o, bs)));
  const tris = THREE.ShapeUtils.triangulateShape(c2.slice(), h2.map((h) => h.slice()));
  const all = [...f.pts, ...f.holes.flat()];
  const all2 = [...c2, ...h2.flat()];
  const out = [];
  for (const t of tris) {
    let [a, b, c] = t;
    const cr = (all2[b].x - all2[a].x) * (all2[c].y - all2[a].y) - (all2[b].y - all2[a].y) * (all2[c].x - all2[a].x);
    if (cr < 0) [b, c] = [c, b];
    out.push(all[a], all[b], all[c]);
  }
  return out;
}

// Cari bidang yang menjadi "induk" dari poligon baru (koplanar dan memuatnya).
export function findHost(model, pts, n, grp = null) {
  const N = V(n);
  for (const f of model.faces) {
    if (gOf(f) !== grp) continue;
    const fn = V(f.n);
    if (Math.abs(Math.abs(fn.dot(N)) - 1) > 1e-4) continue;
    const o = V(f.pts[0]);
    if (!pts.every((p) => Math.abs(V(p).sub(o).dot(fn)) < 1e-4)) continue;
    const bs = basis(f.n);
    const c2 = f.pts.map((p) => to2D(p, o, bs));
    if (!pts.every((p) => pointInPoly2(to2D(p, o, bs), c2))) continue;
    const inHole = f.holes.some((h) => {
      const h2 = h.map((p) => to2D(p, o, bs));
      return pts.some((p) => pointInPoly2(to2D(p, o, bs), h2));
    });
    if (inHole) continue;
    return f;
  }
  return null;
}

const faceSig = (pts) => pts.map(key).sort().join('|');

export function addFace(model, pts, hint, grp = null) {
  const f = makeFace(model, pts, hint);
  if (!f) return null;
  f.group = grp;
  const sig = faceSig(f.pts);
  if (model.faces.some((x) => gOf(x) === grp && faceSig(x.pts) === sig)) return null;
  const host = findHost(model, f.pts, f.n, grp);
  if (host) {
    if (host.solid == null) host.solid = model.nextId++;
    f.solid = host.solid;
    f.color = host.color;
    f.tex = host.tex ?? null;
    f.texScale = host.texScale;
    f.texScaleV = host.texScaleV;
    f.texRot = host.texRot;
    host.holes.push(f.pts.slice());
  }
  model.faces.push(f);
  return f;
}

// Tambah garis; jika membentuk loop tertutup & koplanar dari garis-garis bebas, jadikan bidang.
export function addLine(model, a, b, grp = null) {
  const ka = key(a), kb = key(b);
  if (ka === kb) return null;
  if (splitFacesByLine(model, a, b, grp)) return { line: null, face: null, split: true };
  const same = (l) => gOf(l) === grp && (key(l.a) === ka && key(l.b) === kb) || (key(l.a) === kb && key(l.b) === ka);
  if (model.lines.some(same)) return null;
  const line = { id: model.nextId++, a, b, group: grp };
  model.lines.push(line);

  const adj = new Map();
  const pt = new Map();
  for (const l of model.lines) {
    if (l === line || gOf(l) !== grp) continue;
    const k1 = key(l.a), k2 = key(l.b);
    pt.set(k1, l.a);
    pt.set(k2, l.b);
    if (!adj.has(k1)) adj.set(k1, []);
    if (!adj.has(k2)) adj.set(k2, []);
    adj.get(k1).push({ to: k2, line: l });
    adj.get(k2).push({ to: k1, line: l });
  }
  const prev = new Map([[kb, null]]);
  const queue = [kb];
  while (queue.length && !prev.has(ka)) {
    const k = queue.shift();
    for (const e of adj.get(k) || []) {
      if (!prev.has(e.to)) {
        prev.set(e.to, { from: k, line: e.line });
        queue.push(e.to);
      }
    }
  }
  if (!prev.has(ka)) return { line, face: null };

  const keys = [];
  const used = new Set([line.id]);
  for (let k = ka; k != null; ) {
    keys.push(k);
    const pr = prev.get(k);
    if (!pr) break;
    used.add(pr.line.id);
    k = pr.from;
  }
  const pts = keys.map((k) => (k === ka ? a : k === kb ? b : pt.get(k)));
  if (pts.length < 3) return { line, face: null };
  const n = newellNormal(pts).normalize();
  const o = V(pts[0]);
  if (!pts.every((p) => Math.abs(V(p).sub(o).dot(n)) < 1e-4)) return { line, face: null };
  const face = addFace(model, pts, null, grp);
  if (face) model.lines = model.lines.filter((l) => !used.has(l.id));
  return { line, face };
}

// Dorong/tarik sebuah bidang sejauh d sepanjang normalnya.
export function pushPull(model, faceId, d) {
  const f = model.faces.find((x) => x.id === faceId);
  if (!f || Math.abs(d) < 1e-6) return false;
  const n = V(f.n);
  const off = n.clone().multiplyScalar(d);
  const sgn = d > 0 ? 1 : -1;
  const sh = (p) => A(V(p).add(off));
  const hadSolid = f.solid != null;
  const sid = hadSolid ? f.solid : model.nextId++;
  const bs = basis(f.n);
  const o = V(f.pts[0]);

  const sides = [];
  [f.pts, ...f.holes].forEach((loop, li) => {
    const orient = signedArea2(loop.map((p) => to2D(p, o, bs)));
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      const e = V(b).sub(V(a));
      const dir = orient > 0 ? e.clone().cross(n) : n.clone().cross(e); // menjauhi area dalam loop
      if (li > 0) dir.negate();
      if (hadSolid) dir.multiplyScalar(sgn); // dinding lubang menghadap ke dalam lubang
      const q = makeFace(model, [a, b, sh(b), sh(a)], dir, f.color, sid);
      if (q) {
        q.group = f.group ?? null;
        q.tex = f.tex ?? null;
        q.texScale = f.texScale;
        q.texScaleV = f.texScaleV;
        q.texRot = f.texRot;
        sides.push(q);
      }
    }
  });

  const top = {
    id: model.nextId++,
    pts: f.pts.map(sh),
    holes: f.holes.map((h) => h.map(sh)),
    n: f.n.slice(),
    color: f.color,
    solid: sid,
    group: f.group ?? null,
    tex: f.tex ?? null,
    texScale: f.texScale,
    texScaleV: f.texScaleV,
    texRot: f.texRot,
  };
  if (hadSolid) {
    model.faces = model.faces.filter((x) => x !== f);
  } else {
    if (sgn > 0) flipFace(f); // alas menghadap ke luar (bawah)
    else flipFace(top);
    f.solid = sid;
  }
  model.faces.push(...sides, top);
  return true;
}

// ---------- Hierarki grup (grup bersarang) ----------
export const parentOf = (model, g) => (g == null ? null : model.groups[g]?.parent ?? null);

export function isInTree(model, g, root) {
  for (let x = g; x != null; x = parentOf(model, x)) if (x === root) return true;
  return false;
}

// Grup teratas di bawah 'scope' yang memuat g (null bila g langsung di scope).
export function topUnder(model, g, scope) {
  for (let x = g; x != null; ) {
    const p = parentOf(model, x);
    if (p === scope) return x;
    x = p;
  }
  return null;
}

export function subtreeGroups(model, root) {
  const out = new Set([root]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [k, g] of Object.entries(model.groups)) {
      if (!out.has(+k) && g.parent != null && out.has(g.parent)) {
        out.add(+k);
        grew = true;
      }
    }
  }
  return out;
}

export function entitiesInTree(model, root) {
  const gs = subtreeGroups(model, root);
  const out = new Set();
  for (const e of [...model.faces, ...model.lines]) if (gs.has(gOf(e))) out.add(e.id);
  return out;
}

export function expandSelection(model, ids, scope = null) {
  const out = new Set(ids);
  const solids = new Set(), groups = new Set();
  for (const e of [...model.faces, ...model.lines]) {
    if (!ids.has(e.id)) continue;
    if (e.solid != null) solids.add(e.solid);
    if (gOf(e) != null && gOf(e) !== scope) groups.add(gOf(e));
  }
  for (const f of model.faces) if (f.solid != null && solids.has(f.solid)) out.add(f.id);
  for (const g of groups) entitiesInTree(model, g).forEach((i) => out.add(i));
  return out;
}

// Titik acuan tekstur: menempel pada bidang dan ikut berpindah/berputar bersama bidang.
export function ensureUV(f) {
  if (f.uv) return f.uv;
  const bs = basis(f.n);
  const N = V(f.n);
  f.uv = { o: A(N.clone().multiplyScalar(V(f.pts[0]).dot(N))), u: A(bs.u) };
  return f.uv;
}

function mapSel(model, ids, fp, fn) {
  for (const f of model.faces) {
    if (!ids.has(f.id)) continue;
    if (f.tex) {
      ensureUV(f);
      f.uv = { o: fp(f.uv.o), u: fn ? fn(f.uv.u) : f.uv.u };
    }
    f.pts = f.pts.map(fp);
    f.holes = f.holes.map((h) => h.map(fp));
    if (fn) f.n = fn(f.n);
  }
  for (const l of model.lines) {
    if (!ids.has(l.id)) continue;
    l.a = fp(l.a);
    l.b = fp(l.b);
  }
}

export function applyMatrix(model, ids, M) {
  const NM = new THREE.Matrix3().getNormalMatrix(M);
  mapSel(
    model,
    ids,
    (p) => A(V(p).applyMatrix4(M)),
    (n) => A(V(n).applyMatrix3(NM).normalize()),
  );
  if (M.determinant() < 0) {
    // cermin membalik urutan titik; kembalikan agar searah dengan normal
    for (const f of model.faces) {
      if (!ids.has(f.id)) continue;
      f.pts.reverse();
      f.holes.forEach((h) => h.reverse());
    }
  }
  // grup yang seluruh isinya ikut bertransformasi -> perbarui matriks instansnya
  const gs = new Set();
  for (const e of [...model.faces, ...model.lines]) {
    if (!ids.has(e.id)) continue;
    for (let g = gOf(e); g != null && !gs.has(g); g = parentOf(model, g)) {
      if ([...entitiesInTree(model, g)].every((i) => ids.has(i))) gs.add(g);
      else break;
    }
  }
  for (const g of gs) {
    const grp = model.groups[g];
    if (grp && grp.m) grp.m = new THREE.Matrix4().fromArray(grp.m).premultiply(M).toArray();
  }
}

export const translate = (model, ids, d) => applyMatrix(model, ids, new THREE.Matrix4().makeTranslation(d.x, d.y, d.z));

const about = (c, M) =>
  new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(M).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));

export const rotate = (model, ids, c, axis, ang) =>
  applyMatrix(model, ids, about(c, new THREE.Matrix4().makeRotationAxis(axis, ang)));

export const scale = (model, ids, c, s) => applyMatrix(model, ids, about(c, new THREE.Matrix4().makeScale(s, s, s)));
export const scaleAxes = (model, ids, c, sx, sy, sz) => applyMatrix(model, ids, about(c, new THREE.Matrix4().makeScale(sx, sy, sz)));

// tex: id tekstur atau null; texScale: meter per ulangan gambar.
export function paint(model, ids, color, tex = null, texScale = 1, texScaleV = null, texRot = 0) {
  for (const f of model.faces) {
    if (!ids.has(f.id)) continue;
    f.color = color;
    f.tex = tex;
    f.texScale = texScale;
    if (texScaleV) f.texScaleV = texScaleV;
    else delete f.texScaleV;
    if (texRot) f.texRot = texRot;
    else delete f.texRot;
    delete f.texOff;
    delete f.uv;
  }
}

export function deleteIds(model, ids) {
  const removed = model.faces.filter((f) => ids.has(f.id));
  model.faces = model.faces.filter((f) => !ids.has(f.id));
  model.lines = model.lines.filter((l) => !ids.has(l.id));
  model.guides = model.guides.filter((g) => !ids.has(g.id));
  model.labels = model.labels.filter((g) => !ids.has(g.id));
  model.dims = model.dims.filter((g) => !ids.has(g.id));
  if (model.lights) model.lights = model.lights.filter((g) => !ids.has(g.id));
  // sembuhkan lubang pada bidang induk yang tadinya diisi bidang yang dihapus
  const sigs = new Set(removed.map((f) => faceSig(f.pts)));
  for (const f of model.faces) f.holes = f.holes.filter((h) => !sigs.has(faceSig(h)));
  pruneGroups(model);
}

function pruneGroups(model) {
  const used = new Set();
  for (const e of [...model.faces, ...model.lines]) for (let g = gOf(e); g != null && !used.has(g); g = parentOf(model, g)) used.add(g);
  for (const g of Object.keys(model.groups)) if (!used.has(+g)) delete model.groups[g];
}

// ---------- Grup & Komponen ----------
export function makeGroup(model, ids, name, isComponent, parent = null) {
  const gid = model.nextId++;
  model.groups[gid] = { name, def: isComponent ? 'd' + gid : null, m: new THREE.Matrix4().toArray(), parent };
  for (const e of [...model.faces, ...model.lines]) if (ids.has(e.id) && gOf(e) === parent) e.group = gid;
  for (const [k, g] of Object.entries(model.groups)) {
    if (+k === gid || (g.parent ?? null) !== parent) continue;
    if ([...entitiesInTree(model, +k)].some((i) => ids.has(i))) g.parent = gid;
  }
  pruneGroups(model);
  return gid;
}

export function explode(model, gids) {
  for (const g of gids) {
    const p = parentOf(model, g);
    for (const e of [...model.faces, ...model.lines]) if (gOf(e) === g) e.group = p;
    for (const grp of Object.values(model.groups)) if (grp.parent === g) grp.parent = p;
    delete model.groups[g];
  }
}

// Salin entitas; grup ikut disalin (komponen tetap bertaut lewat 'def').
// scope: grup yang sedang diedit; grup di atasnya tidak ikut disalin.
export function duplicate(model, ids, scope = null) {
  const out = new Set();
  const gset = new Set();
  for (const e of [...model.faces, ...model.lines]) {
    if (!ids.has(e.id)) continue;
    for (let g = gOf(e); g != null && g !== scope; g = parentOf(model, g)) gset.add(g);
  }
  const solidMap = new Map(), groupMap = new Map();
  const mapSolid = (s) => {
    if (s == null) return null;
    if (!solidMap.has(s)) solidMap.set(s, model.nextId++);
    return solidMap.get(s);
  };
  const mapGroup = (g) => {
    if (g == null || !gset.has(g)) return g;
    if (!groupMap.has(g)) {
      const ng = model.nextId++;
      groupMap.set(g, ng);
      const copy = structuredClone(model.groups[g]);
      copy.parent = mapGroup(copy.parent ?? null);
      model.groups[ng] = copy;
    }
    return groupMap.get(g);
  };
  for (const f of model.faces.slice()) {
    if (!ids.has(f.id)) continue;
    const nf = structuredClone(f);
    nf.id = model.nextId++;
    nf.solid = mapSolid(f.solid);
    nf.group = mapGroup(gOf(f));
    model.faces.push(nf);
    out.add(nf.id);
  }
  for (const l of model.lines.slice()) {
    if (!ids.has(l.id)) continue;
    const nl = structuredClone(l);
    nl.id = model.nextId++;
    nl.group = mapGroup(gOf(l));
    model.lines.push(nl);
    out.add(nl.id);
  }
  return out;
}

// Samakan semua instans komponen dengan isi instans yang sedang diedit (termasuk grup di dalamnya).
export function syncComponent(model, gid) {
  const g = model.groups[gid];
  if (!g || !g.def) return;
  const inv = new THREE.Matrix4().fromArray(g.m).invert();
  const srcGroups = subtreeGroups(model, gid);
  const srcF = model.faces.filter((f) => srcGroups.has(gOf(f)));
  const srcL = model.lines.filter((l) => srcGroups.has(gOf(l)));
  for (const [k, g2] of Object.entries(model.groups)) {
    const id2 = +k;
    if (id2 === gid || g2.def !== g.def) continue;
    if (isInTree(model, id2, gid) || isInTree(model, gid, id2)) continue;
    const M = new THREE.Matrix4().fromArray(g2.m).multiply(inv);
    const dst = subtreeGroups(model, id2);
    model.faces = model.faces.filter((f) => !dst.has(gOf(f)));
    model.lines = model.lines.filter((l) => !dst.has(gOf(l)));
    for (const d of dst) if (d !== id2) delete model.groups[d];
    const gmap = new Map([[gid, id2]]);
    for (const sg of srcGroups) if (sg !== gid) gmap.set(sg, model.nextId++);
    for (const sg of srcGroups) {
      if (sg === gid) continue;
      const copy = structuredClone(model.groups[sg]);
      copy.parent = gmap.get(copy.parent);
      copy.m = M.clone().multiply(new THREE.Matrix4().fromArray(copy.m)).toArray();
      model.groups[gmap.get(sg)] = copy;
    }
    const tp = (p) => A(V(p).applyMatrix4(M));
    const NM = new THREE.Matrix3().getNormalMatrix(M);
    const td = (n) => A(V(n).transformDirection(M));
    const mirror = M.determinant() < 0;
    const solidMap = new Map();
    for (const f of srcF) {
      const nf = structuredClone(f);
      nf.id = model.nextId++;
      nf.pts = f.pts.map(tp);
      nf.holes = f.holes.map((h) => h.map(tp));
      nf.n = A(V(f.n).applyMatrix3(NM).normalize());
      if (mirror) {
        nf.pts.reverse();
        nf.holes.forEach((h) => h.reverse());
      }
      if (f.uv) nf.uv = { o: tp(f.uv.o), u: td(f.uv.u) };
      if (f.solid != null) {
        if (!solidMap.has(f.solid)) solidMap.set(f.solid, model.nextId++);
        nf.solid = solidMap.get(f.solid);
      }
      nf.group = gmap.get(gOf(f));
      model.faces.push(nf);
    }
    for (const l of srcL) model.lines.push({ id: model.nextId++, a: tp(l.a), b: tp(l.b), group: gmap.get(gOf(l)) });
  }
}

export function bboxOf(model, ids = null, vis = null) {
  const box = new THREE.Box3();
  for (const f of model.faces) if ((!ids || ids.has(f.id)) && (!vis || vis(f))) f.pts.forEach((p) => box.expandByPoint(V(p)));
  for (const l of model.lines) if ((!ids || ids.has(l.id)) && (!vis || vis(l))) box.expandByPoint(V(l.a)).expandByPoint(V(l.b));
  return box;
}

// ---------- Ekspor (Z-atas -> Y-atas) ----------
const tx = (p) => [p[0], p[2], -p[1]];
const num = (x) => (Math.abs(x) < 1e-9 ? 0 : +x.toFixed(6));

export function exportOBJ(model) {
  const out = ['# SketchClone', 'o model'];
  let vi = 1, ni = 1;
  for (const f of model.faces) {
    const tris = triangulateFace(f);
    const nn = tx(f.n);
    out.push(`vn ${nn.map(num).join(' ')}`);
    for (const p of tris) out.push(`v ${tx(p).map(num).join(' ')}`);
    for (let i = 0; i < tris.length; i += 3) {
      out.push(`f ${vi}//${ni} ${vi + 1}//${ni} ${vi + 2}//${ni}`);
      vi += 3;
    }
    ni++;
  }
  return out.join('\n') + '\n';
}

export function exportSTL(model) {
  const out = ['solid sketchclone'];
  for (const f of model.faces) {
    const tris = triangulateFace(f);
    const nn = tx(f.n).map(num).join(' ');
    for (let i = 0; i < tris.length; i += 3) {
      out.push(` facet normal ${nn}`, '  outer loop');
      for (let k = 0; k < 3; k++) out.push(`   vertex ${tx(tris[i + k]).map(num).join(' ')}`);
      out.push('  endloop', ' endfacet');
    }
  }
  out.push('endsolid sketchclone');
  return out.join('\n') + '\n';
}

// ---------- Potong bidang dengan garis (tali busur antar-tepi) ----------
const onSegT = (p, a, b) => {
  const ab = V(b).sub(V(a));
  const t = V(p).sub(V(a)).dot(ab) / ab.lengthSq();
  if (t < -1e-9 || t > 1 + 1e-9) return null;
  return V(a).addScaledVector(ab, t).distanceTo(V(p)) < 1e-4 ? t : null;
};

function insertOnLoop(loop, p) {
  const k = key(p);
  if (loop.some((q) => key(q) === k)) return loop;
  for (let i = 0; i < loop.length; i++) {
    if (onSegT(p, loop[i], loop[(i + 1) % loop.length]) != null) {
      const out = loop.slice();
      out.splice(i + 1, 0, p);
      return out;
    }
  }
  return null;
}

const cross2 = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const properCross = (p1, p2, p3, p4) => {
  const e = 1e-9;
  const d1 = cross2(p3, p4, p1), d2 = cross2(p3, p4, p2), d3 = cross2(p1, p2, p3), d4 = cross2(p1, p2, p4);
  return d1 * d2 < -e && d3 * d4 < -e;
};

export function splitFacesByLine(model, a, b, grp = null) {
  let did = false;
  for (const f of model.faces.slice()) {
    if (gOf(f) !== grp) continue;
    const n = V(f.n), o = V(f.pts[0]);
    if (Math.abs(V(a).sub(o).dot(n)) > 1e-4 || Math.abs(V(b).sub(o).dot(n)) > 1e-4) continue;
    let L = insertOnLoop(f.pts, a);
    if (!L) continue;
    L = insertOnLoop(L, b);
    if (!L) continue;
    const ka = key(a), kb = key(b);
    const ia = L.findIndex((q) => key(q) === ka), ib = L.findIndex((q) => key(q) === kb);
    const N = L.length;
    const diff = Math.abs(ia - ib);
    if (ia === ib || diff === 1 || diff === N - 1) continue;
    const bs = basis(f.n);
    const L2 = L.map((p) => to2D(p, o, bs));
    const a2 = L2[ia], b2 = L2[ib];
    const mid = a2.clone().add(b2).multiplyScalar(0.5);
    if (!pointInPoly2(mid, L2)) continue;
    let bad = false;
    for (let i = 0; i < N && !bad; i++) if (properCross(a2, b2, L2[i], L2[(i + 1) % N])) bad = true;
    for (const h of f.holes) {
      const h2 = h.map((p) => to2D(p, o, bs));
      if (pointInPoly2(mid, h2)) bad = true;
      for (let i = 0; i < h2.length && !bad; i++) if (properCross(a2, b2, h2[i], h2[(i + 1) % h2.length])) bad = true;
    }
    if (bad) continue;
    const walk = (s0, e0) => {
      const out = [];
      for (let i = s0; ; i = (i + 1) % N) {
        out.push(L[i]);
        if (i === e0) break;
      }
      return out;
    };
    const p1 = walk(ia, ib), p2 = walk(ib, ia);
    const p1_2 = p1.map((p) => to2D(p, o, bs));
    const holes1 = [], holes2 = [];
    for (const h of f.holes) (pointInPoly2(to2D(h[0], o, bs), p1_2) ? holes1 : holes2).push(h);
    f.pts = p1;
    f.holes = holes1;
    const nf = structuredClone(f);
    nf.id = model.nextId++;
    nf.pts = p2;
    nf.holes = holes2;
    model.faces.push(nf);
    did = true;
  }
  return did;
}

// ---------- Offset ----------
export function offsetLoop(pts, nArr, d) {
  const bs = basis(nArr);
  const o = V(pts[0]);
  const p2 = pts.map((p) => to2D(p, o, bs));
  const orient = signedArea2(p2) > 0 ? 1 : -1;
  const N = p2.length;
  const lines = [];
  for (let i = 0; i < N; i++) {
    const a = p2[i], b = p2[(i + 1) % N];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return null;
    const nx = (orient > 0 ? dy : -dy) / len, ny = (orient > 0 ? -dx : dx) / len;
    lines.push({ p: new THREE.Vector2(a.x + nx * d, a.y + ny * d), d: new THREE.Vector2(dx / len, dy / len) });
  }
  const out2 = [];
  for (let i = 0; i < N; i++) {
    const l1 = lines[(i + N - 1) % N], l2 = lines[i];
    const den = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
    if (Math.abs(den) < 1e-9) {
      out2.push(l2.p.clone());
      continue;
    }
    const w = l2.p.clone().sub(l1.p);
    const t = (w.x * l2.d.y - w.y * l2.d.x) / den;
    out2.push(l1.p.clone().addScaledVector(l1.d, t));
  }
  const area = signedArea2(out2);
  if (Math.abs(area) < 1e-6 || Math.sign(area) !== orient) return null;
  if (d < 0 && !out2.every((q) => pointInPoly2(q, p2))) return null;
  return out2.map((q) => A(o.clone().addScaledVector(bs.u, q.x).addScaledVector(bs.v, q.y)));
}

export function applyOffset(model, faceId, d) {
  const f = model.faces.find((x) => x.id === faceId);
  if (!f || Math.abs(d) < 1e-6) return null;
  const pts = offsetLoop(f.pts, f.n, d);
  if (!pts) return null;
  if (d < 0) return addFace(model, pts, V(f.n), f.group ?? null);
  const ring = makeFace(model, pts, V(f.n), f.color, f.solid);
  if (!ring) return null;
  ring.group = f.group ?? null;
  ring.tex = f.tex ?? null;
  ring.texScale = f.texScale;
  ring.texScaleV = f.texScaleV;
  ring.texRot = f.texRot;
  ring.holes = [f.pts.slice()];
  model.faces.push(ring);
  return ring;
}

// ---------- Follow Me ----------
export function pathFromLines(lines) {
  if (!lines.length) return null;
  const adj = new Map(), pt = new Map();
  const link = (x, y) => {
    if (!adj.has(x)) adj.set(x, []);
    adj.get(x).push(y);
  };
  for (const l of lines) {
    const ka = key(l.a), kb = key(l.b);
    pt.set(ka, l.a);
    pt.set(kb, l.b);
    link(ka, kb);
    link(kb, ka);
  }
  if ([...adj.values()].some((v) => v.length > 2)) return null;
  const ends = [...adj.entries()].filter(([, v]) => v.length === 1).map(([k]) => k);
  let start, closed = false;
  if (ends.length === 2) start = ends[0];
  else if (ends.length === 0) {
    start = [...adj.keys()][0];
    closed = true;
  } else return null;
  const out = [pt.get(start)], seen = new Set([start]);
  let cur = start, prev = null;
  for (;;) {
    const nb = adj.get(cur).filter((k) => k !== prev);
    if (!nb.length) break;
    const nk = nb[0];
    if (nk === start || seen.has(nk)) break;
    out.push(pt.get(nk));
    seen.add(nk);
    prev = cur;
    cur = nk;
  }
  if (out.length !== adj.size) return null;
  return { pts: out.map(V), closed };
}

export function followMe(model, profileId, path, closed) {
  const f = model.faces.find((x) => x.id === profileId);
  if (!f || path.length < 2) return false;
  let P = path.map((p) => p.clone());
  const c = new THREE.Vector3();
  f.pts.forEach((p) => c.add(V(p)));
  c.divideScalar(f.pts.length);
  if (closed) {
    let bi = 0, bd = Infinity;
    P.forEach((p, i) => {
      const d = p.distanceTo(c);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    P = [...P.slice(bi), ...P.slice(0, bi)];
    P.push(P[0].clone());
  } else if (P[0].distanceTo(c) > P[P.length - 1].distanceTo(c)) P.reverse();
  const m = P.length - 1;
  const d = [];
  for (let k = 0; k < m; k++) d.push(P[k + 1].clone().sub(P[k]).normalize());
  const mn = [];
  for (let k = 0; k <= m; k++) {
    let v;
    if (k === 0) v = closed ? d[m - 1].clone().add(d[0]) : V(f.n);
    else if (k === m) v = closed ? mn[0].clone() : d[m - 1].clone();
    else v = d[k - 1].clone().add(d[k]);
    if (v.length() < 1e-6) return false;
    mn.push(v.normalize());
  }
  const loops = [f.pts, ...f.holes];
  const sect = [];
  for (const loop of loops) {
    let cur = loop.map(V);
    if (closed) {
      const den0 = d[0].dot(mn[0]);
      if (Math.abs(den0) < 1e-6) return false;
      cur = cur.map((x) => x.clone().addScaledVector(d[0], P[0].clone().sub(x).dot(mn[0]) / den0));
    }
    const secs = [cur];
    for (let k = 0; k < m; k++) {
      const den = d[k].dot(mn[k + 1]);
      if (Math.abs(den) < 1e-6) return false;
      secs.push(secs[k].map((x) => x.clone().addScaledVector(d[k], P[k + 1].clone().sub(x).dot(mn[k + 1]) / den)));
    }
    if (closed) secs[m] = secs[0].map((x) => x.clone());
    sect.push(secs);
  }
  const sid = model.nextId++;
  const grp = f.group ?? null;
  const made = [];
  const push = (q) => {
    if (q) {
      q.group = grp;
      q.tex = f.tex ?? null;
      q.texScale = f.texScale;
      q.texScaleV = f.texScaleV;
      q.texRot = f.texRot;
      made.push(q);
    }
    return q;
  };
  sect.forEach((secs, li) => {
    const orient = Math.sign(newellNormal(secs[0].map(A)).dot(d[0])) || 1;
    const L = secs[0].length;
    for (let k = 0; k < m; k++) {
      for (let i = 0; i < L; i++) {
        const a = secs[k][i], b = secs[k][(i + 1) % L], b2 = secs[k + 1][(i + 1) % L], a2 = secs[k + 1][i];
        const e = b.clone().sub(a);
        const out = orient > 0 ? e.clone().cross(d[k]) : d[k].clone().cross(e);
        if (li > 0) out.negate();
        push(makeFace(model, [A(a), A(b), A(b2), A(a2)], out, f.color, sid));
      }
    }
  });
  if (!closed) {
    const cap = (k, hint) => {
      const q = push(makeFace(model, sect[0][k].map(A), hint, f.color, sid));
      if (q) q.holes = sect.slice(1).map((secs) => secs[k].map(A));
    };
    cap(0, d[0].clone().negate());
    cap(m, d[m - 1].clone());
  }
  model.faces = model.faces.filter((x) => x !== f);
  model.faces.push(...made);
  return made.length > 0;
}

// ---------- Regang (Move pada titik/tepi/bidang) ----------
// Menggeser semua titik yang kuncinya ada di 'keys' (dalam grup grp). Bidang yang tak lagi
// sebidang dipecah menjadi segitiga, seperti SketchUp melipat bidang.
export function stretch(model, keys, d, grp = null) {
  const mv = (p) => (keys.has(key(p)) ? [p[0] + d.x, p[1] + d.y, p[2] + d.z] : p);
  const out = [];
  for (const f of model.faces) {
    const touched = gOf(f) === grp && [f.pts, ...f.holes].some((l) => l.some((p) => keys.has(key(p))));
    if (!touched) {
      out.push(f);
      continue;
    }
    const pts = f.pts.map(mv), holes = f.holes.map((h) => h.map(mv));
    const nn = newellNormal(pts);
    if (nn.length() / 2 < 1e-8) continue; // bidang runtuh
    nn.normalize();
    const o = V(pts[0]);
    if ([...pts, ...holes.flat()].every((p) => Math.abs(V(p).sub(o).dot(nn)) < 1e-4)) {
      f.pts = pts;
      f.holes = holes;
      f.n = A(nn);
      delete f.uv;
      out.push(f);
      continue;
    }
    const tris = triangulateFace(f);
    for (let i = 0; i < tris.length; i += 3) {
      const tri = [mv(tris[i]), mv(tris[i + 1]), mv(tris[i + 2])];
      const q = makeFace(model, tri, newellNormal(tri), f.color, f.solid);
      if (!q) continue;
      q.group = f.group ?? null;
      q.tex = f.tex ?? null;
      q.texScale = f.texScale;
      q.texScaleV = f.texScaleV;
      q.texRot = f.texRot;
      if (f.tag != null) q.tag = f.tag;
      out.push(q);
    }
  }
  model.faces = out;
  for (const l of model.lines) {
    if (gOf(l) !== grp) continue;
    l.a = mv(l.a);
    l.b = mv(l.b);
  }
}

export function reverseFaces(model, ids) {
  for (const f of model.faces) {
    if (!ids.has(f.id)) continue;
    f.pts.reverse();
    f.holes.forEach((h) => h.reverse());
    f.n = f.n.map((x) => -x);
  }
}

// Ubah posisi titik bidang-bidang yang memenuhi pred; bidang yang jadi tidak sebidang dipecah menjadi segitiga.
export function deform(model, pred, fn) {
  const out = [];
  for (const f of model.faces) {
    if (!pred(f)) {
      out.push(f);
      continue;
    }
    const pts = f.pts.map(fn), holes = f.holes.map((h) => h.map(fn));
    const nn = newellNormal(pts);
    if (nn.length() / 2 < 1e-10) continue;
    nn.normalize();
    const o = V(pts[0]);
    if ([...pts, ...holes.flat()].every((p) => Math.abs(V(p).sub(o).dot(nn)) < 1e-5)) {
      f.pts = pts;
      f.holes = holes;
      f.n = A(nn);
      delete f.uv;
      out.push(f);
      continue;
    }
    const tris = triangulateFace(f);
    for (let i = 0; i < tris.length; i += 3) {
      const tri = [fn(tris[i]), fn(tris[i + 1]), fn(tris[i + 2])];
      const q = makeFace(model, tri, newellNormal(tri), f.color, f.solid); // urutan titik menentukan arah
      if (!q) continue;
      Object.assign(q, { group: f.group ?? null, tex: f.tex ?? null, texScale: f.texScale, texScaleV: f.texScaleV, texRot: f.texRot });
      if (f.soft) q.soft = true;
      if (f.shiny) q.shiny = true;
      if (f.finish) q.finish = f.finish;
      if (f.tag != null) q.tag = f.tag;
      out.push(q);
    }
  }
  model.faces = out;
}

// Medan ber-grid segitiga (Sandbox "Dari Awal"). Mengembalikan Set id bidang.
export function terrainGrid(model, a, b, spacing, color) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3) return null;
  let nx = Math.max(1, Math.round((x1 - x0) / spacing)), ny = Math.max(1, Math.round((y1 - y0) / spacing));
  const k = Math.max(1, Math.max(nx, ny) / 80); // batasi 80 x 80 sel
  nx = Math.max(1, Math.round(nx / k));
  ny = Math.max(1, Math.round(ny / k));
  const P = (i, j) => [x0 + ((x1 - x0) * i) / nx, y0 + ((y1 - y0) * j) / ny, a.z];
  const sid = model.nextId++;
  const ids = new Set();
  const up = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (const t of [[P(i, j), P(i + 1, j), P(i + 1, j + 1)], [P(i, j), P(i + 1, j + 1), P(i, j + 1)]]) {
        const f = makeFace(model, t, up, color, sid);
        if (f) {
          f.soft = true; // permukaan medan selalu dihaluskan
          model.faces.push(f);
          ids.add(f.id);
        }
      }
    }
  }
  return ids;
}

// ---------- Bulatkan sudut (fillet) ----------
// Mengganti setiap sudut poligon dengan busur ber-radius r. Radius otomatis diperkecil
// bila sisi terlalu pendek. segs = jumlah ruas per 90°.
export function filletLoop(pts, nArr, r, segs = 8) {
  if (!(r > 0) || pts.length < 3) return pts.slice();
  const bs = basis(nArr);
  const o = V(pts[0]);
  const q = pts.map((p) => to2D(p, o, bs));
  const N = q.length;
  const out = [];
  for (let i = 0; i < N; i++) {
    const a = q[(i + N - 1) % N], b = q[i], c = q[(i + 1) % N];
    const la = a.distanceTo(b), lc = c.distanceTo(b);
    if (la < 1e-9 || lc < 1e-9) continue;
    const u1 = a.clone().sub(b).divideScalar(la), u2 = c.clone().sub(b).divideScalar(lc);
    const th = Math.acos(Math.max(-1, Math.min(1, u1.dot(u2))));
    if (th > Math.PI - 1e-4 || th < 1e-4) {
      out.push(b.clone());
      continue;
    }
    let t = r / Math.tan(th / 2);
    t = Math.min(t, la * 0.5, lc * 0.5);
    const rr = t * Math.tan(th / 2);
    const p1 = b.clone().addScaledVector(u1, t), p2 = b.clone().addScaledVector(u2, t);
    const bis = u1.clone().add(u2).normalize();
    const cen = b.clone().addScaledVector(bis, rr / Math.sin(th / 2));
    const a1 = Math.atan2(p1.y - cen.y, p1.x - cen.x);
    let d = Math.atan2(p2.y - cen.y, p2.x - cen.x) - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const n = Math.max(2, Math.round((segs * Math.abs(d)) / (Math.PI / 2)));
    for (let k = 0; k <= n; k++) {
      const ang = a1 + (d * k) / n;
      out.push(new THREE.Vector2(cen.x + rr * Math.cos(ang), cen.y + rr * Math.sin(ang)));
    }
  }
  const res = [];
  for (const p of out) if (!res.length || res[res.length - 1].distanceTo(p) > 1e-6) res.push(p);
  if (res.length > 1 && res[0].distanceTo(res[res.length - 1]) < 1e-6) res.pop();
  return res.map((p) => A(o.clone().addScaledVector(bs.u, p.x).addScaledVector(bs.v, p.y)));
}

// Bulatkan sudut sebuah bidang. Bidang lepas: diganti langsung. Bidang milik solid berbentuk
// prisma (hasil Dorong/Tarik): profilnya dibulatkan lalu solid dibangun ulang dengan tinggi sama.
export function filletFace(model, faceId, r, mode = 'round') {
  const f = model.faces.find((x) => x.id === faceId);
  if (!f) return false;
  const loopFn = (l) => (mode === 'chamfer' ? chamferLoop(l, r) : filletLoop(l, f.n, r));
  const newPts = loopFn(f.pts);
  const newHoles = f.holes.map(loopFn);
  if (newPts.length === f.pts.length && f.holes.length === newHoles.length) {
    // tidak ada sudut yang berubah (mis. sudah bulat) tetap dianggap berhasil
  }
  const others = f.solid != null ? model.faces.filter((x) => x.solid === f.solid && x !== f) : [];
  if (!others.length) {
    // bidang lepas (atau pengisi lubang pada bidang induk)
    const sig = faceSig(f.pts);
    for (const h of model.faces) h.holes = h.holes.map((hl) => (faceSig(hl) === sig ? newPts.slice() : hl));
    f.pts = newPts;
    f.holes = newHoles;
    delete f.uv;
    return true;
  }
  // cari bidang seberang (prisma)
  const n = V(f.n);
  const loopLen = f.pts.length + f.holes.reduce((a, h) => a + h.length, 0);
  const opp = others.find((x) => V(x.n).dot(n) < -0.9999 && x.pts.length === f.pts.length && x.holes.length === f.holes.length);
  if (!opp) return false;
  const h = V(opp.pts[0]).sub(V(f.pts[0])).dot(n);
  const shift = n.clone().multiplyScalar(h);
  const oppKeys = new Set([opp.pts, ...opp.holes].flat().map(key));
  if (![f.pts, ...f.holes].flat().every((p) => oppKeys.has(key(A(V(p).add(shift)))))) return false;
  if (others.length !== loopLen + 1) return false;
  // bangun ulang
  const nf = makeFace(model, newPts, n, f.color, null);
  if (!nf) return false;
  nf.holes = newHoles;
  Object.assign(nf, { group: f.group ?? null, tex: f.tex ?? null, texScale: f.texScale, texScaleV: f.texScaleV, texRot: f.texRot });
  if (f.tag != null) nf.tag = f.tag;
  model.faces = model.faces.filter((x) => x.solid !== f.solid);
  model.faces.push(nf);
  pushPull(model, nf.id, h);
  return true;
}

// ---------- Bentuk putar (lathe): bola, kerucut, silinder, kapsul, torus ----------
// profile: [[jari2, tinggi], ...] dengan bagian dalam benda di sisi kiri arah lintasan.
export function lathe(model, c, n, profile, seg, closed, color) {
  const N = V(n).normalize();
  const bs = basis(A(N));
  const C = V(c);
  const sid = model.nextId++;
  const ids = [];
  const P = (r, z, i) => {
    const t = (2 * Math.PI * i) / seg;
    return A(C.clone().addScaledVector(bs.u, r * Math.cos(t)).addScaledVector(bs.v, r * Math.sin(t)).addScaledVector(N, z));
  };
  const K = closed ? profile.length : profile.length - 1;
  for (let k = 0; k < K; k++) {
    const [r0, z0] = profile[k], [r1, z1] = profile[(k + 1) % profile.length];
    const outR = z1 - z0, outZ = -(r1 - r0);
    for (let i = 0; i < seg; i++) {
      const tm = (2 * Math.PI * (i + 0.5)) / seg;
      const hint = bs.u.clone().multiplyScalar(Math.cos(tm) * outR).addScaledVector(bs.v, Math.sin(tm) * outR).addScaledVector(N, outZ);
      const f = makeFace(model, [P(r0, z0, i), P(r0, z0, i + 1), P(r1, z1, i + 1), P(r1, z1, i)], hint, color, sid);
      if (f) {
        model.faces.push(f);
        ids.push(f.id);
      }
    }
  }
  return { sid, ids };
}

const arc = (cr, cz, R, a0, a1, n) => [...Array(n + 1)].map((_, i) => {
  const a = a0 + ((a1 - a0) * i) / n;
  return [cr + R * Math.cos(a), cz + R * Math.sin(a)];
});

// Semua bentuk diletakkan "duduk" di atas titik p pada bidang bernormal n.
export function primitive(model, kind, p, n, a, b, color, seg = 24) {
  const P = V(p), N = V(n).normalize();
  if (kind === 'sphere') return lathe(model, A(P.clone().addScaledVector(N, a)), A(N), arc(0, 0, a, -Math.PI / 2, Math.PI / 2, 12), seg, false, color);
  if (kind === 'cone') return lathe(model, A(P), A(N), [[0, 0], [a, 0], [0, b]], seg, false, color);
  if (kind === 'cylinder') return lathe(model, A(P), A(N), [[0, 0], [a, 0], [a, b], [0, b]], seg, false, color);
  if (kind === 'capsule') {
    const h = Math.max(b, 2 * a + 1e-3);
    const prof = [...arc(0, a, a, -Math.PI / 2, 0, 6), ...arc(0, h - a, a, 0, Math.PI / 2, 6)];
    return lathe(model, A(P), A(N), prof, seg, false, color);
  }
  if (kind === 'torus') {
    const prof = arc(a, 0, b, 0, 2 * Math.PI, 24).slice(0, 24);
    return lathe(model, A(P.clone().addScaledVector(N, b)), A(N), prof, Math.max(seg, 32), true, color);
  }
  return null;
}

// ---------- Haluskan permukaan (subdivisi Catmull–Clark) ----------
function ccStep(polys) {
  const vk = new Map(), pos = [];
  const vid = (p) => {
    const k = key(p);
    if (!vk.has(k)) {
      vk.set(k, pos.length);
      pos.push(V(p));
    }
    return vk.get(k);
  };
  const F = polys.map((pl) => pl.pts.map(vid));
  const ek = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  const edges = new Map();
  F.forEach((f, fi) => f.forEach((a, j) => {
    const b = f[(j + 1) % f.length], k = ek(a, b);
    if (!edges.has(k)) edges.set(k, { a, b, faces: [] });
    edges.get(k).faces.push(fi);
  }));
  const fp = F.map((f) => f.reduce((s, i) => s.add(pos[i]), new THREE.Vector3()).multiplyScalar(1 / f.length));
  const ep = new Map();
  for (const [k, e] of edges) {
    const mid = pos[e.a].clone().add(pos[e.b]).multiplyScalar(0.5);
    ep.set(k, e.faces.length === 2 ? mid.clone().multiplyScalar(0.5).add(fp[e.faces[0]].clone().add(fp[e.faces[1]]).multiplyScalar(0.25)) : mid);
  }
  // titik lama yang dipindahkan
  const vFaces = pos.map(() => []), vEdges = pos.map(() => []);
  F.forEach((f, fi) => f.forEach((i) => vFaces[i].push(fi)));
  for (const e of edges.values()) {
    vEdges[e.a].push(e);
    vEdges[e.b].push(e);
  }
  const np = pos.map((P, i) => {
    const es = vEdges[i];
    if (es.some((e) => e.faces.length !== 2)) return P.clone(); // tepi terbuka: tetap
    const n = es.length;
    const Fa = vFaces[i].reduce((s, fi) => s.add(fp[fi]), new THREE.Vector3()).multiplyScalar(1 / vFaces[i].length);
    const R = es.reduce((s, e) => s.add(pos[e.a].clone().add(pos[e.b]).multiplyScalar(0.5)), new THREE.Vector3()).multiplyScalar(1 / n);
    return Fa.add(R.multiplyScalar(2)).add(P.clone().multiplyScalar(n - 3)).multiplyScalar(1 / n);
  });
  const out = [];
  F.forEach((f, fi) => {
    for (let j = 0; j < f.length; j++) {
      const a = f[j], nx = f[(j + 1) % f.length], pv = f[(j + f.length - 1) % f.length];
      out.push({ pts: [A(np[a]), A(ep.get(ek(a, nx))), A(fp[fi]), A(ep.get(ek(pv, a)))], src: polys[fi].src });
    }
  });
  return out;
}

export function subdivide(model, ids, levels = 1) {
  const src = model.faces.filter((f) => ids.has(f.id));
  if (!src.length) return null;
  let polys = [];
  for (const f of src) {
    if (f.holes.length) {
      const t = triangulateFace(f);
      for (let i = 0; i < t.length; i += 3) polys.push({ pts: [t[i], t[i + 1], t[i + 2]], src: f });
    } else polys.push({ pts: f.pts, src: f });
  }
  for (let l = 0; l < levels; l++) polys = ccStep(polys);
  const solidMap = new Map();
  const out = [];
  const make = (pts, s) => {
    const nn = newellNormal(pts);
    if (nn.length() < 1e-12) return;
    let sid = s.solid;
    if (sid == null) {
      if (!solidMap.has(s)) solidMap.set(s, model.nextId++);
      sid = solidMap.get(s);
    }
    const q = makeFace(model, pts, nn, s.color, sid);
    if (!q) return;
    Object.assign(q, { group: s.group ?? null, tex: s.tex ?? null, texScale: s.texScale, texScaleV: s.texScaleV, texRot: s.texRot, soft: true });
    if (s.shiny) q.shiny = true;
    if (s.finish) q.finish = s.finish;
    if (s.tag != null) q.tag = s.tag;
    out.push(q);
  };
  for (const pl of polys) {
    const nn = newellNormal(pl.pts).normalize();
    const o = V(pl.pts[0]);
    if (pl.pts.every((p) => Math.abs(V(p).sub(o).dot(nn)) < 1e-5)) make(pl.pts, pl.src);
    else {
      make([pl.pts[0], pl.pts[1], pl.pts[2]], pl.src);
      make([pl.pts[0], pl.pts[2], pl.pts[3]], pl.src);
    }
  }
  model.faces = model.faces.filter((f) => !ids.has(f.id)).concat(out);
  return new Set(out.map((f) => f.id));
}

// ---------- Bulatkan semua rusuk sebuah prisma (bentuk bantal) ----------
function prismInfo(model, f) {
  if (f.solid == null || f.holes.length) return null;
  const others = model.faces.filter((x) => x.solid === f.solid && x !== f);
  const n = V(f.n);
  const opp = others.find((x) => V(x.n).dot(n) < -0.9999 && x.pts.length === f.pts.length && !x.holes.length);
  if (!opp || others.length !== f.pts.length + 1) return null;
  const h = V(opp.pts[0]).sub(V(f.pts[0])).dot(n);
  const shift = n.clone().multiplyScalar(h);
  const oppKeys = new Set(opp.pts.map(key));
  if (!f.pts.every((p) => oppKeys.has(key(A(V(p).add(shift)))))) return null;
  return { h, n };
}

export function roundPrism(model, faceId, r, S = 6) {
  const f = model.faces.find((x) => x.id === faceId);
  if (!f) return false;
  const info = prismInfo(model, f);
  if (!info) return false;
  const { h, n } = info;
  const H = Math.abs(h);
  r = Math.min(r, H / 2 - 1e-4);
  if (!(r > 1e-4)) return false;
  const dirIn = n.clone().multiplyScalar(Math.sign(h));
  const B = filletLoop(f.pts, f.n, r * 1.5);
  const layers = [];
  for (let k = 0; k <= S; k++) {
    const a = ((Math.PI / 2) * k) / S;
    layers.push([r * (1 - Math.cos(a)), r * (1 - Math.sin(a))]);
  }
  for (let k = S; k >= 0; k--) {
    const a = ((Math.PI / 2) * k) / S;
    const z = H - r * (1 - Math.cos(a));
    if (z > layers[layers.length - 1][0] + 1e-6) layers.push([z, r * (1 - Math.sin(a))]);
  }
  const loops = [];
  for (const [z, inset] of layers) {
    const L = inset > 1e-9 ? offsetLoop(B, f.n, -inset) : B;
    if (!L) return false;
    loops.push(L.map((p) => A(V(p).addScaledVector(dirIn, z))));
  }
  const sid = model.nextId++;
  const props = { group: f.group ?? null, tex: f.tex ?? null, texScale: f.texScale, texScaleV: f.texScaleV, texRot: f.texRot };
  const out = [];
  const add = (pts, hint) => {
    const q = makeFace(model, pts, hint, f.color, sid);
    if (!q) return;
    Object.assign(q, props);
    if (f.tag != null) q.tag = f.tag;
    out.push(q);
  };
  const cen = B.reduce((s, p) => s.add(V(p)), new THREE.Vector3()).multiplyScalar(1 / B.length);
  add(loops[0], n.clone());
  add(loops[loops.length - 1], dirIn.clone());
  for (let k = 0; k < loops.length - 1; k++) {
    const A0 = loops[k], A1 = loops[k + 1], m = A0.length;
    for (let i = 0; i < m; i++) {
      const q = [A0[i], A0[(i + 1) % m], A1[(i + 1) % m], A1[i]];
      const qc = q.reduce((s, p) => s.add(V(p)), new THREE.Vector3()).multiplyScalar(0.25);
      const axisPt = cen.clone().addScaledVector(dirIn, qc.clone().sub(cen).dot(dirIn));
      add(q, qc.sub(axisPt));
    }
  }
  model.faces = model.faces.filter((x) => x.solid !== f.solid).concat(out);
  return true;
}

// ---------- Iris bidang dengan bidang-bidang tegak lurus sumbu (agar benda bisa dilentur/dipahat) ----------
function clipAxis(poly, axis, lo, hi) {
  const clip = (pts, keep, edge) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ia = keep(a[axis]), ib = keep(b[axis]);
      if (ia) out.push(a);
      if (ia !== ib) {
        const t = (edge - a[axis]) / (b[axis] - a[axis]);
        const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        q[axis] = edge;
        out.push(q);
      }
    }
    return out;
  };
  let r = poly;
  if (lo > -Infinity) r = clip(r, (x) => x >= lo - 1e-9, lo);
  if (r.length >= 3 && hi < Infinity) r = clip(r, (x) => x <= hi + 1e-9, hi);
  return r;
}

export function sliceFaces(model, ids, axis, cuts) {
  const bounds = [-Infinity, ...cuts.slice().sort((a, b) => a - b), Infinity];
  const out = [];
  const made = new Set();
  for (const f of model.faces) {
    if (!ids.has(f.id)) {
      out.push(f);
      continue;
    }
    const lo = Math.min(...f.pts.map((p) => p[axis])), hi = Math.max(...f.pts.map((p) => p[axis]));
    if (!cuts.some((c) => c > lo + 1e-6 && c < hi - 1e-6)) {
      out.push(f);
      made.add(f.id);
      continue;
    }
    let polys;
    if (f.holes.length) {
      const t = triangulateFace(f);
      polys = [];
      for (let i = 0; i < t.length; i += 3) polys.push([t[i], t[i + 1], t[i + 2]]);
    } else polys = [f.pts];
    for (const poly of polys) {
      for (let b = 0; b < bounds.length - 1; b++) {
        const piece = clipAxis(poly, axis, bounds[b], bounds[b + 1]);
        if (piece.length < 3) continue;
        const q = makeFace(model, piece, V(f.n), f.color, f.solid);
        if (!q) continue;
        q.n = f.n.slice();
        for (const k of ['group', 'tex', 'texScale', 'texScaleV', 'texRot', 'tag', 'soft', 'opacity', 'shiny', 'finish']) if (f[k] !== undefined) q[k] = f[k];
        out.push(q);
        made.add(q.id);
      }
    }
  }
  model.faces = out;
  return made;
}

// Perbanyak bidang tanpa mengubah bentuk: iris di ketiga sumbu dengan jarak 'step'.
export function tessellate(model, ids, step) {
  let cur = ids;
  const box = bboxOf(model, ids);
  for (let ax = 0; ax < 3; ax++) {
    const lo = box.min.getComponent(ax), hi = box.max.getComponent(ax);
    const n = Math.min(64, Math.floor((hi - lo) / step));
    const cuts = [];
    for (let i = 1; i <= n; i++) {
      const c = lo + (i * (hi - lo)) / (n + 1);
      if (c > lo + 1e-6 && c < hi - 1e-6) cuts.push(c);
    }
    if (cuts.length) cur = sliceFaces(model, cur, ax, cuts);
  }
  return cur;
}

// ---------- Deformasi: lentur, runcing, puntir ----------
// kind: 'bend' (amount = derajat), 'taper' (amount = skala ujung), 'twist' (amount = derajat).
export function deformAxis(model, ids, kind, axis, amount, bendDir = null, slices = 16) {
  const box = bboxOf(model, ids);
  if (box.isEmpty()) return ids;
  const L = box.max.getComponent(axis) - box.min.getComponent(axis);
  if (L < 1e-6) return ids;
  const lo = box.min.getComponent(axis);
  const c = box.getCenter(new THREE.Vector3());
  // iris agar lengkungan terlihat halus
  const cuts = [];
  for (let i = 1; i < slices; i++) cuts.push(lo + (L * i) / slices);
  const cur = kind === 'taper' ? ids : sliceFaces(model, ids, axis, cuts);
  const others = [0, 1, 2].filter((a) => a !== axis);
  const j = bendDir != null && bendDir !== axis ? bendDir : axis === 2 ? 0 : 2;
  const k = others.find((a) => a !== j);
  const C = [c.x, c.y, c.z];
  let fn;
  if (kind === 'taper') {
    fn = (p) => {
      const t = (p[axis] - lo) / L, s = 1 + (amount - 1) * t;
      const q = p.slice();
      for (const a of others) q[a] = C[a] + (p[a] - C[a]) * s;
      return q;
    };
  } else if (kind === 'twist') {
    fn = (p) => {
      const ang = ((amount * Math.PI) / 180) * ((p[axis] - lo) / L);
      const [a1, a2] = others, x = p[a1] - C[a1], y = p[a2] - C[a2];
      const q = p.slice();
      q[a1] = C[a1] + x * Math.cos(ang) - y * Math.sin(ang);
      q[a2] = C[a2] + x * Math.sin(ang) + y * Math.cos(ang);
      return q;
    };
  } else {
    const phi = (amount * Math.PI) / 180;
    if (Math.abs(phi) < 1e-6) return cur;
    const R = L / phi;
    fn = (p) => {
      const sA = p[axis] - lo, d = p[j] - C[j], a = (sA / L) * phi;
      const q = p.slice();
      q[axis] = lo + (R - d) * Math.sin(a);
      q[j] = C[j] + R - (R - d) * Math.cos(a);
      return q;
    };
  }
  deform(model, (f) => cur.has(f.id), fn);
  // bidang yang dipecah oleh deform punya id baru: kembalikan semua bidang hasil
  return cur;
}

// ---------- Potong bersilangan (Intersect Faces) ----------
// Interval parameter t pada garis o + t*d (dalam 2D bidang) yang berada di dalam poligon (dengan lubang).
function lineInside(o2, d2, loops2) {
  const ts = [];
  for (const L of loops2) {
    for (let i = 0; i < L.length; i++) {
      const a = L[i], b = L[(i + 1) % L.length];
      const ex = b.x - a.x, ey = b.y - a.y;
      const den = d2.x * ey - d2.y * ex;
      if (Math.abs(den) < 1e-12) continue;
      const wx = a.x - o2.x, wy = a.y - o2.y;
      const t = (wx * ey - wy * ex) / den;
      const u = (wx * d2.y - wy * d2.x) / den;
      if (u >= -1e-9 && u < 1 - 1e-9) ts.push(t);
    }
  }
  ts.sort((x, y) => x - y);
  const iv = [];
  for (let i = 0; i + 1 < ts.length; i += 2) if (ts[i + 1] - ts[i] > 1e-7) iv.push([ts[i], ts[i + 1]]);
  return iv;
}

export function intersectFaces(model, ids, grp = null) {
  const fs = model.faces.filter((f) => ids.has(f.id));
  const key2 = (f) => (f.solid != null ? 's' + f.solid : 'f' + f.id) + '|' + (f.group ?? '');
  const segs = [];
  const prep = new Map();
  const info = (f) => {
    if (!prep.has(f)) {
      const bs = basis(f.n), o = V(f.pts[0]);
      prep.set(f, { bs, o, N: V(f.n), loops: [f.pts, ...f.holes].map((l) => l.map((p) => to2D(p, o, bs))), box: new THREE.Box3().setFromPoints(f.pts.map(V)) });
    }
    return prep.get(f);
  };
  for (let i = 0; i < fs.length; i++) {
    for (let j = i + 1; j < fs.length; j++) {
      const A1 = fs[i], B1 = fs[j];
      if (key2(A1) === key2(B1)) continue;
      const ia = info(A1), ib = info(B1);
      if (!ia.box.clone().expandByScalar(1e-4).intersectsBox(ib.box)) continue;
      const dir = new THREE.Vector3().crossVectors(ia.N, ib.N);
      if (dir.length() < 1e-6) continue;
      dir.normalize();
      // titik pada kedua bidang
      const da = ia.N.dot(ia.o), db = ib.N.dot(ib.o);
      const n1n2 = ia.N.dot(ib.N);
      const det = 1 - n1n2 * n1n2;
      const c1 = (da - db * n1n2) / det, c2 = (db - da * n1n2) / det;
      const P0 = ia.N.clone().multiplyScalar(c1).addScaledVector(ib.N, c2);
      const ivs = [ia, ib].map((I) => {
        const o2 = to2D(A(P0), I.o, I.bs);
        const d2 = new THREE.Vector2(dir.dot(I.bs.u), dir.dot(I.bs.v));
        return lineInside(o2, d2, I.loops);
      });
      for (const [a0, a1] of ivs[0]) {
        for (const [b0, b1] of ivs[1]) {
          const t0 = Math.max(a0, b0), t1 = Math.min(a1, b1);
          if (t1 - t0 > 1e-5) segs.push([A(P0.clone().addScaledVector(dir, t0)), A(P0.clone().addScaledVector(dir, t1))]);
        }
      }
    }
  }
  let n = 0;
  for (const [a, b] of segs) {
    if (key(a) === key(b)) continue;
    const r = addLine(model, a, b, grp);
    if (r) n++;
  }
  return n;
}

// ---------- Potong sudut (chamfer) ----------
export function chamferLoop(pts, d) {
  if (!(d > 0) || pts.length < 3) return pts.slice();
  const N = pts.length, out = [];
  for (let i = 0; i < N; i++) {
    const a = V(pts[(i + N - 1) % N]), b = V(pts[i]), c = V(pts[(i + 1) % N]);
    const la = a.distanceTo(b), lc = c.distanceTo(b);
    const u1 = a.clone().sub(b).normalize(), u2 = c.clone().sub(b).normalize();
    if (Math.abs(u1.dot(u2)) > 0.9999) {
      out.push(A(b));
      continue;
    }
    const t = Math.min(d, la * 0.5, lc * 0.5);
    out.push(A(b.clone().addScaledVector(u1, t)), A(b.clone().addScaledVector(u2, t)));
  }
  const res = [];
  for (const p of out) if (!res.length || key(res[res.length - 1]) !== key(p)) res.push(p);
  if (res.length > 1 && key(res[0]) === key(res[res.length - 1])) res.pop();
  return res;
}

// ---------- Dinding dari polyline denah ----------
// pts: titik-titik di lantai (z sama), closed: ruang tertutup. Mengembalikan id bidang alas.
export function wallFootprint(pts, t, closed) {
  const P = pts.map(V);
  const z = P[0].z;
  const n = P.length;
  if (closed) {
    const loop = P.map(A);
    const nn = newellNormal(loop);
    const up = nn.z >= 0 ? [0, 0, 1] : [0, 0, -1];
    const outer = offsetLoop(loop, up, t / 2), inner = offsetLoop(loop, up, -t / 2);
    if (!outer || !inner) return null;
    return { pts: outer, holes: [inner] };
  }
  // polyline terbuka: sisi kiri & kanan dengan sambungan miring
  const left = [], right = [];
  const off = (i, side) => {
    const prev = i > 0 ? P[i].clone().sub(P[i - 1]).setZ(0).normalize() : null;
    const next = i < n - 1 ? P[i + 1].clone().sub(P[i]).setZ(0).normalize() : null;
    const perp = (d) => new THREE.Vector3(-d.y, d.x, 0);
    let m;
    if (prev && next) {
      const mp = perp(prev).add(perp(next));
      const len = mp.length();
      m = len < 1e-6 ? perp(next) : mp.divideScalar(len);
      const cos = m.dot(perp(next));
      m.multiplyScalar(1 / Math.max(0.2, cos));
    } else m = perp(prev || next);
    return P[i].clone().addScaledVector(m, (side * t) / 2);
  };
  for (let i = 0; i < n; i++) {
    left.push(off(i, 1));
    right.push(off(i, -1));
  }
  const loop = [...left, ...right.reverse()].map((v) => [v.x, v.y, z]);
  return { pts: loop, holes: [] };
}

// ---------- Atap pelana di atas kotak pembatas ----------
export function gableRoof(model, box, pitchDeg, overhang, color, grp = null) {
  const x0 = box.min.x - overhang, x1 = box.max.x + overhang, y0 = box.min.y - overhang, y1 = box.max.y + overhang, z = box.max.z;
  const alongX = x1 - x0 >= y1 - y0;
  const span = alongX ? y1 - y0 : x1 - x0;
  const h = (span / 2) * Math.tan((pitchDeg * Math.PI) / 180);
  let tri, len, dirHint;
  if (alongX) {
    const ym = (y0 + y1) / 2;
    tri = [[x0, y0, z], [x0, y1, z], [x0, ym, z + h]];
    len = x1 - x0;
    dirHint = new THREE.Vector3(-1, 0, 0);
  } else {
    const xm = (x0 + x1) / 2;
    tri = [[x0, y0, z], [x1, y0, z], [xm, y0, z + h]];
    len = y1 - y0;
    dirHint = new THREE.Vector3(0, -1, 0);
  }
  const f = makeFace(model, tri, dirHint, color);
  if (!f) return null;
  f.group = grp;
  model.faces.push(f);
  pushPull(model, f.id, -len);
  return f.solid;
}
