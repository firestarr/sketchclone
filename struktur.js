// Cek struktur sederhana (aturan praktis SNI 2847 / SNI 1727 untuk rumah tinggal).
// Bukan pengganti perhitungan insinyur sipil: memberi peringatan dini & saran dimensi.
import * as THREE from 'three';
import * as G from './geometry.js';
import * as C from './construct.js';

export const STRUK_DEFAULT = {
  fc: 18.7, // MPa (beton K-225)
  fyD: 400, // MPa besi ulir
  fyP: 280, // MPa besi polos / kolom praktis
  soil: 100, // kN/m² daya dukung tanah izin (± 1 kg/cm²)
  LL: 2.0, // kN/m² beban hidup lantai rumah / dak yang dipakai
  SDL: 1.5, // kN/m² screed + keramik + plafon + instalasi
  wall: 2.5, // kN/m² dinding bata ½ batu berplester
  roof: 1.0, // kN/m² atap (penutup + rangka + hidup) per luas denah
};
export const optsOf = (model) => ({ ...STRUK_DEFAULT, ...((model.rab && model.rab.struk) || {}) });
const ceil5 = (v) => Math.ceil(v * 20 - 1e-9) / 20;
const fmtm = (v) => (Math.round(v * 100) / 100).toLocaleString('id-ID') + ' m';
const cm = (v) => Math.round(v * 100);
const segDist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const distPoly = (p, P) => Math.min(...P.map((a, i) => segDist(p, a, P[(i + 1) % P.length])));
const pip = (x, y, P) => G.pointInPoly2(new THREE.Vector2(x, y), P.map((p) => new THREE.Vector2(p[0], p[1])));
// kapasitas aksial kolom pendek bersengkang (kN): 0,65 · 0,8 · [0,85 fc (Ag − As) + fy As]
export function colCapacity(b, o, praktis) {
  const Ag = (b * 1000) ** 2;
  const As = praktis || b < 0.2 ? 4 * 78.5 : 4 * 132.7;
  const fy = praktis || b < 0.2 ? o.fyP : o.fyD;
  return (0.65 * 0.8 * (0.85 * o.fc * (Ag - As) + fy * As)) / 1000;
}

function gather(model) {
  const keep = (gid) => C.phaseOf(model, gid) !== 'demo';
  const walls = [], slabs = [], beams = [], cols = [], roofs = [];
  for (const [k, g] of Object.entries(model.groups)) {
    const gid = +k;
    if (!keep(gid)) continue;
    if (g.wall && g.wall.pts.length > 1) {
      const P = g.wall.pts, n = g.wall.closed ? P.length : P.length - 1;
      const segs = [];
      for (let i = 0; i < n; i++) segs.push([P[i], P[(i + 1) % P.length]]);
      const sg = Object.values(model.groups).find((q) => q.struct && q.struct.wall === gid);
      const colB = g.wall.colB || 0.15;
      const pts = sg?.struct?.colPts ? sg.struct.colPts.map(([x, y]) => [x, y]) : C.columnPoints(g.wall).map(({ p }) => [p.x, p.y]);
      const zb = P[0][2], top = zb + g.wall.h;
      walls.push({ gid, segs, zb, top, h: g.wall.h, t: g.wall.t, len: g.wall.len, colB, ringH: g.wall.ringH || 0.2, name: g.name || 'Dinding' });
      for (const [x, y] of pts) cols.push({ x, y, z0: zb, top, b: colB, H: g.wall.h, praktis: colB < 0.2, wall: gid, gid });
    }
    if (g.slab) slabs.push({ gid, ...g.slab, zb: g.slab.z - g.slab.t });
    if (g.beam) beams.push({ gid, ...g.beam });
    if (g.column) {
      const c = g.column;
      cols.push({ x: c.x, y: c.y, z0: c.z, top: c.z + c.H, b: c.b, H: c.H, praktis: false, foot: c.foot, gid, own: true });
    }
    if (g.roof) {
      const fs = model.faces.filter((f) => (f.group ?? null) === gid);
      if (!fs.length) continue;
      const box = new THREE.Box3();
      fs.forEach((f) => f.pts.forEach((p) => box.expandByPoint(new THREE.Vector3(...p))));
      roofs.push({ gid, box, zmin: box.min.z });
    }
  }
  return { walls, slabs, beams, cols, roofs };
}

// Segmen tumpuan sebuah plat: dinding yang puncaknya di bawah plat & balok yang menyatu dengan plat.
function slabSupports(sl, D) {
  const sup = [];
  for (const w of D.walls) if (w.top > sl.zb - 0.3 && w.top < sl.z + 0.02) for (const s of w.segs) sup.push({ a: s[0], b: s[1], r: w.t / 2 + 0.03, kind: 'dinding', gid: w.gid });
  for (const bm of D.beams) if (Math.abs(bm.z - sl.z) < 0.06 || Math.abs(bm.z - sl.zb) < 0.06) sup.push({ a: bm.p1, b: bm.p2, r: bm.b / 2 + 0.03, kind: 'balok', gid: bm.gid });
  return sup;
}
const edgeSupported = (p, q, sup) => {
  let hit = 0;
  const N = 7;
  for (let i = 1; i <= N; i++) {
    const t = i / (N + 1), x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t;
    if (sup.some((s) => segDist([x, y], s.a, s.b) <= s.r)) hit++;
  }
  return hit / N >= 0.6;
};

function checkSlab(sl, D, o, out) {
  const others = D.slabs.filter((q) => q !== sl && Math.abs(q.z - sl.z) < 0.06);
  const sup = slabSupports(sl, D);
  const P = sl.pts;
  const xs0 = P.map((p) => p[0]), ys0 = P.map((p) => p[1]);
  const minx = Math.min(...xs0), maxx = Math.max(...xs0), miny = Math.min(...ys0), maxy = Math.max(...ys0);
  const uniq = (arr) => arr.sort((a, b) => a - b).filter((v, i, A) => i === 0 || v - A[i - 1] > 0.08);
  const xs = uniq([minx, maxx, ...sup.filter((s) => Math.abs(s.a[0] - s.b[0]) < 0.02).map((s) => s.a[0]).filter((x) => x > minx + 0.08 && x < maxx - 0.08)]);
  const ys = uniq([miny, maxy, ...sup.filter((s) => Math.abs(s.a[1] - s.b[1]) < 0.02).map((s) => s.a[1]).filter((y) => y > miny + 0.08 && y < maxy - 0.08)]);
  const nx = xs.length - 1, ny = ys.length - 1;
  const inside = [...Array(nx)].map((_, i) => [...Array(ny)].map((_, j) => pip((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2, P)));
  const supX = (i, j) => edgeSupported([xs[i], ys[j]], [xs[i], ys[j + 1]], sup); // tepi tegak di x = xs[i]
  const supY = (i, j) => edgeSupported([xs[i], ys[j]], [xs[i + 1], ys[j]], sup); // tepi datar di y = ys[j]
  let hreq = 0, gov = '', free = [], bad = false;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    if (!inside[i][j]) continue;
    let l = i; while (!supX(l, j) && l - 1 >= 0 && inside[l - 1][j]) l--;
    let r = i; while (!supX(r + 1, j) && r + 1 < nx && inside[r + 1][j]) r++;
    let d = j; while (!supY(i, d) && d - 1 >= 0 && inside[i][d - 1]) d--;
    let u = j; while (!supY(i, u + 1) && u + 1 < ny && inside[i][u + 1]) u++;
    const sl_ = supX(l, j), sr = supX(r + 1, j), sd = supY(i, d), su = supY(i, u + 1);
    // tabel tebal minimum SNI 2847: sederhana L/20, satu ujung menerus L/24, dua ujung menerus L/28 (× 0,4 + fy/700)
    const kf = 0.4 + o.fyP / 700;
    const div = (a1, a2) => (a1 && a2 ? 28 : a1 || a2 ? 24 : 20);
    const cxL = l - 1 >= 0 && inside[l - 1][j], cxR = r + 1 < nx && inside[r + 1][j], cyD = d - 1 >= 0 && inside[i][d - 1], cyU = u + 1 < ny && inside[i][u + 1];
    const Lx = xs[r + 1] - xs[l], Ly = ys[u + 1] - ys[d];
    let h = 0, why = '';
    const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
    if (sl_ && sr && sd && su) {
      const Ls = Math.min(Lx, Ly), Ll = Math.max(Lx, Ly), beta = Ll / Ls;
      if (beta <= 2) { h = (Math.max(0, Ll - 0.15) * (0.8 + o.fyP / 1400)) / (36 + 9 * beta); why = `dua arah ${fmtm(Lx)} × ${fmtm(Ly)}`; }
      else { h = (Ls / (Lx <= Ly ? div(cxL, cxR) : div(cyD, cyU))) * kf; why = `satu arah bentang ${fmtm(Ls)}`; }
    } else if (sl_ && sr) { h = (Lx / div(cxL, cxR)) * kf; why = `satu arah bentang ${fmtm(Lx)}`; }
    else if (sd && su) { h = (Ly / div(cyD, cyU)) * kf; why = `satu arah bentang ${fmtm(Ly)}`; }
    else {
      // kantilever: satu sisi bertumpu
      const cand = [];
      if (sl_ && !sr) cand.push(Lx); if (sr && !sl_) cand.push(Lx);
      if (sd && !su) cand.push(Ly); if (su && !sd) cand.push(Ly);
      const Lc = cand.length ? Math.min(...cand) : Infinity;
      if (Lc <= 1.25) { h = (Lc / 10) * kf; why = `kantilever ${fmtm(Lc)}`; }
      else {
        bad = true;
        why = Number.isFinite(Lc) ? `menggantung ${fmtm(Lc)} tanpa tumpuan di ujungnya` : 'tidak bertumpu pada dinding/balok';
        out.push({ lvl: 'err', el: 'Plat', gid: sl.gid, at: [cx, cy, sl.z], msg: `Bagian plat di sekitar (${fmtm(cx)}, ${fmtm(cy)}) ${why}.` });
      }
    }
    if (h > hreq) { hreq = h; gov = why; }
  }
  // tepi bebas sepanjang batas plat (untuk saran balok keliling)
  {
    // bagian tepi yang tidak ditumpu (dicari per 10 cm, digabung jadi ruas)
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(2, Math.round(L / 0.1));
      const pt = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      // titik tepi yang bersambung dengan plat lain (menerus) tidak dianggap bebas
      const nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L;
      const cont = (q) => others.some((o2) => pip(q[0] + nx * 0.1, q[1] + ny * 0.1, o2.pts) || pip(q[0] - nx * 0.1, q[1] - ny * 0.1, o2.pts));
      let run = null;
      for (let k = 0; k <= n; k++) {
        const t = k / n, ok = sup.some((s2) => segDist(pt(t), s2.a, s2.b) <= s2.r) || cont(pt(t));
        if (!ok && run == null) run = Math.max(0, (k - 0.5) / n);
        if ((ok || k === n) && run != null) {
          const t1 = ok ? (k - 0.5) / n : 1;
          if ((t1 - run) * L > 0.8) free.push([pt(run < 0.1 / L ? 0 : run), pt(t1 > 1 - 0.1 / L ? 1 : t1)]);
          run = null;
        }
      }
    }
  }
  hreq = Math.max(0.12, Math.ceil(Math.max(hreq, 0.09) * 100 - 1e-6) / 100);
  const t = sl.t;
  if (!bad) {
    if (t + 1e-6 >= hreq) out.push({ lvl: 'ok', el: 'Plat', gid: sl.gid, msg: `Plat ${cm(t)} cm (${gov}) memenuhi tebal minimum ${cm(hreq)} cm.` });
    else out.push({ lvl: t >= hreq - 0.021 ? 'warn' : 'err', el: 'Plat', gid: sl.gid, msg: `Plat ${cm(t)} cm terlalu tipis untuk ${gov}: minimum ${cm(hreq)} cm.`, fix: { kind: 'elem', gid: sl.gid, patch: { t: hreq }, label: `Tebal ${cm(hreq)} cm` } });
  }
  return { sup, free, bad, hreq };
}

// tumpuan sepanjang balok (parameter 0..L): kolom, dinding bersilang/di bawahnya, balok lain yang bersilang
function checkBeam(bm, D, o, out) {
  const a = bm.p1, b = bm.p2, L = bm.len, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  const zb = bm.z - bm.h;
  const at = (p) => ((p[0] - a[0]) * ux + (p[1] - a[1]) * uy);
  const off = (p) => Math.abs(-(p[0] - a[0]) * uy + (p[1] - a[1]) * ux);
  const ts = [];
  let cont = 0;
  for (const c of D.cols) if (c.top > zb - 0.35 && c.top <= bm.z + 0.02 && off([c.x, c.y]) < Math.max(bm.b, c.b) / 2 + 0.05) { const t = at([c.x, c.y]); if (t > -0.2 && t < L + 0.2) ts.push(t); }
  for (const w of D.walls) {
    if (!(w.top > zb - 0.35 && w.top <= bm.z + 0.02)) continue;
    for (const [p, q] of w.segs) {
      const t1 = at(p), t2 = at(q), o1 = off(p), o2 = off(q);
      if (o1 < 0.12 && o2 < 0.12) { // dinding sejajar tepat di bawah: tumpuan menerus
        const lo = Math.max(0, Math.min(t1, t2)), hi = Math.min(L, Math.max(t1, t2));
        if (hi > lo) { cont += hi - lo; for (let t = lo; t <= hi + 1e-6; t += 0.5) ts.push(Math.min(t, hi)); ts.push(hi); }
        continue;
      }
      // perpotongan dinding melintang
      const s1 = -(p[0] - a[0]) * uy + (p[1] - a[1]) * ux, s2 = -(q[0] - a[0]) * uy + (q[1] - a[1]) * ux;
      if (s1 * s2 > 0) continue;
      const t = t1 + (t2 - t1) * (s1 / (s1 - s2));
      if (t > -0.2 && t < L + 0.2) ts.push(t);
    }
  }
  const sorted = [...new Set(ts.map((t) => Math.round(Math.max(0, Math.min(L, t)) * 100) / 100))].sort((x, y) => x - y);
  if (!sorted.length) {
    out.push({ lvl: 'err', el: 'Balok', gid: bm.gid, msg: `Balok ${cm(bm.b)}/${cm(bm.h)} sepanjang ${fmtm(L)} tidak bertumpu pada kolom atau dinding.` });
    return;
  }
  let span = 0, cant = 0;
  cant = Math.max(sorted[0], L - sorted[sorted.length - 1]);
  for (let i = 1; i < sorted.length; i++) span = Math.max(span, sorted[i] - sorted[i - 1]);
  if (cant > 0.25 && sorted.length === 1) span = 0;
  const hreq = Math.max(0.25, ceil5(Math.max(span / 12, cant / 6)));
  const breq = Math.max(0.15, ceil5(hreq * 0.4));
  const desc = `bentang ${fmtm(span)}${cant > 0.25 ? ` + kantilever ${fmtm(cant)}` : ''}`;
  if (cant > 2) out.push({ lvl: 'err', el: 'Balok', gid: bm.gid, msg: `Ujung balok ${cm(bm.b)}/${cm(bm.h)} menggantung ${fmtm(cant)} tanpa kolom — tambahkan kolom di ujungnya.` });
  else if (bm.h + 1e-6 >= hreq && bm.b + 1e-6 >= breq) out.push({ lvl: 'ok', el: 'Balok', gid: bm.gid, msg: `Balok ${cm(bm.b)}/${cm(bm.h)} (${desc}) cukup; minimum ${cm(breq)}/${cm(hreq)}.` });
  else out.push({ lvl: bm.h >= hreq - 0.051 ? 'warn' : 'err', el: 'Balok', gid: bm.gid, msg: `Balok ${cm(bm.b)}/${cm(bm.h)} terlalu kecil untuk ${desc}: disarankan ${cm(breq)}/${cm(hreq)} (tinggi ± bentang/12).`, fix: { kind: 'elem', gid: bm.gid, patch: { b: Math.max(bm.b, breq), h: hreq }, label: `Ubah ke ${cm(Math.max(bm.b, breq))}/${cm(hreq)}` } });
}

export function structCheck(model) {
  const o = optsOf(model);
  const D = gather(model);
  const out = [];
  const L0 = C.levelsOf(model)[0].z;
  const slabInfo = new Map();
  for (const sl of D.slabs) slabInfo.set(sl.gid, checkSlab(sl, D, o, out));
  for (const bm of D.beams) checkBeam(bm, D, o, out);

  // saran: balok keliling + kolom untuk tepi plat yang menggantung
  for (const sl of D.slabs) {
    const inf = slabInfo.get(sl.gid);
    if (!inf.bad || !inf.free.length) continue;
    const beams = [], colsAdd = [];
    const zCol = C.levelsOf(model)[C.levelAt(model, sl.zb - 0.5)].z;
    const hasSupportAt = (p) => D.cols.some((c) => Math.hypot(c.x - p[0], c.y - p[1]) < 0.25 && c.top > sl.zb - 0.6 && c.top < sl.z + 0.05) || D.walls.some((w) => w.top > sl.zb - 0.6 && w.top < sl.z + 0.02 && w.segs.some(([s1, s2]) => segDist(p, s1, s2) < w.t / 2 + 0.05));
    for (const [a, b] of inf.free) {
      const Lb = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const h = Math.max(0.3, ceil5(Lb / 12));
      beams.push({ a, b, z: sl.z, bw: Math.max(0.15, ceil5(h * 0.4)), h });
      for (const p of [a, b]) if (!hasSupportAt(p) && !colsAdd.some((c) => Math.hypot(c.x - p[0], c.y - p[1]) < 0.25)) colsAdd.push({ x: p[0], y: p[1], z0: zCol, H: sl.zb - zCol, b: 0.2 });
    }
    out.push({
      lvl: 'err', el: 'Plat', gid: sl.gid,
      msg: `Saran: balok tepi ${beams.map((b) => `${cm(b.bw)}/${cm(b.h)} (${fmtm(Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]))})`).join(', ')}${colsAdd.length ? ` dan ${colsAdd.length} kolom struktur 20/20 berfootplat di sudut yang belum ditopang` : ''}.`,
      fix: { kind: 'add', beams, cols: colsAdd, label: 'Tambah balok & kolom' },
    });
  }

  // ---- beban kolom (luas pengaruh dengan sampel grid ke kolom terdekat) ----
  for (const c of D.cols) { c.D = c.b * c.b * c.H * 24; c.L = 0; c.slab = false; }
  const nearest = (x, y, pred) => {
    let best = null, bd = Infinity;
    for (const c of D.cols) { if (!pred(c)) continue; const d = Math.hypot(c.x - x, c.y - y); if (d < bd) { bd = d; best = c; } }
    return best;
  };
  const step = 0.25, dA = step * step;
  for (const sl of D.slabs) {
    const xs = sl.pts.map((p) => p[0]), ys = sl.pts.map((p) => p[1]);
    const under = (c) => c.top > sl.zb - 0.35 && c.top < sl.z + 0.05 && c.x > Math.min(...xs) - 0.35 && c.x < Math.max(...xs) + 0.35 && c.y > Math.min(...ys) - 0.35 && c.y < Math.max(...ys) + 0.35;
    if (!D.cols.some(under)) continue;
    for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
      if (!pip(x, y, sl.pts)) continue;
      const c = nearest(x, y, under);
      c.D += (sl.t * 24 + o.SDL) * dA;
      c.L += o.LL * dA;
      c.slab = true;
    }
    // dinding yang berdiri di atas plat ini
    for (const w of D.walls) {
      if (Math.abs(w.zb - sl.z) > 0.06) continue;
      for (const [p, q] of w.segs) {
        const Ls = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.max(1, Math.round(Ls / 0.5));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t;
          if (!pip(x, y, sl.pts) && distPoly([x, y], sl.pts) > 0.2) continue;
          const c = nearest(x, y, under);
          if (c) c.D += o.wall * w.h * (Ls / n);
        }
      }
    }
  }
  for (const r of D.roofs) {
    const sup = (c) => Math.abs(c.top - r.zmin) < 0.45;
    if (!D.cols.some(sup)) continue;
    for (let x = r.box.min.x + step / 2; x < r.box.max.x; x += step) for (let y = r.box.min.y + step / 2; y < r.box.max.y; y += step) {
      const c = nearest(x, y, sup);
      c.D += o.roof * 0.6 * dA;
      c.L += o.roof * 0.4 * dA;
    }
  }
  // turunkan beban ke kolom di bawahnya
  const byTop = [...D.cols].sort((p, q) => q.z0 - p.z0);
  for (const c of byTop) {
    if (c.z0 < L0 + 0.1) continue;
    const below = D.cols.filter((d) => d !== c && Math.abs(d.top - c.z0) < 0.45 && Math.hypot(d.x - c.x, d.y - c.y) < 0.3);
    if (below.length) { below[0].D += c.D; below[0].L += c.L; below[0].slab ||= c.slab; }
    else if (c.own) out.push({ lvl: 'warn', el: 'Kolom', gid: c.gid, msg: `Kolom di (${fmtm(c.x)}, ${fmtm(c.y)}) elevasi ${fmtm(c.z0)} tidak menerus ke kolom di bawahnya — bebannya jatuh ke plat/balok.` });
  }
  // evaluasi
  const pd = C.pondasiOf(model);
  const perWall = new Map();
  for (const c of D.cols) {
    c.Pu = 1.2 * c.D + 1.6 * c.L;
    c.P = c.D + c.L;
    c.cap = colCapacity(c.b, o, c.praktis);
    if (c.own) {
      const need = [0.2, 0.25, 0.3, 0.35, 0.4].find((b) => colCapacity(b, o, false) * 0.7 >= c.Pu) || 0.4;
      if (c.Pu > c.cap * 0.7) out.push({ lvl: c.Pu > c.cap ? 'err' : 'warn', el: 'Kolom', gid: c.gid, msg: `Kolom ${cm(c.b)}/${cm(c.b)}: beban terfaktor ${c.Pu.toFixed(0)} kN, kapasitas ${c.cap.toFixed(0)} kN — disarankan ${cm(need)}/${cm(need)}.`, fix: { kind: 'elem', gid: c.gid, patch: { b: need }, label: `Ubah ke ${cm(need)}/${cm(need)}` } });
      else out.push({ lvl: 'ok', el: 'Kolom', gid: c.gid, msg: `Kolom ${cm(c.b)}/${cm(c.b)} memikul ${c.Pu.toFixed(0)} kN (kapasitas ${c.cap.toFixed(0)} kN).` });
      if (c.z0 < L0 + 0.1) {
        const Breq = Math.max(0.6, ceil5(Math.sqrt((c.P * 1.1) / o.soil)));
        if (!c.foot) out.push({ lvl: 'err', el: 'Pondasi', gid: c.gid, msg: `Kolom di (${fmtm(c.x)}, ${fmtm(c.y)}) belum punya pondasi: perlu footplat ± ${cm(Breq)}×${cm(Breq)} cm (beban ${c.P.toFixed(0)} kN, tanah ${o.soil} kN/m²).`, fix: { kind: 'elem', gid: c.gid, patch: { foot: Breq, depth: 1.0 }, label: `Footplat ${cm(Breq)}×${cm(Breq)}` } });
        else if (c.foot + 1e-6 < Breq) out.push({ lvl: 'err', el: 'Pondasi', gid: c.gid, msg: `Footplat ${cm(c.foot)}×${cm(c.foot)} kurang: perlu ${cm(Breq)}×${cm(Breq)} cm untuk beban ${c.P.toFixed(0)} kN.`, fix: { kind: 'elem', gid: c.gid, patch: { foot: Breq }, label: `Footplat ${cm(Breq)}×${cm(Breq)}` } });
        else out.push({ lvl: 'ok', el: 'Pondasi', gid: c.gid, msg: `Footplat ${cm(c.foot)}×${cm(c.foot)} cukup (perlu ${cm(Breq)}).` });
      }
    } else {
      const w = perWall.get(c.wall) || { max: 0, cap: c.cap, slab: false, P: 0, maxP: 0, n: 0 };
      w.max = Math.max(w.max, c.Pu);
      w.maxP = Math.max(w.maxP, c.P);
      w.P += c.P;
      w.n++;
      w.slab ||= c.slab;
      perWall.set(c.wall, w);
    }
  }
  for (const wl of D.walls) {
    const w = perWall.get(wl.gid);
    if (!w) continue;
    const kind = wl.colB < 0.2 ? 'kolom praktis' : 'kolom struktur';
    const nm = `${wl.name} (${fmtm(wl.len)}, elevasi ${fmtm(wl.zb)})`;
    if (w.slab && wl.colB < 0.2) {
      out.push({ lvl: w.max > w.cap * 0.7 ? 'err' : 'warn', el: 'Kolom', gid: wl.gid, msg: `${nm}: ${kind} ${cm(wl.colB)}/${cm(wl.colB)} memikul plat beton (beban terbesar ${w.max.toFixed(0)} kN, kapasitas ${w.cap.toFixed(0)} kN). Kolom praktis hanya pengikat dinding — untuk plat beton gunakan kolom struktur 20/20 (4D13, sengkang Ø8-150).`, fix: { kind: 'wall', gid: wl.gid, patch: { colB: 0.2 }, label: 'Kolom 20/20' } });
    } else if (w.max > w.cap * 0.7) {
      const need = [0.2, 0.25, 0.3].find((b) => colCapacity(b, o, false) * 0.7 >= w.max) || 0.3;
      out.push({ lvl: w.max > w.cap ? 'err' : 'warn', el: 'Kolom', gid: wl.gid, msg: `${nm}: ${kind} ${cm(wl.colB)}/${cm(wl.colB)} beban ${w.max.toFixed(0)} kN mendekati/melebihi kapasitas ${w.cap.toFixed(0)} kN.`, fix: { kind: 'wall', gid: wl.gid, patch: { colB: need }, label: `Kolom ${cm(need)}/${cm(need)}` } });
    } else out.push({ lvl: 'ok', el: 'Kolom', gid: wl.gid, msg: `${nm}: ${kind} ${cm(wl.colB)}/${cm(wl.colB)}, beban terbesar ${w.max.toFixed(0)} kN (kapasitas ${w.cap.toFixed(0)} kN).` });
    // ring balok yang memikul plat
    if (w.slab) {
      let sp = 0;
      for (const [a, b] of wl.segs) {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const ts = D.cols.filter((c) => c.wall === wl.gid && segDist([c.x, c.y], a, b) < 0.1).map((c) => ((c.x - a[0]) * (b[0] - a[0]) + (c.y - a[1]) * (b[1] - a[1])) / L).concat([0, L]).sort((x, y) => x - y);
        for (let i = 1; i < ts.length; i++) sp = Math.max(sp, ts[i] - ts[i - 1]);
      }
      const hreq = Math.max(0.25, ceil5(sp / 12));
      if (wl.ringH + 1e-6 < hreq) out.push({ lvl: 'warn', el: 'Balok', gid: wl.gid, msg: `${nm}: ring balok 15/${cm(wl.ringH)} memikul plat — disarankan 15/${cm(hreq)} (bentang antar-kolom ± ${fmtm(sp)}).`, fix: { kind: 'wall', gid: wl.gid, patch: { ringH: hreq }, label: `Ring 15/${cm(hreq)}` } });
    }
    // pondasi menerus batu kali di lantai dasar
    if (Math.abs(wl.zb - L0) < 0.1) {
      const q = w.P / Math.max(wl.len, 0.1) + o.wall * wl.h;
      const cap = o.soil * pd.bot;
      if (q > cap) out.push({ lvl: 'err', el: 'Pondasi', gid: wl.gid, msg: `${nm}: beban pondasi ${q.toFixed(1)} kN/m > daya dukung ${cap.toFixed(1)} kN/m — lebar bawah pondasi perlu ≥ ${fmtm(ceil5(q / o.soil))}.` });
      if (w.maxP > o.soil * pd.bot * 2) out.push({ lvl: 'warn', el: 'Pondasi', gid: wl.gid, msg: `${nm}: beban terpusat kolom ${w.maxP.toFixed(0)} kN terlalu besar untuk pondasi batu kali — tambahkan footplat ± ${cm(Math.max(0.6, ceil5(Math.sqrt(w.maxP * 1.1 / o.soil))))} cm di bawah kolom.` });
    }
  }
  const rank = { err: 0, warn: 1, ok: 2 };
  out.sort((a, b) => rank[a.lvl] - rank[b.lvl]);
  return {
    items: out,
    n: { err: out.filter((x) => x.lvl === 'err').length, warn: out.filter((x) => x.lvl === 'warn').length, ok: out.filter((x) => x.lvl === 'ok').length },
    cols: D.cols.map((c) => ({ x: c.x, y: c.y, z: c.z0, b: c.b, Pu: +c.Pu.toFixed(1), cap: +c.cap.toFixed(1), praktis: c.praktis })),
    opts: o,
  };
}

// Terapkan saran perbaikan. Mengembalikan jumlah elemen yang diubah.
export function applyFix(model, fix, opt = {}) {
  if (!fix) return 0;
  if (fix.kind === 'elem') return C.rebuildElem(model, fix.gid, fix.patch) != null ? 1 : 0;
  if (fix.kind === 'wall') {
    const g = model.groups[fix.gid];
    if (!g?.wall) return 0;
    Object.assign(g.wall, fix.patch);
    if (C.phaseOf(model, fix.gid) === 'exist') g.wall.upgrade = { ...(g.wall.upgrade || {}), ...fix.patch }; // perkuatan = pekerjaan baru
    const z0 = C.levelsOf(model)[0].z;
    const old = Object.values(model.groups).find((q) => q.struct?.wall === fix.gid);
    if (old || opt.rebuildStruct) C.buildStructure(model, fix.gid, { ground: Math.abs(g.wall.pts[0][2] - z0) < 0.1, tag: old ? old.tag : opt.tag });
    return 1;
  }
  if (fix.kind === 'add') {
    let n = 0;
    for (const b of fix.beams) if (C.makeBeam(model, b.a, b.b, b.z, b.bw, b.h, opt.parent ?? null) != null) n++;
    for (const c of fix.cols) {
      const ground = c.z0 < C.levelsOf(model)[0].z + 0.1;
      if (C.makeColumn(model, c.x, c.y, c.z0, c.H, c.b, { foot: ground ? 0.8 : 0, depth: 1.0 }, opt.parent ?? null) != null) n++;
    }
    return n;
  }
  return 0;
}

// Tepi plat yang tidak ditumpu dinding/balok/plat lain (untuk membuat balok keliling)
export function slabFreeEdges(model, gid) {
  const D = gather(model);
  const sl = D.slabs.find((q) => q.gid === +gid);
  return sl ? checkSlab(sl, D, optsOf(model), []).free : [];
}
