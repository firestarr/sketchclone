// Kerapian model: ratakan & sebar rata (Align / Distribute) dan Bersihkan Model (Purge + pemeriksa benda solid).
// Murni data (tanpa DOM) agar bisa diuji di Node.
import * as THREE from 'three';
import * as G from './geometry.js';

const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
const gOf = (e) => e.group ?? null;

// ---------- Ratakan & sebar ----------
// units: [Set id] — tiap unit (grup teratas atau kumpulan geometri lepas) bergerak utuh.
// mode: 'min' | 'mid' | 'max' (ratakan) atau 'spread' (sebar dengan jarak antar-benda sama).
// Mengembalikan jumlah unit yang dipindah.
export function alignUnits(model, units, axis, mode) {
  const ax = ['x', 'y', 'z'][axis];
  const boxes = units.map((ids) => G.bboxOf(model, ids));
  const items = units.map((ids, i) => ({ ids, box: boxes[i] })).filter((u) => !u.box.isEmpty());
  if (items.length < (mode === 'spread' ? 3 : 2)) return 0;
  const all = new THREE.Box3();
  items.forEach((u) => all.union(u.box));
  const shift = (u, d) => {
    if (Math.abs(d) < 1e-9) return 0;
    const v = new THREE.Vector3();
    v[ax] = d;
    G.translate(model, u.ids, v);
    return 1;
  };
  let n = 0;
  if (mode === 'spread') {
    items.sort((a, b) => a.box.min[ax] + a.box.max[ax] - b.box.min[ax] - b.box.max[ax]);
    const size = items.reduce((t, u) => t + u.box.max[ax] - u.box.min[ax], 0);
    const gap = (all.max[ax] - all.min[ax] - size) / (items.length - 1);
    let at = all.min[ax];
    for (const u of items) {
      n += shift(u, at - u.box.min[ax]);
      at += u.box.max[ax] - u.box.min[ax] + gap;
    }
    return n;
  }
  const ref = mode === 'min' ? all.min[ax] : mode === 'max' ? all.max[ax] : (all.min[ax] + all.max[ax]) / 2;
  for (const u of items) {
    const cur = mode === 'min' ? u.box.min[ax] : mode === 'max' ? u.box.max[ax] : (u.box.min[ax] + u.box.max[ax]) / 2;
    n += shift(u, ref - cur);
  }
  return n;
}

// ---------- Bersihkan model ----------
const loopsOf = (f) => [f.pts, ...(f.holes || [])];
const sigOf = (pts) => pts.map(G.key).sort().join('|');

// Rusuk benda solid dihitung per pasangan titik; rusuk tertutup rapat dipakai tepat dua bidang dengan arah berlawanan.
// Rusuk yang tampak terbuka dipecah lagi pada titik rusuk terbuka lain yang terletak di tengahnya (T-junction).
function solidEdges(faces) {
  const out = new Map(); // kunci tak berarah -> [{ f, dir }]
  const add = (f, a, b) => {
    const ka = G.key(a), kb = G.key(b);
    if (ka === kb) return;
    const k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
    let arr = out.get(k);
    if (!arr) out.set(k, (arr = []));
    arr.push({ f, dir: ka < kb ? 1 : -1, a, b });
  };
  for (const f of faces) for (const L of loopsOf(f)) for (let i = 0; i < L.length; i++) add(f, L[i], L[(i + 1) % L.length]);
  const open = [...out].filter(([, arr]) => arr.length === 1);
  if (!open.length || open.length > 20000) return out;
  const cand = new Map();
  for (const [, [e]] of open) cand.set(G.key(e.a), e.a), cand.set(G.key(e.b), e.b);
  const pts = [...cand.values()];
  for (const [k, [e]] of open) {
    const A = V(e.a), u = V(e.b).sub(A), len2 = u.lengthSq(), mid = [];
    for (const p of pts) {
      const t = V(p).sub(A).dot(u) / len2;
      if (t <= 1e-6 || t >= 1 - 1e-6) continue;
      if (A.clone().addScaledVector(u, t).distanceToSquared(V(p)) < 1e-12) mid.push([t, p]);
    }
    if (!mid.length) continue;
    out.delete(k);
    const chain = [e.a, ...mid.sort((x, y) => x[0] - y[0]).map((x) => x[1]), e.b];
    for (let j = 0; j + 1 < chain.length; j++) add(e.f, chain[j], chain[j + 1]);
  }
  return out;
}

// Volume bertanda menurut urutan titik bidang (Newell): positif bila bidang menghadap keluar.
const volTerm = (f) => V(f.pts[0]).dot(G.newellNormal(f.pts)) / 6;

// Seragamkan arah bidang dalam satu benda tertutup (BFS lewat rusuk bersama), lalu pastikan menghadap keluar.
// Mengembalikan Set id bidang yang perlu dibalik.
function orientFix(faces, edges) {
  const adj = new Map(faces.map((f) => [f, []]));
  for (const arr of edges.values()) {
    if (arr.length !== 2 || arr[0].f === arr[1].f) continue;
    const [p, q] = arr;
    const same = p.dir === q.dir; // arah sama pada rusuk bersama = salah satu bidang terbalik
    adj.get(p.f).push([q.f, same]);
    adj.get(q.f).push([p.f, same]);
  }
  const flip = new Map();
  for (const seed of faces) {
    if (flip.has(seed)) continue;
    flip.set(seed, false);
    const queue = [seed];
    while (queue.length) {
      const f = queue.pop();
      for (const [g, same] of adj.get(f)) {
        if (flip.has(g)) continue;
        flip.set(g, flip.get(f) !== same);
        queue.push(g);
      }
    }
  }
  const out = new Set();
  for (const [f, fl] of flip) if (fl) out.add(f.id);
  // setelah seragam, volume bertanda negatif berarti semua menghadap ke dalam
  const v = faces.reduce((t, f) => t + (out.has(f.id) ? -1 : 1) * volTerm(f), 0);
  if (v < 0) for (const f of faces) out.has(f.id) ? out.delete(f.id) : out.add(f.id);
  return out;
}

// Rapikan titik yang hampir berimpit (selisih < tol) menjadi satu titik.
function weldPoints(model, tol) {
  const cell = tol * 4, grid = new Map(), reps = [];
  const ck = (p) => p.map((x) => Math.floor(x / cell));
  let moved = 0;
  const snap = (p) => {
    const c = ck(p);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const arr = grid.get(c[0] + dx + ',' + (c[1] + dy) + ',' + (c[2] + dz));
          if (!arr) continue;
          for (const r of arr) {
            const d = Math.hypot(r[0] - p[0], r[1] - p[1], r[2] - p[2]);
            if (d < tol) {
              if (d > 0) {
                moved++;
                p[0] = r[0], p[1] = r[1], p[2] = r[2];
              }
              return;
            }
          }
        }
    const k = c.join(',');
    const r = [p[0], p[1], p[2]];
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(r);
    reps.push(r);
  };
  for (const f of model.faces) for (const L of loopsOf(f)) L.forEach(snap);
  for (const l of model.lines) snap(l.a), snap(l.b);
  return moved;
}

// Laporan tanpa mengubah model.
// opts.levelTags: id tag yang dipakai lantai (tidak dihapus), opts.textures: Map tekstur pengguna, opts.weldTol (m)
export function analyzeModel(model, opts = {}) {
  const tol = opts.weldTol ?? 2e-4;
  const r = { unusedTags: [], unusedTextures: [], shortLines: [], dupLines: [], badFaces: [], dupFaces: [], nearPoints: 0, openSolids: [], flipFaces: new Set(), flippedSolids: 0 };
  // tag tak terpakai
  const usedTags = new Set(opts.levelTags || []);
  for (const e of [...model.faces, ...model.lines, ...(model.guides || []), ...Object.values(model.groups)]) if (e.tag != null) usedTags.add(e.tag);
  r.unusedTags = (model.tags || []).filter((t) => !usedTags.has(t.id)).map((t) => t.id);
  // tekstur impor yang tidak dipakai bidang mana pun
  if (opts.textures) {
    const used = new Set(model.faces.map((f) => f.tex).filter(Boolean));
    for (const [id, t] of opts.textures) if (!t.builtin && String(id).startsWith('u:') && !used.has(id)) r.unusedTextures.push(id);
  }
  // garis sangat pendek & garis kembar
  const seenL = new Set();
  for (const l of model.lines) {
    if (Math.hypot(l.a[0] - l.b[0], l.a[1] - l.b[1], l.a[2] - l.b[2]) < 5e-4) {
      r.shortLines.push(l.id);
      continue;
    }
    const ka = G.key(l.a), kb = G.key(l.b);
    const k = gOf(l) + '#' + (ka < kb ? ka + '|' + kb : kb + '|' + ka);
    if (seenL.has(k)) r.dupLines.push(l.id);
    else seenL.add(k);
  }
  // bidang rusak (luas ~0, titik tidak valid) & bidang kembar
  const seenF = new Set();
  for (const f of model.faces) {
    const bad = f.pts.length < 3 || f.pts.some((p) => p.some((x) => !Number.isFinite(x))) || !(G.faceArea(f) > 1e-8);
    if (bad) {
      r.badFaces.push(f.id);
      continue;
    }
    const k = gOf(f) + '#' + (f.solid ?? '') + '#' + sigOf(f.pts);
    if (seenF.has(k)) r.dupFaces.push(f.id);
    else seenF.add(k);
  }
  // titik hampir berimpit (diuji pada salinan)
  r.nearPoints = weldPoints(structuredClone({ faces: model.faces.map((f) => ({ pts: f.pts, holes: f.holes })), lines: model.lines.map((l) => ({ a: l.a, b: l.b })) }), tol);
  // benda solid: rusuk terbuka & arah bidang
  const skip = new Set([...r.badFaces, ...r.dupFaces]);
  const bySolid = new Map();
  for (const f of model.faces) {
    if (f.solid == null || skip.has(f.id)) continue;
    const k = gOf(f) + '#' + f.solid;
    if (!bySolid.has(k)) bySolid.set(k, []);
    bySolid.get(k).push(f);
  }
  for (const faces of bySolid.values()) {
    if (faces.length < 4) continue;
    const edges = solidEdges(faces);
    let open = 0;
    for (const arr of edges.values()) if (arr.length === 1) open++;
    if (open) {
      r.openSolids.push({ ids: faces.map((f) => f.id), open, name: opts.nameOf ? opts.nameOf(faces[0]) : null });
      continue;
    }
    const fl = orientFix(faces, edges);
    if (fl.size) {
      r.flippedSolids++;
      fl.forEach((id) => r.flipFaces.add(id));
    }
  }
  return r;
}

// Terapkan perbaikan yang dipilih. fix: { tags, textures, lines, faces, weld, normals } (boolean)
// Mengembalikan ringkasan jumlah yang dibersihkan.
export function cleanModel(model, rep, fix, opts = {}) {
  const done = { tags: 0, textures: 0, lines: 0, faces: 0, weld: 0, normals: 0 };
  if (fix.normals && rep.flipFaces.size) {
    G.reverseFaces(model, rep.flipFaces);
    done.normals = rep.flipFaces.size;
  }
  const del = new Set();
  if (fix.lines) [...rep.shortLines, ...rep.dupLines].forEach((i) => del.add(i));
  if (fix.faces) [...rep.badFaces, ...rep.dupFaces].forEach((i) => del.add(i));
  if (del.size) {
    done.lines = model.lines.filter((l) => del.has(l.id)).length;
    done.faces = model.faces.filter((f) => del.has(f.id)).length;
    G.deleteIds(model, del);
  }
  if (fix.weld && rep.nearPoints) {
    done.weld = weldPoints(model, opts.weldTol ?? 2e-4);
    // titik yang menyatu dalam satu loop: buang yang berulang; bidang yang tinggal < 3 titik dihapus
    const dedupe = (L) => L.filter((p, i) => G.key(p) !== G.key(L[(i + 1) % L.length]));
    const gone = new Set();
    for (const f of model.faces) {
      f.pts = dedupe(f.pts);
      f.holes = (f.holes || []).map(dedupe).filter((h) => h.length >= 3);
      if (f.pts.length < 3) gone.add(f.id);
    }
    for (const l of model.lines) if (G.key(l.a) === G.key(l.b)) gone.add(l.id);
    if (gone.size) G.deleteIds(model, gone);
  }
  if (fix.tags && rep.unusedTags.length) {
    const ids = new Set(rep.unusedTags);
    model.tags = model.tags.filter((t) => !ids.has(t.id));
    done.tags = ids.size;
  }
  if (fix.textures && opts.textures) for (const id of rep.unusedTextures) opts.textures.delete(id) && done.textures++;
  return done;
}

// Volume (m³) kumpulan bidang bila semuanya membentuk benda tertutup rapat; null bila masih ada rusuk terbuka.
export function closedVolume(faces) {
  if (!faces.length || faces.length > 60000) return null;
  for (const arr of solidEdges(faces).values()) if (arr.length === 1) return null;
  let v = 0; // segitiga mengikuti arah normal bidang, jadi lubang (jendela di dinding) ikut dihitung benar
  for (const f of faces) {
    const t = G.triangulateFace(f);
    for (let i = 0; i + 2 < t.length; i += 3) v += V(t[i]).dot(V(t[i + 1]).cross(V(t[i + 2])));
  }
  return Math.abs(v / 6);
}
