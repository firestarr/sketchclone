// Fitur produksi non-bangunan: mebel (daftar potong + optimasi lembar), cetak 3D, pola datar (laser cut / kemasan).
import * as THREE from 'three';
import * as G from './geometry.js';
import { isClosedSolid } from './csg.js';

const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
const UP = new THREE.Vector3(0, 0, 1);
const solidsOf = (model, vis) => {
  const m = new Map();
  for (const f of model.faces) {
    if (f.solid == null || (vis && !vis(f))) continue;
    if (!m.has(f.solid)) m.set(f.solid, []);
    m.get(f.solid).push(f);
  }
  return m;
};

// ======================= MEBEL =======================
// Panel = solid berbentuk balok (3 arah normal saling tegak lurus). dims: [panjang, lebar, tebal] dalam meter.
export function panelInfo(faces) {
  const dirs = [];
  for (const f of faces) {
    const n = V(f.n);
    if (!dirs.some((d) => Math.abs(d.dot(n)) > 0.999)) dirs.push(n);
    if (dirs.length > 3) return null;
  }
  if (dirs.length !== 3) return null;
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (Math.abs(dirs[i].dot(dirs[j])) > 1e-3) return null;
  const pts = faces.flatMap((f) => f.pts.map(V));
  const ext = dirs.map((d) => {
    const s = pts.map((p) => p.dot(d));
    return Math.max(...s) - Math.min(...s);
  });
  // volume harus sama dengan balok pembatas (bukan bentuk L / berlubang)
  const area = faces.reduce((a, f) => a + G.faceArea(f), 0);
  const [a, b, c] = ext;
  if (Math.abs(area - 2 * (a * b + b * c + a * c)) > 1e-4 * Math.max(1, area)) return null;
  const order = [0, 1, 2].sort((i, j) => ext[j] - ext[i]);
  return { dims: order.map((i) => ext[i]), axes: order.map((i) => dirs[i]), color: faces[0].color };
}

export const BOARDS = {
  mpx18: { name: 'Multipleks 18 mm', t: 0.018, w: 2.44, h: 1.22, price: 0 },
  mpx15: { name: 'Multipleks 15 mm', t: 0.015, w: 2.44, h: 1.22, price: 0 },
  hdf3: { name: 'HDF 3 mm (panel belakang)', t: 0.003, w: 2.44, h: 1.22, price: 0 },
};

// Daftar potong: kelompokkan panel identik (ukuran mm + tebal + warna).
export function cutList(model, vis = null, nameOf = null) {
  const rows = [];
  const others = [];
  for (const [sid, faces] of solidsOf(model, vis)) {
    const pi = panelInfo(faces);
    if (!pi || pi.dims[2] > 0.04) { others.push(sid); continue; }
    const mm = pi.dims.map((x) => Math.round(x * 1000));
    const name = (nameOf && nameOf(faces[0])) || 'Panel';
    const key = `${mm.join('x')}|${pi.color}|${name}`;
    let r = rows.find((x) => x.key === key);
    if (!r) rows.push((r = { key, name, L: mm[0], W: mm[1], T: mm[2], color: pi.color, qty: 0, sids: [] }));
    r.qty++;
    r.sids.push(sid);
  }
  rows.sort((a, b) => b.T - a.T || b.L * b.W - a.L * a.W);
  rows.forEach((r, i) => (r.code = 'K' + (i + 1)));
  return { rows, others };
}

// Optimasi lembar: guillotine (potong lurus ujung ke ujung, cocok untuk gergaji panel).
export function nest(parts, sheetW, sheetH, kerf = 3, rotate = true) {
  const items = [];
  for (const p of parts) for (let i = 0; i < p.qty; i++) items.push({ w: p.L, h: p.W, label: p.code, code: p.code });
  items.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h);
  const sheets = [];
  const tooBig = [];
  const place = (sheet, it) => {
    // pilih ruang bebas dengan sisa terkecil (best area fit)
    let best = null;
    for (const fr of sheet.free) {
      for (const rot of rotate ? [false, true] : [false]) {
        const w = rot ? it.h : it.w, h = rot ? it.w : it.h;
        if (w <= fr.w + 1e-6 && h <= fr.h + 1e-6) {
          const waste = fr.w * fr.h - w * h;
          if (!best || waste < best.waste) best = { fr, w, h, rot, waste };
        }
      }
    }
    if (!best) return false;
    const { fr, w, h } = best;
    sheet.parts.push({ x: fr.x, y: fr.y, w, h, label: it.label, rot: best.rot });
    sheet.free.splice(sheet.free.indexOf(fr), 1);
    // belah sisa: sepanjang sisi yang lebih panjang
    const rw = fr.w - w - kerf, rh = fr.h - h - kerf;
    if (rw * fr.h > fr.w * rh) {
      if (rw > 0) sheet.free.push({ x: fr.x + w + kerf, y: fr.y, w: rw, h: fr.h });
      if (rh > 0) sheet.free.push({ x: fr.x, y: fr.y + h + kerf, w, h: rh });
    } else {
      if (rh > 0) sheet.free.push({ x: fr.x, y: fr.y + h + kerf, w: fr.w, h: rh });
      if (rw > 0) sheet.free.push({ x: fr.x + w + kerf, y: fr.y, w: rw, h });
    }
    return true;
  };
  for (const it of items) {
    if (!((it.w <= sheetW && it.h <= sheetH) || (rotate && it.h <= sheetW && it.w <= sheetH))) { tooBig.push(it); continue; }
    if (!sheets.some((s) => place(s, it))) {
      const s = { parts: [], free: [{ x: 0, y: 0, w: sheetW, h: sheetH }] };
      sheets.push(s);
      place(s, it);
    }
  }
  for (const s of sheets) s.used = s.parts.reduce((a, p) => a + p.w * p.h, 0) / (sheetW * sheetH);
  return { sheets, tooBig, sheetW, sheetH };
}

// Kabinet / lemari parametrik dari panel. Lokal: lebar X, dalam Y (depan di y=0), tinggi Z, alas di z=0.
export function buildCabinet(m, o) {
  const t = o.t || 0.018, tb = 0.003, W = o.w, D = o.d, H = o.h, start = m.nextId;
  const parts = [];
  const box = (name, x, y, z, w, d, h, color) => {
    const f = G.makeFace(m, [[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]], UP, color);
    m.faces.push(f);
    G.pushPull(m, f.id, h);
    for (const q of m.faces) if (q.solid === f.solid) q.pname = name;
    parts.push({ name, sid: f.solid });
  };
  const body = o.color || '#d9c4a3', front = o.front || '#b98c5f';
  const plinth = o.plinth ?? 0.08;
  box('Samping', 0, 0, 0, t, D, H, body);
  box('Samping', W - t, 0, 0, t, D, H, body);
  box('Atas', t, 0, H - t, W - 2 * t, D, t, body);
  box('Alas', t, 0, plinth, W - 2 * t, D, t, body);
  if (plinth > 0) box('Plint', t, 0.02, 0, W - 2 * t, t, plinth, body);
  box('Belakang', t, D - tb, plinth + t, W - 2 * t, tb, H - plinth - 2 * t, '#efe6d6');
  const inner = H - plinth - 2 * t, n = Math.max(0, o.shelves | 0);
  for (let i = 1; i <= n; i++) box('Rak', t, 0.02, plinth + t + (inner * i) / (n + 1) - t / 2, W - 2 * t, D - 0.02 - tb - 0.005, t, body);
  const doors = Math.max(0, o.doors | 0);
  let hinges = 0;
  if (doors) {
    const gap = 0.003, dw = (W - gap * (doors + 1)) / doors, dh = H - plinth - gap * 2;
    for (let i = 0; i < doors; i++) box('Pintu', gap + i * (dw + gap), -t, plinth + gap, dw, t, dh, front);
    hinges = doors * (dh > 1.5 ? 4 : dh > 0.9 ? 3 : 2);
  }
  const ids = new Set(m.faces.filter((f) => f.id >= start).map((f) => f.id));
  return { ids, parts, hardware: { engsel: hinges, handle: doors, sekrup: 8 * 4 + n * 4 + hinges * 4, dowel: n * 4 } };
}

// ======================= CETAK 3D =======================
export const FILAMENTS = { PLA: 1.24, PETG: 1.27, ABS: 1.04, TPU: 1.21, Resin: 1.12 };
export function printAnalysis(model, sids, o = {}) {
  const k = (o.scale || 1) * 1000; // meter model -> mm cetak
  const shell = o.shell ?? 0.8, infill = (o.infill ?? 20) / 100, dens = FILAMENTS[o.material || 'PLA'] || 1.24;
  const issues = [];
  let vol = 0, area = 0;
  const box = new THREE.Box3();
  for (const sid of sids) {
    const faces = model.faces.filter((f) => f.solid === sid);
    let v = 0;
    for (const f of faces) {
      area += G.faceArea(f) * k * k;
      f.pts.forEach((p) => box.expandByPoint(V(p).multiplyScalar(k)));
      const t = G.triangulateFace(f);
      for (let i = 0; i < t.length; i += 3) {
        const a = V(t[i]), b = V(t[i + 1]), c = V(t[i + 2]);
        v += a.dot(b.clone().cross(c)) / 6;
      }
    }
    if (!isClosedSolid(model, sid)) issues.push({ sid, msg: 'Benda tidak tertutup rapat (ada celah) — printer bisa gagal' });
    if (v < 0) issues.push({ sid, msg: 'Normal terbalik (bagian dalam menghadap keluar) — pakai Balik Bidang' });
    vol += Math.abs(v) * k * k * k;
  }
  const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
  const minDim = Math.min(size.x, size.y, size.z);
  if (minDim > 0 && minDim < 1) issues.push({ msg: `Bagian tertipis ${minDim.toFixed(2)} mm — terlalu tipis untuk dicetak (min ± 1 mm)` });
  const bed = o.bed || [220, 220, 250];
  if (size.x > bed[0] || size.y > bed[1] || size.z > bed[2]) issues.push({ msg: `Ukuran ${size.x.toFixed(0)}×${size.y.toFixed(0)}×${size.z.toFixed(0)} mm melebihi area cetak ${bed.join('×')} mm — perkecil skala atau potong model` });
  // massa: dinding luar (luas × tebal shell) + isian dalam
  const shellVol = Math.min(vol, area * shell);
  const printed = shellVol + (vol - shellVol) * infill; // mm³
  const grams = (printed / 1000) * dens;
  const hours = printed / (o.flow || 8) / 3600; // laju ekstrusi mm³/detik
  const cost = (grams / 1000) * (o.pricePerKg ?? 0);
  return { size: [size.x, size.y, size.z], volume: vol / 1000, area: area / 100, grams, hours, cost, issues };
}
// 3MF (format cetak 3D modern; satuan mm)
export function export3MF(model, sids, scale = 1) {
  const k = scale * 1000;
  const objs = [];
  let id = 1;
  for (const sid of sids) {
    const verts = [], idx = new Map(), tris = [];
    const vi = (p) => {
      const key = p.map((x) => (x * k).toFixed(4)).join(',');
      if (!idx.has(key)) { idx.set(key, verts.length); verts.push(p.map((x) => x * k)); }
      return idx.get(key);
    };
    for (const f of model.faces.filter((q) => q.solid === sid)) {
      const t = G.triangulateFace(f);
      for (let i = 0; i < t.length; i += 3) tris.push([vi(t[i]), vi(t[i + 1]), vi(t[i + 2])]);
    }
    objs.push(`<object id="${id}" type="model"><mesh><vertices>${verts.map((v) => `<vertex x="${v[0].toFixed(4)}" y="${v[1].toFixed(4)}" z="${v[2].toFixed(4)}"/>`).join('')}</vertices><triangles>${tris.map((t) => `<triangle v1="${t[0]}" v2="${t[1]}" v3="${t[2]}"/>`).join('')}</triangles></mesh></object>`);
    id++;
  }
  const modelXml = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${objs.join('')}</resources><build>${objs.map((_, i) => `<item objectid="${i + 1}"/>`).join('')}</build></model>`;
  return {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`,
    '3D/3dmodel.model': modelXml,
  };
}

// ======================= POLA DATAR (laser cut / kemasan) =======================
const keyOf = (p) => p.map((x) => Math.round(x * 1e5)).join(',');
// Buka solid jadi jaring-jaring 2D. Hasil: pieces[{ polys:[{pts2:[[x,y]], faceId}], cut:[[a,b]], fold:[[a,b]], tabs:[[...]] }] dalam meter.
export function unfold(model, sid, o = {}) {
  const faces = model.faces.filter((f) => f.solid === sid && !f.holes.length);
  if (!faces.length) return null;
  // tepi bersama antar bidang
  const edgeMap = new Map();
  for (const f of faces) {
    f.pts.forEach((p, i) => {
      const q = f.pts[(i + 1) % f.pts.length];
      const k = [keyOf(p), keyOf(q)].sort().join('|');
      if (!edgeMap.has(k)) edgeMap.set(k, []);
      edgeMap.get(k).push({ f, i });
    });
  }
  const placed = new Map(); // faceId -> pts2
  const pieces = [];
  const overlaps = (poly, piece) => piece.polys.some((q) => polysOverlap(poly, q.pts2));
  const order = faces.slice().sort((a, b) => G.faceArea(b) - G.faceArea(a));
  for (const root of order) {
    if (placed.has(root.id)) continue;
    const bs = G.basis(root.n), o0 = V(root.pts[0]);
    const pts2 = root.pts.map((p) => { const v = G.to2D(p, o0, bs); return [v.x, v.y]; });
    const piece = { polys: [{ pts2, face: root }], folds: new Set() };
    pieces.push(piece);
    placed.set(root.id, pts2);
    const queue = [root];
    while (queue.length) {
      const f = queue.shift();
      const fp = placed.get(f.id);
      f.pts.forEach((p, i) => {
        const q = f.pts[(i + 1) % f.pts.length];
        const k = [keyOf(p), keyOf(q)].sort().join('|');
        for (const { f: g, i: j } of edgeMap.get(k)) {
          if (g === f || placed.has(g.id)) continue;
          // pasang g sehingga tepi bersamanya menempel pada tepi f yang sudah diletakkan
          const A2 = fp[i], B2 = fp[(i + 1) % fp.length];
          const gb = G.basis(g.n), go = V(g.pts[0]);
          const g2 = g.pts.map((pp) => { const v = G.to2D(pp, go, gb); return [v.x, v.y]; });
          // di g, tepi yang sama berjalan terbalik: g.pts[j] = q, g.pts[j+1] = p
          const ga = g2[(j + 1) % g2.length], gbb = g2[j];
          const ang = Math.atan2(B2[1] - A2[1], B2[0] - A2[0]) - Math.atan2(gbb[1] - ga[1], gbb[0] - ga[0]);
          const c = Math.cos(ang), s = Math.sin(ang);
          const tr = (pt) => {
            const x = pt[0] - ga[0], y = pt[1] - ga[1];
            return [A2[0] + c * x - s * y, A2[1] + s * x + c * y];
          };
          const gp = g2.map(tr);
          if (overlaps(gp, piece)) continue;
          placed.set(g.id, gp);
          piece.polys.push({ pts2: gp, face: g });
          piece.folds.add(k);
          queue.push(g);
        }
      });
    }
  }
  // klasifikasi tepi tiap potongan: lipat (di dalam jaring) atau potong (batas luar) + lidah lem
  const tab = o.tab ?? 0.008;
  const tabbed = new Set();
  for (const pc of pieces) {
    pc.cut = [];
    pc.fold = [];
    pc.tabs = [];
    const seenFold = new Set();
    for (const { pts2, face } of pc.polys) {
      face.pts.forEach((p, i) => {
        const q = face.pts[(i + 1) % face.pts.length];
        const k = [keyOf(p), keyOf(q)].sort().join('|');
        const a = pts2[i], b = pts2[(i + 1) % pts2.length];
        if (pc.folds.has(k)) {
          if (!seenFold.has(k)) { seenFold.add(k); pc.fold.push([a, b]); }
          return;
        }
        // tepi potong yang nanti harus dilem ke tepi lain -> beri lidah di salah satu sisi
        const shared = edgeMap.get(k).length > 1;
        if (shared && tab > 0 && !tabbed.has(k)) {
          tabbed.add(k);
          const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
          // normal ke luar poligon (poligon CCW -> kanan dari arah tepi)
          const nx = dy / L, ny = -dx / L, ins = Math.min(tab, L / 3);
          const t1 = [a[0] + nx * tab + (dx / L) * ins, a[1] + ny * tab + (dy / L) * ins];
          const t2 = [b[0] + nx * tab - (dx / L) * ins, b[1] + ny * tab - (dy / L) * ins];
          pc.tabs.push([a, t1, t2, b]);
          pc.fold.push([a, b]);
        } else pc.cut.push([a, b]);
      });
    }
    for (const t of pc.tabs) for (let i = 0; i < 3; i++) pc.cut.push([t[i], t[i + 1]]);
    const all = [...pc.cut, ...pc.fold].flat();
    pc.min = [Math.min(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1]))];
    pc.max = [Math.max(...all.map((p) => p[0])), Math.max(...all.map((p) => p[1]))];
  }
  return { pieces, faces: faces.length, placed: placed.size };
}
function polysOverlap(a, b) {
  // uji sumbu pemisah untuk poligon cembung; sedikit toleransi agar tepi yang bersentuhan tidak dihitung
  const axes = (P) => P.map((p, i) => { const q = P[(i + 1) % P.length]; return [-(q[1] - p[1]), q[0] - p[0]]; });
  for (const [ax, ay] of [...axes(a), ...axes(b)]) {
    const L = Math.hypot(ax, ay) || 1;
    const pr = (P) => P.map((p) => (p[0] * ax + p[1] * ay) / L);
    const pa = pr(a), pb = pr(b);
    if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return false;
  }
  return true;
}
// Susun potongan berdampingan lalu buat SVG (mm) dengan garis potong (merah) dan garis lipat (biru putus-putus).
export function netLayout(pieces, gap = 0.01) {
  let x = 0;
  const out = [];
  for (const pc of pieces) {
    const dx = x - pc.min[0], dy = -pc.min[1];
    const mv = (p) => [p[0] + dx, p[1] + dy];
    out.push({ cut: pc.cut.map((s) => s.map(mv)), fold: pc.fold.map((s) => s.map(mv)) });
    x += pc.max[0] - pc.min[0] + gap;
  }
  const W = Math.max(0, x - gap), H = Math.max(0, ...pieces.map((p) => p.max[1] - p.min[1]));
  return { items: out, W, H };
}
export function netSvg(layout, scale = 1, opt = {}) {
  const k = scale * 1000, m = 5; // mm, margin 5 mm
  const W = layout.W * k + 2 * m, H = layout.H * k + 2 * m;
  const P = (p) => `${(p[0] * k + m).toFixed(3)},${(H - (p[1] * k + m)).toFixed(3)}`; // sumbu Y SVG ke bawah
  const ln = (s, cls) => `<polyline class="${cls}" points="${s.map(P).join(' ')}"/>`;
  const body = layout.items.map((it) => it.cut.map((s) => ln(s, 'cut')).join('') + it.fold.map((s) => ln(s, 'fold')).join('')).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(2)}mm" height="${H.toFixed(2)}mm" viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}"><style>.cut{fill:none;stroke:#e00;stroke-width:${opt.hair ? 0.01 : 0.3}}.fold{fill:none;stroke:#06c;stroke-width:${opt.hair ? 0.01 : 0.3};stroke-dasharray:3 2}</style>${body}</svg>`;
}
export function netDxf(layout, scale = 1) {
  const k = scale * 1000;
  const out = ['0', 'SECTION', '2', 'ENTITIES'];
  const line = (a, b, layer) => out.push('0', 'LINE', '8', layer, '10', (a[0] * k).toFixed(4), '20', (a[1] * k).toFixed(4), '30', '0', '11', (b[0] * k).toFixed(4), '21', (b[1] * k).toFixed(4), '31', '0');
  for (const it of layout.items) {
    for (const s of it.cut) for (let i = 0; i + 1 < s.length; i++) line(s[i], s[i + 1], 'POTONG');
    for (const s of it.fold) for (let i = 0; i + 1 < s.length; i++) line(s[i], s[i + 1], 'LIPAT');
  }
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\n');
}
// Kotak kemasan (P × L × T dalam meter) sebagai solid.
export function buildBox(m, L, W, H, color = '#c9a66b') {
  const f = G.makeFace(m, [[0, 0, 0], [L, 0, 0], [L, W, 0], [0, W, 0]], UP, color);
  m.faces.push(f);
  G.pushPull(m, f.id, H);
  return f.solid;
}

// STL ASCII (mm) untuk benda terpilih
export function exportSTLmm(model, sids, scale = 1) {
  const k = scale * 1000;
  const out = ['solid sketchclone'];
  for (const sid of sids) for (const f of model.faces.filter((q) => q.solid === sid)) {
    const t = G.triangulateFace(f);
    for (let i = 0; i < t.length; i += 3) {
      const a = V(t[i]), b = V(t[i + 1]), c = V(t[i + 2]);
      const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      out.push(`facet normal ${n.x.toFixed(6)} ${n.y.toFixed(6)} ${n.z.toFixed(6)}`, 'outer loop', ...[a, b, c].map((v) => `vertex ${(v.x * k).toFixed(4)} ${(v.y * k).toFixed(4)} ${(v.z * k).toFixed(4)}`), 'endloop', 'endfacet');
    }
  }
  out.push('endsolid sketchclone');
  return out.join(String.fromCharCode(10));
}
// Tata letak lembar sebagai DXF (mm) untuk mesin CNC / panel saw
export function sheetsDxf(nr, gap = 100) {
  const out = ['0', 'SECTION', '2', 'ENTITIES'];
  const rect = (x, y, w, h, layer) => {
    const P = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
    for (let i = 0; i < 4; i++) out.push('0', 'LINE', '8', layer, '10', P[i][0].toFixed(2), '20', P[i][1].toFixed(2), '30', '0', '11', P[i + 1][0].toFixed(2), '21', P[i + 1][1].toFixed(2), '31', '0');
  };
  nr.sheets.forEach((s, i) => {
    const oy = i * (nr.sheetH + gap);
    rect(0, oy, nr.sheetW, nr.sheetH, 'LEMBAR');
    for (const p of s.parts) {
      rect(p.x, oy + p.y, p.w, p.h, 'POTONG');
      out.push('0', 'TEXT', '8', 'LABEL', '10', (p.x + 10).toFixed(2), '20', (oy + p.y + 10).toFixed(2), '30', '0', '40', '30', '1', `${p.label} ${Math.round(p.rot ? p.h : p.w)}x${Math.round(p.rot ? p.w : p.h)}`);
    }
  });
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join(String.fromCharCode(10));
}
