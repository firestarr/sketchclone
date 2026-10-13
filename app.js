// SketchClone - antarmuka, kamera, inferensi (snap), dan alat-alat.
import * as THREE from 'three';
import * as G from './geometry.js';
import { booleanSolids, trianglesToFaces } from './csg.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { parse as parseFont } from 'opentype.js';
import { zipSync, strToU8 } from 'fflate';
import QRCode from 'qrcode';
import { LIBRARY, insertLibrary } from './library.js';
import * as C from './construct.js';
import * as PR from './production.js';
import * as S from './struktur.js';
import { parseSkp } from './skp.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// BVH: raycast cepat pada model besar (dibangun malas saat pertama kali dibutuhkan)
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const stage = $('stage');
const V3 = (p) => new THREE.Vector3(p[0], p[1], p[2]);
const A = (v) => [v.x, v.y, v.z];

const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const AXCOL = ['#e03131', '#2f9e44', '#1971c2'];
const AXNAME = ['merah', 'hijau', 'biru'];

// ======================= Renderer & scene =======================
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
const content = new THREE.Group();
const overlay = new THREE.Group();
scene.add(content, overlay);

const hemi = new THREE.HemisphereLight(0xffffff, 0xb0b5bd, 3.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// Bayangan (SketchUp: mati secara default) + bidang penangkap bayangan di tanah.
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const shadowCatcher = new THREE.Mesh(
  new THREE.PlaneGeometry(1000, 1000),
  new THREE.ShadowMaterial({ opacity: 0.28, depthWrite: false }),
);
shadowCatcher.position.z = -0.003;
shadowCatcher.receiveShadow = true;
shadowCatcher.visible = false;
scene.add(shadowCatcher);
const sunState = { shadows: false, hour: 14 };
// pantulan untuk material logam/kaca
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
// langit realistis (mengikuti posisi matahari)
const sky = new Sky();
sky.scale.setScalar(1800);
sky.visible = false;
Object.assign(sky.material.uniforms.turbidity, { value: 6 });
sky.material.uniforms.rayleigh.value = 1.6;
sky.material.uniforms.mieCoefficient.value = 0.004;
sky.material.uniforms.mieDirectionalG.value = 0.8;
// shader Sky menganggap Y ke atas; dunia kita Z ke atas -> tukar sumbu di dalam shader
sky.material.vertexShader = sky.material.vertexShader.replace('vWorldPosition = worldPosition.xyz;', 'vWorldPosition = vec3( worldPosition.x, worldPosition.z, -worldPosition.y );');
sky.material.fragmentShader = sky.material.fragmentShader.replace('normalize( vWorldPosition - cameraPosition )', 'normalize( vWorldPosition - vec3( cameraPosition.x, cameraPosition.z, -cameraPosition.y ) )');
sky.material.needsUpdate = true;
scene.add(sky);
const lightsGroup = new THREE.Group();
scene.add(lightsGroup);
// Gaya tampilan (disimpan di model.style)
const DEF_STYLE = { face: 'shaded', edges: true, width: 1, ext: false, smooth: 20, profiles: false, bg: 'sky', ao: false, light: 'day' };
const BACKGROUNDS = {
  realsky: ['#7fb2e5', '#bcd6ee', '#e8edf2'],
  sky: ['#a9c6e8', '#d6e3f1', '#eceff2'],
  studio: ['#ffffff', '#f6f6f6', '#ececec'],
  gray: ['#9aa1a9', '#c3c8ce', '#dfe2e6'],
  dark: ['#1d222b', '#2a303b', '#3a414d'],
};
function applyBackground(st) {
  const c = BACKGROUNDS[st.bg] || BACKGROUNDS.sky;
  const night = st.light === 'night';
  stage.style.background = night ? 'linear-gradient(#05070d 0%, #0d1220 60%, #1a2030 100%)' : `linear-gradient(${c[0]} 0%, ${c[1]} 45%, ${c[2]} 100%)`;
  const real = st.bg === 'realsky' && !night;
  sky.visible = real;
  renderer.toneMapping = real ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = real ? 0.5 : 1;
  grid.visible = gridWanted && st.bg !== 'studio' && !real && !night;
  // cahaya studio: lebih terang & lembut seperti foto produk
  const studio = st.bg === 'studio';
  hemi.intensity = night ? 0.25 : studio ? 3.5 : 3.1;
  hemi.groundColor.set(studio ? 0xd8d8d8 : 0xb0b5bd);
  sun.intensity = night ? 0.05 : studio ? 1.35 : 1.6;
  scene.environmentIntensity = night ? 0.15 : 1;
}
let gridWanted = true;
// gradasi 3 tingkat untuk bayangan kartun
const toonRamp = (() => {
  const t = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 180, 180, 180, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
// garis luar (profil): salinan geometri di sisi belakang, digelembungkan sepanjang normal
function outlineMaterial(thickness, clip) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide, ...clip });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uOutline = { value: thickness };
    sh.vertexShader = 'uniform float uOutline;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * uOutline;');
  };
  mat.customProgramCacheKey = () => 'outline';
  return mat;
}
const styleOf = (m) => ({ ...DEF_STYLE, ...((m && m.style) || {}) });
const fatMats = new Set(); // LineMaterial yang perlu tahu ukuran layar

function updateSun(m) {
  const a = ((sunState.hour - 6) / 12) * Math.PI;
  const dir = new THREE.Vector3(Math.cos(a), -0.35, Math.sin(a) * 0.9 + 0.12).normalize();
  const box = G.bboxOf(m);
  const c = box.isEmpty() ? new THREE.Vector3(0, 0, 0) : box.getCenter(new THREE.Vector3());
  const R = Math.max(box.isEmpty() ? 10 : box.getSize(new THREE.Vector3()).length() / 2, 6) * 1.3;
  sun.position.copy(c).addScaledVector(dir, R * 3);
  sky.material.uniforms.sunPosition.value.set(dir.x, dir.z, -dir.y);
  sun.target.position.copy(c);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -R;
  sc.right = sc.top = R;
  sc.near = 0.1;
  sc.far = R * 6;
  sc.updateProjectionMatrix();
  sun.target.updateMatrixWorld();
  sun.castShadow = sunState.shadows;
  renderer.shadowMap.enabled = sunState.shadows;
  shadowCatcher.visible = sunState.shadows;
  shadowCatcher.position.x = c.x;
  shadowCatcher.position.y = c.y;
}

function setShadows(on, hour) {
  const was = sunState.shadows;
  sunState.shadows = on;
  if (hour != null) sunState.hour = hour;
  const cb = document.getElementById('shadowOn');
  if (cb) cb.checked = on;
  const hr = document.getElementById('hour');
  if (hr && hour != null) {
    hr.value = hour;
    document.getElementById('hourLbl').textContent = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
  }
  if (was !== on) {
    // materi perlu dikompilasi ulang saat bayangan dinyalakan/dimatikan
    content.traverse((o) => o.material && (o.material.needsUpdate = true));
  }
  updateSun(shown);
  requestRender();
}

const grid = new THREE.GridHelper(200, 200, 0xaab4be, 0xcdd5dd);
grid.rotation.x = Math.PI / 2;
grid.material.depthWrite = false;
grid.renderOrder = -3;
scene.add(grid);

const axesGroup = new THREE.Group();
[
  [[-500, 0, 0], [500, 0, 0], 0xe03131],
  [[0, -500, 0], [0, 500, 0], 0x2f9e44],
  [[0, 0, -500], [0, 0, 500], 0x1971c2],
].forEach(([a, b, c]) => {
  const g = new THREE.BufferGeometry().setFromPoints([V3(a), V3(b)]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: c, depthWrite: false }));
  l.renderOrder = -2;
  axesGroup.add(l);
});
scene.add(axesGroup);

const guideGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]);
const guide = new THREE.Line(guideGeo, new THREE.LineBasicMaterial({ color: 0xff0000, depthTest: false }));
guide.renderOrder = 10;
guide.visible = false;
guide.frustumCulled = false;
overlay.add(guide);
const guide2 = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]),
  new THREE.LineDashedMaterial({ color: 0xff0000, dashSize: 0.08, gapSize: 0.06, depthTest: false }),
);
guide2.renderOrder = 10;
guide2.visible = false;
guide2.frustumCulled = false;
overlay.add(guide2);

// ======================= Kamera =======================
const persp = new THREE.PerspectiveCamera(35, 1, 0.05, 4000);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -4000, 4000);
persp.up.set(0, 0, 1);
ortho.up.set(0, 0, 1);
let camera = persp;
const view = { target: new THREE.Vector3(0, 0, 1), dist: 16, az: -0.8, el: 0.5, ortho: false };
const EL_MAX = Math.PI / 2 - 0.001;

function camDir() {
  return new THREE.Vector3(
    Math.cos(view.el) * Math.cos(view.az),
    Math.cos(view.el) * Math.sin(view.az),
    Math.sin(view.el),
  );
}

function updateCamera() {
  aoInteract = true;
  const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
  view.el = Math.max(-EL_MAX, Math.min(EL_MAX, view.el));
  view.dist = Math.max(0.2, Math.min(2500, view.dist));
  camera = view.ortho ? ortho : persp;
  camera.position.copy(view.target).addScaledVector(camDir(), view.dist);
  camera.lookAt(view.target);
  if (view.ortho) {
    const hh = view.dist * Math.tan(THREE.MathUtils.degToRad(persp.fov / 2));
    ortho.left = (-hh * w) / h;
    ortho.right = (hh * w) / h;
    ortho.top = hh;
    ortho.bottom = -hh;
    ortho.updateProjectionMatrix();
  } else {
    persp.aspect = w / h;
    persp.updateProjectionMatrix();
  }
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  requestRender();
}

let needsRender = false;
// ---- Bayangan lembut (ambient occlusion) ----
// Dihitung saat tampilan diam; ketika sedang menggerakkan kamera/objek dipakai render biasa agar tetap lancar.
let composer = null, aoPass = null, renderPass = null, aoIdleTimer = 0, aoInteract = false;
const bgTextures = {};
function bgTexture(name) {
  if (!bgTextures[name]) {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g = c.getContext('2d');
    const cols = (typeof BACKGROUNDS !== 'undefined' && BACKGROUNDS[name]) || ['#a9c6e8', '#d6e3f1', '#eceff2'];
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, cols[0]);
    gr.addColorStop(0.45, cols[1]);
    gr.addColorStop(1, cols[2]);
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    bgTextures[name] = t;
  }
  return bgTextures[name];
}
function renderAO() {
  const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
  if (!composer) {
    composer = new EffectComposer(renderer);
    renderPass = new RenderPass(scene, camera);
    aoPass = new GTAOPass(scene, camera, w, h);
    aoPass.blendIntensity = 0.9;
    aoPass.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1, scale: 1.2 });
    composer.addPass(renderPass);
    composer.addPass(aoPass);
    composer.addPass(new OutputPass());
  }
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  renderPass.camera = camera;
  aoPass.camera = camera;
  const st = styleOf(shown);
  scene.background = bgTexture(st.bg || 'sky');
  composer.render();
  scene.background = null;
}
function requestRender() {
  if (needsRender) return;
  needsRender = true;
  requestAnimationFrame(() => {
    needsRender = false;
    const wantAO = typeof styleOf === 'function' && styleOf(shown).ao;
    if (wantAO && !aoInteract && !nav && !previewOn) renderAO();
    else {
      renderer.render(scene, camera);
      if (wantAO) {
        // jadwalkan render AO setelah interaksi berhenti
        clearTimeout(aoIdleTimer);
        aoIdleTimer = setTimeout(() => {
          aoInteract = false;
          requestRender();
        }, 180);
      }
    }
    positionLabels();
    positionGrips();
  });
}

new ResizeObserver(() => {
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  for (const m of fatMats) m.resolution.set(stage.clientWidth, stage.clientHeight);
  updateCamera();
}).observe(stage);

function zoomBox(box) {
  if (box.isEmpty()) {
    view.target.set(0, 0, 1);
    view.dist = 16;
  } else {
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.5);
    view.target.copy(c);
    view.dist = (r / Math.tan(THREE.MathUtils.degToRad(persp.fov / 2))) * 1.15;
  }
  updateCamera();
}
const zoomExtents = () => zoomBox(G.bboxOf(model, null, makeVisible(model)));
const zoomSelection = () => (selection.size ? zoomBox(G.bboxOf(model, selection)) : zoomExtents());

function setStdView(name) {
  const v = {
    iso: [-0.8, 0.5],
    top: [-Math.PI / 2, EL_MAX],
    front: [-Math.PI / 2, 0],
    back: [Math.PI / 2, 0],
    right: [0, 0],
    left: [Math.PI, 0],
  }[name];
  if (!v) return;
  [view.az, view.el] = v;
  zoomExtents();
}

function setOrtho(on) {
  view.ortho = on;
  document.querySelector('[data-view=ortho]').textContent = on ? 'Paralel' : 'Persp';
  updateCamera();
}

// ======================= Model, riwayat =======================
let model = G.newModel();
let shown = model; // model yang sedang digambar (bisa pratinjau)
let selection = new Set();
let history = [G.cloneModel(model)];
let hi = 0;
let savedHi = 0;
let filePath = null;
let snapCache = null;
let previewOn = false;
const pickMeshes = [];

function disposeGroup(g) {
  for (const o of [...g.children]) {
    g.remove(o);
    o.geometry && o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  }
}

const gOf = (e) => e.group ?? null;
let editGroup = null; // id grup yang sedang diedit (null = model utama)
const expand = (ids) => G.expandSelection(model, ids, editGroup);
// grup anak (di bawah grup yang sedang diedit) yang memuat entitas; null bila entitas langsung bisa diedit
const topOf = (e) => (e ? G.topUnder(model, gOf(e), editGroup) : null);
let activeClip = null; // bidang potong aktif (THREE.Plane) atau null

// Triangulasi di-cache berdasarkan bentuk bidang (pratinjau tidak perlu menghitung ulang semuanya).
const triCache = new Map();
function trisOf(f) {
  const k = f.n.join(',') + '|' + JSON.stringify(f.pts) + (f.holes.length ? JSON.stringify(f.holes) : '');
  let t = triCache.get(k);
  if (!t) {
    t = G.triangulateFace(f);
    if (triCache.size > 40000) triCache.clear();
    triCache.set(k, t);
  }
  return t;
}

// Fungsi visibilitas: tag, sembunyi entitas, sembunyi grup (beserta induknya).
function makeVisible(m) {
  const tagVis = new Map((m.tags || []).map((t) => [t.id, t.visible !== false]));
  const tagOk = (t) => t == null || tagVis.get(t) !== false;
  const gcache = new Map();
  const groupOk = (g) => {
    if (g == null) return true;
    if (gcache.has(g)) return gcache.get(g);
    const gr = m.groups[g];
    const ok = !gr || (!gr.hidden && tagOk(gr.tag) && groupOk(gr.parent ?? null));
    gcache.set(g, ok);
    return ok;
  };
  // renovasi: 'sebelum' menyembunyikan pekerjaan baru, 'sesudah' menyembunyikan yang dibongkar
  const rv = m.reno && m.reno.view;
  const phHide = (rv === 'sebelum' || rv === 'sesudah') && C.renoActive(m) ? (rv === 'sebelum' ? 'new' : 'demo') : null;
  const pcache = new Map();
  const phaseOk = (g) => {
    if (!phHide) return true;
    if (!pcache.has(g)) pcache.set(g, C.phaseOf(m, g) !== phHide);
    return pcache.get(g);
  };
  return (e) => !e.hidden && tagOk(e.tag) && groupOk(gOf(e)) && phaseOk(gOf(e));
}
let visibleFn = () => true;

// opts.exclude: Set id yang tidak digambar (bagian yang sedang digerakkan)
// opts.target + opts.partial: gambar hanya bidang/garis ke grup lain (tanpa pick, label, dll.)
function rebuild(m, opts = {}) {
  const target = opts.target || content;
  const partial = !!opts.partial;
  const ex = opts.exclude || null;
  if (!partial) {
    shown = m;
    pickMeshes.length = 0;
    fatMats.clear();
  }
  disposeGroup(target);
  const st = styleOf(m);
  const vis = makeVisible(m);
  if (!partial) visibleFn = vis;
  const edges = [], dimEdges = [], selEdges = [], lines = [], dimLines = [], selLines = [], guides = [];
  const ekey = (a, b) => {
    const x = G.key(a), y = G.key(b);
    return x < y ? x + '|' + y : y + '|' + x;
  };
  const faces = m.faces.filter((f) => vis(f) && !(ex && ex.has(f.id)));
  const emap = new Map();
  for (const f of faces) {
    [f.pts, ...f.holes].forEach((lp, li) => {
      for (let i = 0; i < lp.length; i++) {
        const k = ekey(lp[i], lp[(i + 1) % lp.length]);
        if (!emap.has(k)) emap.set(k, []);
        emap.get(k).push({ f, hole: li > 0 });
      }
    });
  }
  const smoothCos = st.smooth > 0 ? Math.cos((st.smooth * Math.PI) / 180) : 2;
  const isSoft = (a, b) => {
    const arr = emap.get(ekey(a, b));
    if (!arr || arr.length !== 2) return false;
    const [x, y] = arr;
    if (x.hole || y.hole) return false;
    const p = x.f, q = y.f;
    if (!(p.solid != null && p.solid === q.solid && gOf(p) === gOf(q) && p.color === q.color && p.tex === q.tex)) return false;
    const d = V3(p.n).dot(V3(q.n));
    if (p.soft && q.soft) return true;
    return d > 0.99999 || d > smoothCos;
  };
  // normal per titik untuk bayangan halus pada permukaan lengkung (sudut antar-bidang < smooth°)
  const vnorm = new Map();
  if (smoothCos <= 1 || faces.some((f) => f.soft)) {
    for (const f of faces) {
      if (f.solid == null) continue;
      const n = V3(f.n);
      for (const p of [...f.pts, ...f.holes.flat()]) {
        const k = f.solid + '|' + G.key(p);
        if (!vnorm.has(k)) vnorm.set(k, []);
        vnorm.get(k).push(n);
      }
    }
  }
  const normalAt = (f, p) => {
    const arr = f.solid != null && vnorm.get(f.solid + '|' + G.key(p));
    if (!arr || arr.length < 2) return f.n;
    const n0 = V3(f.n), sum = new THREE.Vector3();
    const lim = f.soft ? 0.2 : smoothCos;
    for (const n of arr) if (n.dot(n0) > lim) sum.add(n);
    if (sum.lengthSq() < 1e-12) return f.n;
    sum.normalize();
    return [sum.x, sum.y, sum.z];
  };
  const ext = st.ext ? view.dist * 0.005 : 0;
  const pushSeg = (arr, a, b) => {
    if (!ext) return arr.push(...a, ...b);
    const A3 = V3(a), B3 = V3(b), L = A3.distanceTo(B3);
    const d = B3.clone().sub(A3).normalize().multiplyScalar(Math.min(ext, L * 0.12));
    arr.push(...A(A3.sub(d)), ...A(B3.add(d)));
  };
  const pushLoop = (arr, loop) => {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      if (!isSoft(a, b)) pushSeg(arr, a, b);
    }
  };
  const isDim = (e) => editGroup != null && !G.isInTree(m, gOf(e), editGroup);
  if (!partial) {
    activeClip = null;
    if (m.section && m.section.on) {
      activeClip = new THREE.Plane().setFromNormalAndCoplanarPoint(V3(m.section.n).negate(), V3(m.section.p));
      activeClip.constant += 1e-4;
    }
  }
  const clip = activeClip ? { clippingPlanes: [activeClip], clipShadows: true } : {};

  // ---- bidang: dikelompokkan per material agar jumlah draw call kecil ----
  const batches = new Map();
  const phColor = !!(m.reno && m.reno.view === 'warna' && m.groups && C.renoActive(m));
  const phCache = new Map();
  const phOf = (f) => {
    const g = gOf(f);
    if (!phCache.has(g)) phCache.set(g, C.phaseOf(m, g));
    return phCache.get(g);
  };
  for (const f of faces) {
    const tris = trisOf(f);
    if (!tris.length) continue;
    const sel = selection.has(f.id);
    const dim = isDim(f);
    const useTex = st.face === 'shaded' || st.face === 'xray' || st.face === 'toon';
    const map = useTex && f.tex ? getTexture(f.tex) : null;
    const colKey = useTex ? (map ? 't:' + f.tex : f.color) : st.face;
    const finish = st.face === 'shaded' ? f.finish || (f.shiny ? 'glossy' : 'matte') : 'matte';
    const shiny = finish !== 'matte';
    const ph = phColor ? phOf(f) : '';
    const key = `${colKey}|${sel ? 1 : 0}|${dim ? 1 : 0}|${f.opacity ?? 1}|${finish}|${ph}`;
    let b = batches.get(key);
    if (!b) batches.set(key, (b = { pos: [], nor: [], uv: map ? [] : null, ids: [], f, map, sel, dim, op: f.opacity ?? 1, shiny, finish, ph }));
    for (const p of tris) {
      b.pos.push(p[0], p[1], p[2]);
      const nn = vnorm.size ? normalAt(f, p) : f.n;
      b.nor.push(nn[0], nn[1], nn[2]);
    }
    if (map) {
      const uvf = texMapper(f);
      for (const p of tris) b.uv.push(...uvf(p));
    }
    for (let i = 0; i < tris.length; i += 3) b.ids.push(f.id);
    if (!st.edges && !sel) continue;
    const dst = sel ? selEdges : dim ? dimEdges : edges;
    pushLoop(dst, f.pts);
    f.holes.forEach((h) => pushLoop(dst, h));
  }

  for (const b of batches.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    if (b.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    let col;
    if (st.face === 'mono') col = new THREE.Color('#eceae4');
    else if (st.face === 'hidden' || st.face === 'wire') col = new THREE.Color('#ffffff');
    else col = new THREE.Color(b.map ? '#ffffff' : b.f.color);
    if (b.ph === 'exist') col.lerp(new THREE.Color('#9aa3ad'), 0.6);
    else if (b.ph === 'demo') col.lerp(new THREE.Color('#e5533d'), 0.75);
    else if (b.ph === 'new') col.lerp(new THREE.Color('#f4b63f'), 0.22);
    if (b.sel) col.lerp(new THREE.Color(0x3b82f6), 0.5);
    const opacity = Math.min(st.face === 'xray' || b.dim ? 0.35 : 1, b.op, b.finish === 'glass' ? 0.28 : 1, b.ph === 'demo' ? 0.55 : 1);
    const base = {
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1,
      shadowSide: THREE.DoubleSide,
      ...clip,
    };
    const wire = st.face === 'wire';
    if (wire) Object.assign(base, { colorWrite: false, depthWrite: false });
    const flat = st.face === 'hidden' || wire;
    const Mat = flat ? THREE.MeshBasicMaterial : st.face === 'toon' ? THREE.MeshToonMaterial
      : b.finish === 'metal' || b.finish === 'glass' ? THREE.MeshStandardMaterial : b.shiny ? THREE.MeshPhongMaterial : THREE.MeshLambertMaterial;
    const extra = st.face === 'toon' ? { gradientMap: toonRamp }
      : b.finish === 'metal' ? { metalness: 0.92, roughness: 0.25 }
      : b.finish === 'glass' ? { metalness: 0.1, roughness: 0.03, envMapIntensity: 1.6 }
      : b.shiny ? { shininess: 90, specular: 0x555555 } : {};
    const front = new THREE.Mesh(geo, new Mat({ color: col, map: b.map, ...extra, ...base }));
    const backCol = b.sel ? 0x5f7fb8 : flat ? 0xffffff : 0x9db0c8;
    const back = new THREE.Mesh(geo, new Mat({ color: backCol, side: THREE.BackSide, ...base }));
    front.userData.triFace = back.userData.triFace = b.ids;
    front.castShadow = back.castShadow = !b.dim && !wire && b.op >= 1 && b.finish !== 'glass';
    front.receiveShadow = back.receiveShadow = !flat;
    front.frustumCulled = back.frustumCulled = false;
    target.add(front, back);
    if (!partial) pickMeshes.push(front, back);
    if (st.profiles && !wire && !b.dim) {
      const ol = new THREE.Mesh(geo, outlineMaterial(view.dist * 0.0022 * (st.width || 1), clip));
      ol.frustumCulled = false;
      target.add(ol);
    }
  }

  for (const l of m.lines) {
    if (!vis(l) || (ex && ex.has(l.id))) continue;
    const dst = selection.has(l.id) ? selLines : isDim(l) ? dimLines : lines;
    pushSeg(dst, l.a, l.b);
  }
  for (const g of m.guides || []) guides.push(...g.a, ...g.b);

  const addSegs = (arr, color, dashed, width = 1) => {
    if (!arr.length) return;
    if (width > 1 && !dashed) {
      const g = new LineSegmentsGeometry();
      g.setPositions(arr);
      const mat = new LineMaterial({ color, linewidth: width, ...clip });
      mat.resolution.set(stage.clientWidth, stage.clientHeight);
      fatMats.add(mat);
      const ls = new LineSegments2(g, mat);
      ls.frustumCulled = false;
      target.add(ls);
      return;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3));
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color, dashSize: 0.12, gapSize: 0.07, ...clip })
      : new THREE.LineBasicMaterial({ color, ...clip });
    const ls = new THREE.LineSegments(g, mat);
    if (dashed) ls.computeLineDistances();
    ls.frustumCulled = false;
    target.add(ls);
  };
  const W = st.width || 1;
  addSegs(edges, 0x20242c, false, W);
  addSegs(lines, 0x20242c, false, W);
  addSegs(dimEdges, 0xa2aab6);
  addSegs(dimLines, 0xa2aab6);
  addSegs(selEdges, 0x1d4ed8, false, Math.max(W, 2));
  addSegs(selLines, 0x1d4ed8, false, Math.max(W, 2));
  if (partial) {
    requestRender();
    return;
  }
  addSegs(guides, 0x1c9ad6, true);
  const dimSegs = [];
  for (const d of m.dims || []) {
    const a = V3(d.a), b = V3(d.b), o = V3(d.off);
    const a2 = a.clone().add(o), b2 = b.clone().add(o);
    dimSegs.push(...d.a, ...A(a2), ...d.b, ...A(b2), ...A(a2), ...A(b2));
  }
  addSegs(dimSegs, 0xc0392b);
  syncLabels(m);

  // kotak pembatas untuk grup/komponen yang dipilih
  const selGroups = new Set();
  for (const e of [...m.faces, ...m.lines]) {
    if (!selection.has(e.id)) continue;
    const t = G.topUnder(m, gOf(e), editGroup);
    if (t != null) selGroups.add(t);
  }
  const bb = [];
  for (const gid of selGroups) {
    const box = new THREE.Box3();
    const ids = G.entitiesInTree(m, gid);
    for (const e of m.faces) if (ids.has(e.id)) e.pts.forEach((p) => box.expandByPoint(V3(p)));
    for (const e of m.lines) if (ids.has(e.id)) box.expandByPoint(V3(e.a)).expandByPoint(V3(e.b));
    if (box.isEmpty()) continue;
    box.expandByScalar(0.02);
    const { min: a, max: b } = box;
    const c = [[a.x, a.y, a.z], [b.x, a.y, a.z], [b.x, b.y, a.z], [a.x, b.y, a.z], [a.x, a.y, b.z], [b.x, a.y, b.z], [b.x, b.y, b.z], [a.x, b.y, b.z]];
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) bb.push(...c[i], ...c[j]);
  }
  addSegs(bb, 0x1d4ed8, true);

  // tampilan bidang potong
  if (m.section) {
    const box = G.bboxOf(m);
    const R = box.isEmpty() ? 5 : box.getSize(new THREE.Vector3()).length() * 0.6 + 0.5;
    const n = V3(m.section.n), p0 = V3(m.section.p);
    const ref = Math.abs(n.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(ref, n).normalize(), v = new THREE.Vector3().crossVectors(n, u);
    const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => p0.clone().addScaledVector(u, a * R).addScaledVector(v, b * R));
    const on = m.section.on;
    const sg = new THREE.BufferGeometry().setFromPoints([c[0], c[1], c[1], c[2], c[2], c[3], c[3], c[0]]);
    content.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: on ? 0xe8590c : 0x999999 })));
    const qg = new THREE.BufferGeometry().setFromPoints([c[0], c[1], c[2], c[0], c[2], c[3]]);
    content.add(new THREE.Mesh(qg, new THREE.MeshBasicMaterial({ color: 0xff922b, transparent: true, opacity: on ? 0.08 : 0.04, side: THREE.DoubleSide, depthWrite: false })));
  }

  updateSun(m);
  applyBackground(st);
  requestRender();
}

function setStyle(patch) {
  model.style = { ...styleOf(model), ...patch };
  changed();
}

function refresh() {
  previewOn = false;
  fastEnd();
  rebuild(model);
}

// ---- Pratinjau cepat untuk Pindah/Putar/Skala/Tempatkan ----
// Model diam digambar sekali; bagian yang bergerak digambar terpisah dan hanya digeser lewat matriks,
// jadi tetap mulus walau modelnya berisi puluhan ribu bidang.
const movingGroup = new THREE.Group();
movingGroup.matrixAutoUpdate = false;
scene.add(movingGroup);
let fastIds = null;
function fastBegin(ids, sub = null) {
  previewOn = true;
  fastIds = ids;
  rebuild(model, { exclude: ids });
  fastSetMoving(sub || { ...model, faces: model.faces.filter((f) => ids.has(f.id)), lines: model.lines.filter((l) => ids.has(l.id)) });
}
function fastSetMoving(sub) {
  rebuild(sub, { target: movingGroup, partial: true });
  movingGroup.matrix.identity();
  movingGroup.matrixWorldNeedsUpdate = true;
}
function fastUpdate(M) {
  if (!fastIds) return;
  movingGroup.matrix.copy(M);
  movingGroup.matrixWorldNeedsUpdate = true;
  requestRender();
}
function fastEnd() {
  if (!fastIds) return;
  fastIds = null;
  disposeGroup(movingGroup);
  movingGroup.matrix.identity();
}
const aboutM = (c, M) =>
  new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(M).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
function preview(m) {
  previewOn = true;
  rebuild(m);
}
function clearPreview() {
  if (previewOn) refresh();
}

const labelLayer = $('labels');
function syncLights(m) {
  disposeGroup(lightsGroup);
  for (const L of (m.lights || []).slice(0, 12)) {
    const col = new THREE.Color(L.color || '#ffd59a');
    let light;
    if (L.dir) {
      light = new THREE.SpotLight(col, L.power ?? 30, 0, Math.PI / 5, 0.5, 2);
      light.target.position.set(L.p[0] + L.dir[0], L.p[1] + L.dir[1], L.p[2] + L.dir[2]);
      lightsGroup.add(light.target);
    } else light = new THREE.PointLight(col, L.power ?? 20, 0, 2);
    light.position.set(...L.p);
    lightsGroup.add(light);
    // bola kecil penanda lampu
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: col }));
    bulb.position.set(...L.p);
    lightsGroup.add(bulb);
  }
}

function syncLabels(m) {
  syncLights(m);
  labelLayer.replaceChildren();
  const mk = (text, pos, cls, id, isLabel) => {
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    el._p = pos;
    el.onclick = () => {
      if (toolName !== 'eraser') return;
      G.deleteIds(model, new Set([id]));
      changed();
    };
    if (isLabel) {
      el.ondblclick = () => {
        const lab = model.labels.find((x) => x.id === id);
        if (!lab || toolName !== 'select') return;
        const p = toScreen(pos) || { x: 100, y: 100 };
        askText(p.x, p.y, lab.text, (t) => {
          if (!t) return;
          lab.text = t;
          changed();
        });
      };
    }
    labelLayer.appendChild(el);
  };
  for (const l of m.labels || []) {
    if (l.room != null && (!m.groups[l.room] || !visibleFn({ group: l.room }))) continue;
    mk(l.text, V3(l.p), l.room != null ? 'lbl room' : 'lbl', l.id, true);
  }
  for (const L of m.lights || []) mk(L.dir ? '◉ sorot' : '◉ lampu', V3(L.p), 'lbl lamp', L.id, false);
  for (const d of m.dims || []) {
    const a = V3(d.a), b = V3(d.b);
    mk(fmt(a.distanceTo(b)), a.clone().add(b).multiplyScalar(0.5).add(V3(d.off)), 'lbl dim', d.id, false);
  }
  positionLabels();
}
function positionLabels() {
  for (const el of labelLayer.children) {
    const s = toScreen(el._p);
    el.style.display = s ? 'block' : 'none';
    if (s) el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -110%)`;
  }
}

function askText(x, y, initial, cb) {
  stage.querySelector('.textin')?.remove();
  const inp = document.createElement('input');
  inp.className = 'textin';
  inp.value = initial;
  inp.style.left = x + 'px';
  inp.style.top = y + 'px';
  let done = false;
  const finish = (ok) => {
    if (done) return;
    done = true;
    const v = inp.value.trim();
    inp.remove();
    canvas.focus();
    if (ok) cb(v);
  };
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  inp.addEventListener('blur', () => finish(false));
  stage.appendChild(inp);
  inp.focus();
  inp.select();
}

// ======================= Material & tekstur =======================
const textures = new Map(); // id -> { name, data, scale, builtin }
const texCache = new Map(); // id -> THREE.Texture
renderer.localClippingEnabled = true;

function getTexture(id) {
  if (texCache.has(id)) return texCache.get(id);
  const t = textures.get(id);
  if (!t) return null;
  const tex = new THREE.TextureLoader().load(t.data, () => requestRender());
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texCache.set(id, tex);
  return tex;
}

function uvFrame(f) {
  const N = V3(f.n);
  let o, u;
  if (f.uv) {
    o = V3(f.uv.o);
    u = V3(f.uv.u);
  } else {
    const bs = G.basis(f.n);
    o = N.clone().multiplyScalar(V3(f.pts[0]).dot(N));
    u = bs.u;
  }
  return { o, u, v: new THREE.Vector3().crossVectors(N, u) };
}

// Posisi tekstur per bidang: texScale = lebar (m), texScaleV = tinggi (m), texRot = sudut (°), texOff = geser [u, v] (m).
function texMapper(f) {
  const fr = uvFrame(f);
  const su = f.texScale || 1, sv = f.texScaleV || su;
  const r = ((f.texRot || 0) * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
  const [ou, ov] = f.texOff || [0, 0];
  return (p) => {
    const d = V3(p).sub(fr.o);
    const x = d.dot(fr.u), y = d.dot(fr.v);
    return [(x * c + y * sn - ou) / su, (-x * sn + y * c - ov) / sv];
  };
}

// Pas-kan gambar tepat sekali ke bidang: searah tepi terpanjang, lebar/tinggi = ukuran bidang.
function fitTexture(f) {
  if (!f.tex) return;
  G.ensureUV(f);
  const fr = uvFrame(f);
  const q = f.pts.map((p) => {
    const d = V3(p).sub(fr.o);
    return [d.dot(fr.u), d.dot(fr.v)];
  });
  let best = 0, ang = 0;
  for (let i = 0; i < q.length; i++) {
    const [x0, y0] = q[i], [x1, y1] = q[(i + 1) % q.length];
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (L > best + 1e-9) {
      best = L;
      ang = Math.atan2(y1 - y0, x1 - x0);
    }
  }
  while (ang > Math.PI / 2) ang -= Math.PI;
  while (ang <= -Math.PI / 2) ang += Math.PI;
  const c = Math.cos(ang), sn = Math.sin(ang);
  const r = q.map(([x, y]) => [x * c + y * sn, -x * sn + y * c]);
  const xs = r.map((a) => a[0]), ys = r.map((a) => a[1]);
  f.texRot = (ang * 180) / Math.PI;
  f.texOff = [Math.min(...xs), Math.min(...ys)];
  f.texScale = Math.max(1e-3, Math.max(...xs) - Math.min(...xs));
  f.texScaleV = Math.max(1e-3, Math.max(...ys) - Math.min(...ys));
}

// Ubah posisi tekstur bidang-bidang terpilih yang bertekstur.
function selectedTexFaces() {
  return model.faces.filter((f) => selection.has(f.id) && f.tex && topOf(f) == null);
}
function editTexture(fn, msg) {
  const fs = selectedTexFaces();
  if (!fs.length) return toast('Pilih bidang bertekstur dulu');
  fs.forEach(fn);
  changed();
  if (msg) toast(msg);
}

// Tekstur bawaan, digambar secara prosedural (acak dengan benih tetap).
function makeBuiltinTextures() {
  const rnd = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const mk = (id, name, scale, draw) => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    draw(g, rnd(id.length * 7919 + 13));
    textures.set(id, { name, data: c.toDataURL('image/png'), scale, builtin: true });
  };
  const noise = (g, r, base, amp, n = 3000, size = 3) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < n; i++) {
      const v = Math.floor((r() - 0.5) * amp);
      g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`;
      g.fillRect(r() * 256, r() * 256, size, size);
    }
  };
  mk('b:kayu', 'Kayu', 1, (g, r) => {
    g.fillStyle = '#b07a45';
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y++) {
      const t = Math.sin(y * 0.18 + Math.sin(y * 0.03) * 3) * 0.5 + 0.5;
      g.fillStyle = `rgba(80,45,20,${0.08 + t * 0.22})`;
      g.fillRect(0, y, 256, 1);
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(60,30,10,${0.1 + r() * 0.15})`;
      g.fillRect(0, r() * 256, 256, 1);
    }
    for (let x = 0; x < 256; x += 64) {
      g.fillStyle = 'rgba(50,25,10,.45)';
      g.fillRect(0, x, 256, 2);
    }
  });
  mk('b:bata', 'Bata', 1.2, (g, r) => {
    g.fillStyle = '#d9d2c5';
    g.fillRect(0, 0, 256, 256);
    const bh = 32, bw = 64;
    for (let row = 0; row < 8; row++) {
      for (let col = -1; col < 5; col++) {
        const x = col * bw + (row % 2 ? bw / 2 : 0);
        const k = 0.85 + r() * 0.3;
        g.fillStyle = `rgb(${Math.floor(165 * k)},${Math.floor(72 * k)},${Math.floor(48 * k)})`;
        g.fillRect(x + 3, row * bh + 3, bw - 6, bh - 6);
      }
    }
  });
  mk('b:beton', 'Beton', 2, (g, r) => noise(g, r, '#9c9a95', 70, 6000, 2));
  mk('b:ubin', 'Ubin', 1, (g, r) => {
    g.fillStyle = '#9aa0a6';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const k = 235 + Math.floor(r() * 15);
        g.fillStyle = `rgb(${k},${k},${k - 4})`;
        g.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
      }
  });
  mk('b:rumput', 'Rumput', 2, (g, r) => {
    g.fillStyle = '#4f8a2e';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2500; i++) {
      const x = r() * 256, y = r() * 256;
      g.strokeStyle = `rgba(${40 + r() * 60},${110 + r() * 80},${20 + r() * 40},.8)`;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 5);
      g.stroke();
    }
  });
  mk('b:batu', 'Batu', 1.5, (g, r) => {
    g.fillStyle = '#6d6a64';
    g.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 4; row++) {
      let x = -r() * 40;
      while (x < 256) {
        const w = 40 + r() * 50, k = 0.75 + r() * 0.4;
        g.fillStyle = `rgb(${Math.floor(170 * k)},${Math.floor(164 * k)},${Math.floor(152 * k)})`;
        g.fillRect(x + 3, row * 64 + 3, w - 6, 58);
        x += w;
      }
    }
  });
  mk('b:atap', 'Genteng', 1, (g, r) => {
    g.fillStyle = '#5a1f17';
    g.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 8; row++)
      for (let col = -1; col < 9; col++) {
        const x = col * 32 + (row % 2 ? 16 : 0), y = row * 32;
        g.fillStyle = `rgb(${150 + Math.floor(r() * 40)},${52 + Math.floor(r() * 20)},${38})`;
        g.beginPath();
        g.moveTo(x + 1, y);
        g.lineTo(x + 31, y);
        g.lineTo(x + 31, y + 22);
        g.quadraticCurveTo(x + 16, y + 34, x + 1, y + 22);
        g.fill();
      }
  });
  mk('b:air', 'Air', 2, (g, r) => {
    g.fillStyle = '#3d7fb5';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 300; i++) {
      g.strokeStyle = `rgba(255,255,255,${0.05 + r() * 0.2})`;
      const x = r() * 256, y = r() * 256;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 8, y - 3, x + 16, y);
      g.stroke();
    }
  });
}
makeBuiltinTextures();

let curMat = { color: '#d9b27c', tex: null, scale: 1, scaleV: null, rot: 0, finish: 'matte' };
const SWATCHES = ['#ffffff', '#e9e4d4', '#d9b27c', '#a0522d', '#5c4033', '#f6e51b', '#f08c00', '#e03131', '#c2255c', '#9c36b5',
  '#3b5bdb', '#1c7ed6', '#0ca678', '#2f9e44', '#868e96', '#343a40'];

function renderMatPanel() {
  const sw = $('matSwatches');
  sw.replaceChildren();
  for (const c of SWATCHES) {
    const b = document.createElement('button');
    b.style.background = c;
    b.title = c;
    if (!curMat.tex && curMat.color === c) b.className = 'on';
    b.onclick = () => setMat({ color: c, tex: null, scale: 1 });
    sw.appendChild(b);
  }
  const tx = $('matTextures');
  tx.replaceChildren();
  for (const [id, t] of textures) {
    const b = document.createElement('button');
    b.style.backgroundImage = `url(${t.data})`;
    b.title = t.name;
    if (curMat.tex === id) b.className = 'on';
    b.onclick = () => setMat({ color: '#ffffff', tex: id, scale: t.scale || 1, scaleV: null, rot: 0 });
    tx.appendChild(b);
  }
  $('matScale').value = curMat.scale;
  $('matScaleV').value = curMat.scaleV ?? '';
  $('matFinish').value = curMat.finish || 'matte';
  $('matRot').value = curMat.rot || 0;
  for (const id of ['matScale', 'matScaleV', 'matRot']) $(id).disabled = !curMat.tex;
  $('matName').textContent = curMat.tex ? textures.get(curMat.tex)?.name || 'Tekstur' : curMat.color;
}
function setMat(mt) {
  curMat = { finish: curMat.finish, ...mt };
  renderMatPanel();
}

function importTexture(file) {
  const fr = new FileReader();
  fr.onload = () => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1024 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const id = 'u:' + Date.now().toString(36);
      textures.set(id, { name: file.name.replace(/\.[^.]+$/, ''), data: c.toDataURL('image/jpeg', 0.88), scale: 1 });
      setMat({ color: '#ffffff', tex: id, scale: 1 });
      toast('Tekstur diimpor');
    };
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}

let hoverId = null;
function setHover(id, color = '#4c8bf5') {
  if (id === hoverId && id == null) return;
  disposeGroup(hoverGroup);
  hoverId = id;
  const f = id != null && model.faces.find((x) => x.id === id);
  if (f) {
    const tris = trisOf(f);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris.flat()), 3));
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    hoverGroup.add(new THREE.Mesh(geo, mat));
  }
  requestRender();
}
const hoverGroup = new THREE.Group();
overlay.add(hoverGroup);

function pushHistory() {
  history.length = hi + 1;
  history.push(G.cloneModel(model));
  if (history.length > 200) history.shift();
  hi = history.length - 1;
  if (savedHi > hi) savedHi = -1;
}

function updateTitle() {
  const dirty = hi !== savedHi;
  const name = filePath ? filePath.split(/[\\/]/).pop() : 'Tanpa Judul';
  document.title = `${dirty ? '* ' : ''}${name} - SketchClone`;
  window.api.setDirty(dirty);
}

function pruneSelection() {
  const ids = new Set([...model.faces.map((f) => f.id), ...model.lines.map((l) => l.id), ...model.guides.map((g) => g.id)]);
  selection = new Set([...selection].filter((i) => ids.has(i)));
  if (editGroup != null && !model.groups[editGroup]) editGroup = null;
}

// Dipanggil setelah model berubah lewat sebuah operasi.
function changed() {
  guide.visible = false;
  guide2.visible = false;
  snapCache = null;
  for (let g = editGroup; g != null; g = G.parentOf(model, g)) G.syncComponent(model, g);
  pruneSelection();
  refresh();
  pushHistory();
  updateTitle();
  updateInfo();
}

function restore(i) {
  cancelTool();
  hi = i;
  model = G.cloneModel(history[hi]);
  snapCache = null;
  pruneSelection();
  refresh();
  updateTitle();
  updateInfo();
}
// Kembalikan model ke state riwayat terakhir tanpa membatalkan alat aktif.
function revertToHistory() {
  model = G.cloneModel(history[hi]);
  snapCache = null;
  pruneSelection();
  refresh();
  updateInfo();
}
const undo = () => hi > 0 && restore(hi - 1);
const redo = () => hi < history.length - 1 && restore(hi + 1);

function updateInfo() {
  const sel = [...model.faces, ...model.lines].filter((e) => selection.has(e.id));
  const nf = sel.filter((e) => e.pts).length;
  const nl = sel.length - nf;
  let t = `${model.faces.length} bidang`;
  if (selection.size) {
    const gs = new Set(sel.map(gOf));
    if (gs.size === 1 && !gs.has(null)) {
      const g = model.groups[[...gs][0]];
      t = `${g.def ? 'Komponen' : 'Grup'}: ${g.name}`;
    } else {
      t = `Dipilih: ${nf ? nf + ' bidang' : ''}${nf && nl ? ', ' : ''}${nl ? nl + ' garis' : ''}`;
      if (nf === 1 && nl === 0) t += ` - luas ${fmtArea(G.faceArea(sel[0]))}`;
    }
  }
  if (editGroup != null && model.groups[editGroup]) t = `Mengedit "${model.groups[editGroup].name}" (klik ganda di luar untuk keluar) - ${t}`;
  $('info').textContent = t;
  if (toolName === 'scale' && !(tools.scale && tools.scale.st)) selection.size ? showGrips(expand(selection)) : hideGrips();
  renderTray();
  renderSceneBar();
}

function enterEdit(g) {
  editGroup = g;
  selection = new Set();
  snapCache = null;
  refresh();
  updateInfo();
  toast(`Mengedit ${model.groups[g].name}`);
}
function exitEdit() {
  if (editGroup == null) return;
  editGroup = G.parentOf(model, editGroup);
  selection = new Set();
  snapCache = null;
  refresh();
  updateInfo();
}
const entityOf = (id) =>
  model.faces.find((e) => e.id === id) || model.lines.find((e) => e.id === id) || model.guides.find((e) => e.id === id) || null;

// ======================= Util umum =======================
// Satuan panjang model (Info Model): tampilan & masukan kotak ukuran mengikutinya.
const UNITS = {
  m: { k: 1, s: ' m', a: ' m²' },
  cm: { k: 100, s: ' cm', a: ' cm²' },
  mm: { k: 1000, s: ' mm', a: ' mm²' },
  in: { k: 39.37007874, s: '"', a: ' in²' },
  ft: { k: 3.280839895, s: "'", a: ' ft²' },
};
const unitOf = () => ({ u: 'm', prec: 3, ...(model.units || {}) });
const fmtNum = (x) => (Math.round(x * 1000) / 1000).toString();
const fmt = (x) => {
  const u = unitOf(), U = UNITS[u.u] || UNITS.m;
  return `${+(x * U.k).toFixed(u.prec)}${U.s}`;
};
const fmtArea = (a) => {
  const u = unitOf(), U = UNITS[u.u] || UNITS.m;
  return `${+(a * U.k * U.k).toFixed(u.prec)}${U.a}`;
};
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
const setHint = (t) => ($('hint').textContent = t);

let vcbText = '';
let measure = '';
function renderVCB() {
  const el = $('vcb');
  el.textContent = vcbText || measure;
  el.classList.toggle('typing', !!vcbText);
}
function setMeasure(t) {
  measure = t;
  renderVCB();
}

// Parsing angka dari kotak ukuran. Satuan default meter.
function parseNums(s, expect = 1) {
  let parts;
  if (s.includes(';')) parts = s.split(';');
  else if (expect === 1) parts = [s.replace(',', '.')];
  else parts = s.split(',');
  return parts
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .map((x) => {
      const m = x.match(/^(-?\d*\.?\d+)\s*(mm|cm|m|in|"|ft|')?$/);
      if (!m) return NaN;
      const v = parseFloat(m[1]);
      const unit = { mm: 'mm', cm: 'cm', m: 'm', in: 'in', '"': 'in', ft: 'ft', "'": 'ft' }[m[2]] || unitOf().u;
      return v / (UNITS[unit] || UNITS.m).k;
    });
}

// ======================= Ray, pick, snap =======================
const raycaster = new THREE.Raycaster();
function getRay(ev) {
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.clone();
}

function rayPlane(ray, p, n) {
  const den = n.dot(ray.direction);
  if (Math.abs(den) < 1e-6) return null;
  const t = p.clone().sub(ray.origin).dot(n) / den;
  if (!view.ortho && t < 0) return null;
  if (Math.abs(t) > 6000) return null;
  return ray.origin.clone().addScaledVector(ray.direction, t);
}

// Titik pada garis (p0 + s*u) terdekat dengan sinar; mengembalikan s.
function lineParamNearRay(p0, u, ray) {
  const v = ray.direction;
  const w0 = p0.clone().sub(ray.origin);
  const b = u.dot(v), d = u.dot(w0), e = v.dot(w0);
  const a = u.dot(u);
  const den = a - b * b;
  if (Math.abs(den) < 1e-8) return null;
  return (b * e - d) / den;
}

function ensureBVH() {
  for (const m of pickMeshes) if (!m.geometry.boundsTree && m.geometry.attributes.position.count > 300) m.geometry.computeBoundsTree();
}
let faceIndexCache = { arr: null, len: -1, map: null };
function faceById(id) {
  const c = faceIndexCache;
  if (c.arr !== model.faces || c.len !== model.faces.length) {
    c.arr = model.faces;
    c.len = model.faces.length;
    c.map = new Map(model.faces.map((f) => [f.id, f]));
  }
  const f = c.map.get(id);
  return f && f.id === id ? f : model.faces.find((x) => x.id === id);
}
function pickFace(ev, exclude) {
  getRay(ev);
  ensureBVH();
  for (const h of raycaster.intersectObjects(pickMeshes, false)) {
    const id = h.object.userData.triFace[h.faceIndex];
    if (exclude && exclude.has(id)) continue;
    const face = faceById(id);
    if (!face) continue;
    if (editGroup != null && !G.isInTree(model, gOf(face), editGroup)) continue;
    if (activeClip && activeClip.distanceToPoint(h.point) < -1e-6) continue;
    return { faceId: id, face, point: h.point.clone() };
  }
  return null;
}

function toScreen(v) {
  const r = canvas.getBoundingClientRect();
  const c = v.clone().applyMatrix4(camera.matrixWorldInverse);
  if (!view.ortho && c.z > -0.01) return null;
  const p = v.clone().project(camera);
  return { x: ((p.x + 1) / 2) * r.width, y: ((1 - p.y) / 2) * r.height };
}

function pickLine(ev) {
  const r = canvas.getBoundingClientRect();
  const mx = ev.clientX - r.left, my = ev.clientY - r.top;
  let best = null, bd = 6;
  for (const l of [...model.lines, ...model.guides]) {
    if (!visibleFn(l)) continue;
    const a = toScreen(V3(l.a)), b = toScreen(V3(l.b));
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((mx - a.x) * dx + (my - a.y) * dy) / len2));
    const d = Math.hypot(a.x + dx * t - mx, a.y + dy * t - my);
    if (d < bd) {
      bd = d;
      best = l.id;
    }
  }
  return best;
}

function buildSnap() {
  const vm = new Map(), em = new Map();
  const addV = (p, id) => {
    const k = G.key(p);
    let e = vm.get(k);
    if (!e) vm.set(k, (e = { p: V3(p), ids: [] }));
    e.ids.push(id);
  };
  const addE = (a, b, id) => {
    const ka = G.key(a), kb = G.key(b);
    const k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
    let e = em.get(k);
    if (!e) em.set(k, (e = { a: V3(a), b: V3(b), ids: [] }));
    e.ids.push(id);
  };
  const vis = makeVisible(model);
  for (const f of model.faces) {
    if (!vis(f)) continue;
    for (const loop of [f.pts, ...f.holes]) {
      for (let i = 0; i < loop.length; i++) {
        addV(loop[i], f.id);
        addE(loop[i], loop[(i + 1) % loop.length], f.id);
      }
    }
  }
  for (const l of model.lines) {
    if (!vis(l)) continue;
    addV(l.a, l.id);
    addV(l.b, l.id);
    addE(l.a, l.b, l.id);
  }
  for (const g of model.guides) {
    addV(g.a, g.id);
    addV(g.b, g.id);
    addE(g.a, g.b, g.id);
  }
  snapCache = { verts: [...vm.values()], edges: [...em.values()] };
}

function isVisible(p) {
  let origin, dir, dist;
  if (view.ortho) {
    dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    origin = p.clone().addScaledVector(dir, -3000);
    dist = 3000;
  } else {
    origin = camera.position.clone();
    dir = p.clone().sub(origin);
    dist = dir.length();
    dir.normalize();
  }
  ensureBVH();
  const rc = new THREE.Raycaster(origin, dir, 0, dist - (0.004 * dist + 0.005));
  return rc.intersectObjects(pickMeshes, false).length === 0;
}

let screenCache = null;
function screenSnap() {
  const r = canvas.getBoundingClientRect();
  const key = camera.matrixWorldInverse.elements.join(',') + '|' + camera.projectionMatrix.elements.join(',') + '|' + r.width + 'x' + r.height;
  if (screenCache && screenCache.key === key && screenCache.src === snapCache) return screenCache;
  const proj = (v) => toScreen(v) || { x: NaN, y: NaN };
  screenCache = {
    key,
    src: snapCache,
    verts: snapCache.verts.map((e) => proj(e.p)),
    edges: snapCache.edges.map((e) => [proj(e.a), proj(e.b), proj(e.a.clone().add(e.b).multiplyScalar(0.5))]),
  };
  return screenCache;
}

function snapGeometry(ev, o) {
  if (!snapCache) buildSnap();
  const sc = screenSnap();
  const r = canvas.getBoundingClientRect();
  const mx = ev.clientX - r.left, my = ev.clientY - r.top;
  const ray = getRay(ev);
  const okIds = (ids) => !o.exclude || ids.some((i) => !o.exclude.has(i));
  const cut = (p) => activeClip && activeClip.distanceToPoint(p) < -1e-4;
  const onPlane = (p) => !o.plane || Math.abs(p.clone().sub(o.plane.p).dot(o.plane.n)) < 1e-3;
  const cands = [];

  const V = snapCache.verts;
  for (let i = 0; i < V.length; i++) {
    const s = sc.verts[i];
    const dx = s.x - mx, dy = s.y - my;
    if (!(dx * dx + dy * dy <= 121)) continue; // NaN (di belakang kamera) juga ditolak
    const e = V[i];
    if (!okIds(e.ids) || !onPlane(e.p) || cut(e.p)) continue;
    cands.push({ d: Math.sqrt(dx * dx + dy * dy), p: e.p, kind: 'end' });
  }
  const E = snapCache.edges;
  for (let i = 0; i < E.length; i++) {
    const [sa, sb, sm] = sc.edges[i];
    // tolak cepat: jarak titik ke ruas di layar
    let near = false, dm = Infinity;
    if (sm.x === sm.x) {
      dm = Math.hypot(sm.x - mx, sm.y - my);
      if (dm <= 11) near = true;
    }
    if (!near) {
      if (!(sa.x === sa.x && sb.x === sb.x)) {
        if (sa.x === sa.x || sb.x === sb.x) near = true; // satu ujung di belakang kamera: cek teliti
      } else {
        const ex = sb.x - sa.x, ey = sb.y - sa.y, L2 = ex * ex + ey * ey || 1;
        const t = Math.max(0, Math.min(1, ((mx - sa.x) * ex + (my - sa.y) * ey) / L2));
        if (Math.hypot(sa.x + ex * t - mx, sa.y + ey * t - my) <= 9) near = true;
      }
    }
    if (!near) continue;
    const e = E[i];
    if (!okIds(e.ids) || !onPlane(e.a) || !onPlane(e.b) || (cut(e.a) && cut(e.b))) continue;
    if (dm <= 11) cands.push({ d: dm + 2, p: e.a.clone().add(e.b).multiplyScalar(0.5), kind: 'mid', a: e.a, b: e.b });
    const u = e.b.clone().sub(e.a);
    let t = lineParamNearRay(e.a, u, ray);
    if (t == null) continue;
    t = Math.max(0, Math.min(1, t));
    const p = e.a.clone().addScaledVector(u, t);
    const sp = toScreen(p);
    if (!sp) continue;
    const d = Math.hypot(sp.x - mx, sp.y - my);
    if (d <= 7) cands.push({ d: d + 8, p, kind: 'edge', a: e.a, b: e.b });
  }
  cands.sort((a, b) => a.d - b.d);
  for (const c of cands.slice(0, 6)) if (isVisible(c.p)) return c;
  return null;
}

let lockAxis = null; // 0,1,2 atau null

function airNormal(ray) {
  const d = ray.direction;
  if (Math.abs(d.z) > 0.25) return AXES[2];
  return Math.abs(d.x) > Math.abs(d.y) ? AXES[0] : AXES[1];
}

// Titik kerja di bawah kursor dengan snap/inferensi.
// o: { anchor, plane:{p,n}, exclude:Set }
// Titik yang baru dilewati kursor (untuk inferensi "dari titik") dan tepi acuan (untuk sejajar/tegak lurus).
const trackPts = [];
let refEdge = null;
const PAR_COL = '#d6336c';

function screenDist(p, ev) {
  const s = toScreen(p);
  if (!s) return Infinity;
  const r = canvas.getBoundingClientRect();
  return Math.hypot(s.x - (ev.clientX - r.left), s.y - (ev.clientY - r.top));
}

// Titik kerja di bawah kursor dengan snap/inferensi.
// o: { anchor, plane:{p,n}, exclude:Set }
function inferPoint(ev, o = {}) {
  const ray = getRay(ev);
  let p = null, kind = '', axis = null, label = '', n = null, track = null, par = null;

  if (o.anchor && lockAxis != null) {
    const s = lineParamNearRay(o.anchor, AXES[lockAxis], ray);
    p = o.anchor.clone().addScaledVector(AXES[lockAxis], s || 0);
    return { p, kind: 'axis', axis: lockAxis, label: `Terkunci pada sumbu ${AXNAME[lockAxis]}` };
  }

  const g = snapGeometry(ev, o);
  if (g) {
    p = g.p.clone();
    kind = g.kind;
    label = { end: 'Titik akhir', mid: 'Titik tengah', edge: 'Pada garis' }[g.kind];
    if (g.kind === 'end' && !trackPts.some((t) => t.distanceTo(g.p) < 1e-6)) {
      trackPts.unshift(g.p.clone());
      trackPts.length = Math.min(trackPts.length, 2);
    }
    if (g.a && g.b) refEdge = { a: g.a.clone(), b: g.b.clone() };
  } else if (o.plane) {
    p = rayPlane(ray, o.plane.p, o.plane.n);
    kind = 'plane';
    n = o.plane.n;
  } else {
    const hit = pickFace(ev, o.exclude);
    if (hit) {
      p = hit.point;
      kind = 'face';
      label = 'Pada bidang';
      n = V3(hit.face.n);
    } else if (o.anchor) {
      n = airNormal(ray);
      p = rayPlane(ray, o.anchor, n);
      kind = 'air';
    } else {
      p = rayPlane(ray, new THREE.Vector3(), AXES[2]);
      kind = 'ground';
      n = AXES[2];
    }
  }
  if (!p) return null;
  const free = ['face', 'air', 'ground', 'plane'].includes(kind);

  // 1) searah sumbu dari titik jangkar
  if (o.anchor && free) {
    const d = p.clone().sub(o.anchor);
    const L = d.length();
    if (L > 1e-3) {
      for (let i = 0; i < 3; i++) {
        const comp = d.dot(AXES[i]);
        const perp = d.clone().addScaledVector(AXES[i], -comp);
        if (perp.length() < L * 0.03 && Math.abs(comp) > 1e-3) {
          p = o.anchor.clone().addScaledVector(AXES[i], comp);
          axis = i;
          kind = 'axis';
          label = `Pada sumbu ${AXNAME[i]}`;
          break;
        }
      }
    }
  }

  // 2) sejajar / tegak lurus terhadap tepi acuan
  if (o.anchor && kind !== 'axis' && free && refEdge) {
    const d = p.clone().sub(o.anchor);
    const L = d.length();
    const dir = refEdge.b.clone().sub(refEdge.a).normalize();
    const cands = [['par', dir, 'Sejajar dengan tepi']];
    if (n) {
      const w = new THREE.Vector3().crossVectors(dir, n);
      if (w.length() > 1e-6) cands.push(['perp', w.normalize(), 'Tegak lurus tepi']);
    }
    if (L > 1e-3) {
      for (const [k, u, lab] of cands) {
        const comp = d.dot(u);
        if (d.clone().addScaledVector(u, -comp).length() < L * 0.025 && Math.abs(comp) > 1e-3) {
          p = o.anchor.clone().addScaledVector(u, comp);
          kind = 'par';
          label = lab;
          par = k;
          break;
        }
      }
    }
  }

  // 3) dari titik: sejajar sumbu dengan titik yang baru dilewati kursor
  if (kind === 'axis' && o.anchor) {
    for (const T of trackPts) {
      for (let b = 0; b < 3; b++) {
        if (b === axis) continue;
        const sOn = lineParamNearRay(o.anchor, AXES[axis], { origin: T, direction: AXES[b] });
        if (sOn == null) continue;
        const q = o.anchor.clone().addScaledVector(AXES[axis], sOn);
        const tOn = q.clone().sub(T).dot(AXES[b]);
        const onLine = T.clone().addScaledVector(AXES[b], tOn);
        if (onLine.distanceTo(q) > 1e-4 || q.distanceTo(T) < 1e-4) continue;
        if (screenDist(q, ev) < 10) {
          p = q;
          track = { from: T.clone(), axis: b };
          label = `Dari titik (sumbu ${AXNAME[b]})`;
          break;
        }
      }
      if (track) break;
    }
  } else if (free && kind !== 'par') {
    for (const T of trackPts) {
      for (let b = 0; b < 3; b++) {
        const t = lineParamNearRay(T, AXES[b], ray);
        if (t == null || Math.abs(t) < 1e-3) continue;
        const q = T.clone().addScaledVector(AXES[b], t);
        if (o.plane && Math.abs(q.clone().sub(o.plane.p).dot(o.plane.n)) > 1e-3) continue;
        if (screenDist(q, ev) < 7) {
          p = q;
          kind = 'track';
          track = { from: T.clone(), axis: b };
          label = `Dari titik (sumbu ${AXNAME[b]})`;
          break;
        }
      }
      if (track) break;
    }
  }
  return { p, kind, axis, label, track, par };
}

const snapEl = $('snap');
function showSnap(res, anchor) {
  if (!res) {
    hideSnap();
    return;
  }
  const s = toScreen(res.p);
  const visible = s && res.label;
  snapEl.style.display = visible ? 'block' : 'none';
  if (visible) {
    snapEl.style.transform = `translate(${s.x}px, ${s.y}px)`;
    snapEl.className = res.kind;
    snapEl.querySelector('span').textContent = res.label;
  }
  if (anchor && (res.axis != null || res.par)) {
    guide.geometry.setFromPoints([anchor, res.p]);
    guide.material.color.set(res.par ? PAR_COL : AXCOL[res.axis]);
    guide.visible = true;
  } else {
    guide.visible = false;
  }
  if (res.track) {
    guide2.geometry.setFromPoints([res.track.from, res.p]);
    guide2.computeLineDistances();
    guide2.material.color.set(AXCOL[res.track.axis]);
    guide2.visible = true;
  } else guide2.visible = false;
  requestRender();
}
function hideSnap() {
  snapEl.style.display = 'none';
  guide.visible = false;
  guide2.visible = false;
  requestRender();
}

// ======================= Alat =======================
const tools = {};
let tool = null;
let toolName = '';
let lastEv = null;

function cancelTool() {
  tool && tool.cancel && tool.cancel();
  clearPreview();
  hideSnap();
  setHover(null);
  setMeasure('');
  vcbText = '';
  renderVCB();
}

function setTool(name) {
  cancelTool();
  hideGrips();
  tool = tools[name];
  toolName = name;
  lockAxis = null;
  document.querySelectorAll('#toolbar [data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === name));
  setHint(tool.hint);
  canvas.style.cursor = tool.cursor || 'crosshair';
  if (name === 'paint') showTray('mat');
  tool.activate && tool.activate();
}

const hoverFace = (ev, color) => {
  const hit = pickFace(ev);
  setHover(hit ? hit.faceId : null, color);
  return hit;
};

// ---- Pilih ----
tools.select = {
  label: 'Pilih (Spasi)', key: ' ', cursor: 'default',
  icon: '<path d="M6 3l12 9-5.5 1.2L15 19l-2.5 1-2.5-5.5L6 18z" fill="currentColor"/>',
  hint: 'Klik untuk memilih, seret kotak (kiri→kanan: di dalam, kanan→kiri: menyentuh). Shift/Ctrl: tambah. Klik ganda: pilih objek / masuk grup. Klik kanan: menu.',
  box: null,
  move(ev) {
    if (this.box && ev.buttons & 1) {
      const dx = ev.clientX - this.box.x, dy = ev.clientY - this.box.y;
      if (!this.box.active && Math.hypot(dx, dy) > 5) this.box.active = true;
      if (this.box.active) {
        drawSelBox(this.box.x, this.box.y, ev.clientX, ev.clientY);
        setHover(null);
        return;
      }
    }
    hoverFace(ev, '#7fb0ff');
  },
  up(ev) {
    const b = this.box;
    this.box = null;
    $('selbox').hidden = true;
    if (!b || !b.active) return;
    if (!b.add) selection = new Set(b.keep);
    boxSelect(b.x, b.y, ev.clientX, ev.clientY);
    refresh();
    updateInfo();
  },
  down(ev) {
    this.box = { x: ev.clientX, y: ev.clientY, add: ev.shiftKey || ev.ctrlKey, active: false, keep: [] };
    const lid = pickLine(ev);
    const hit = pickFace(ev);
    const id = lid != null ? lid : hit ? hit.faceId : null;
    if (id == null) {
      if (!ev.shiftKey) selection = new Set();
    } else {
      let ids = new Set([id]);
      const e = entityOf(id);
      const t = topOf(e);
      if (t != null) ids = G.entitiesInTree(model, t);
      if (ev.shiftKey) {
        const all = [...ids].every((i) => selection.has(i));
        ids.forEach((i) => (all ? selection.delete(i) : selection.add(i)));
      } else selection = ids;
    }
    refresh();
    updateInfo();
  },
  dbl(ev) {
    const hit = pickFace(ev);
    if (!hit) {
      exitEdit();
      return;
    }
    const g = topOf(hit.face);
    if (g != null) {
      enterEdit(g);
      return;
    }
    const ids = expand(new Set([hit.faceId]));
    if (ev.shiftKey) ids.forEach((i) => selection.add(i));
    else selection = ids;
    refresh();
    updateInfo();
  },
};

function drawSelBox(x0, y0, x1, y1) {
  const r = stage.getBoundingClientRect();
  const el = $('selbox');
  el.hidden = false;
  el.classList.toggle('cross', x1 < x0);
  Object.assign(el.style, {
    left: Math.min(x0, x1) - r.left + 'px',
    top: Math.min(y0, y1) - r.top + 'px',
    width: Math.abs(x1 - x0) + 'px',
    height: Math.abs(y1 - y0) + 'px',
  });
}

// Pilih dengan kotak: kiri→kanan = seluruhnya di dalam (window), kanan→kiri = menyentuh (crossing).
function boxSelect(x0, y0, x1, y1) {
  const r = canvas.getBoundingClientRect();
  const minx = Math.min(x0, x1) - r.left, maxx = Math.max(x0, x1) - r.left;
  const miny = Math.min(y0, y1) - r.top, maxy = Math.max(y0, y1) - r.top;
  const crossing = x1 < x0;
  const inside = (s) => s && s.x >= minx && s.x <= maxx && s.y >= miny && s.y <= maxy;
  // segmen layar memotong kotak? (Liang–Barsky)
  const segHits = (a, b) => {
    if (!a || !b) return false;
    let t0 = 0, t1 = 1;
    const dx = b.x - a.x, dy = b.y - a.y;
    for (const [p, q] of [[-dx, a.x - minx], [dx, maxx - a.x], [-dy, a.y - miny], [dy, maxy - a.y]]) {
      if (Math.abs(p) < 1e-9) {
        if (q < 0) return false;
      } else {
        const t = q / p;
        if (p < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
        if (t0 > t1) return false;
      }
    }
    return true;
  };
  const vis = makeVisible(model);
  const units = new Map();
  for (const e of [...model.faces, ...model.lines]) {
    if (!vis(e)) continue;
    if (editGroup != null && !G.isInTree(model, gOf(e), editGroup)) continue;
    if (activeClip && (e.pts || [e.a, e.b]).every((p) => activeClip.distanceToPoint(V3(p)) < -1e-4)) continue;
    const t = topOf(e);
    const k = t != null ? 'g' + t : 'e' + e.id;
    let u = units.get(k);
    if (!u) units.set(k, (u = { ids: t != null ? G.entitiesInTree(model, t) : new Set([e.id]), loops: [] }));
    u.loops.push(e.pts ? [e.pts, ...e.holes] : [[e.a, e.b]]);
  }
  for (const u of units.values()) {
    const loops = u.loops.flat().map((l) => l.map((p) => toScreen(V3(p))));
    let ok;
    if (crossing) {
      ok = loops.some((l) => l.some(inside) || l.some((a, i) => segHits(a, l[(i + 1) % l.length])));
    } else ok = loops.every((l) => l.every(inside));
    if (ok) u.ids.forEach((i) => selection.add(i));
  }
}

// ---- Garis ----
tools.line = {
  label: 'Garis (L)', key: 'l',
  icon: '<path d="M5 19L19 5"/><circle cx="5" cy="19" r="1.8" fill="currentColor"/><circle cx="19" cy="5" r="1.8" fill="currentColor"/>',
  hint: 'Klik titik awal, klik titik berikutnya. Ketik panjang + Enter. Panah: kunci sumbu (→ merah, ← hijau, ↑ biru). Loop tertutup jadi bidang. Esc: selesai.',
  start: null, cur: null,
  cancel() { this.start = null; this.cur = null; },
  down(ev) {
    const r = inferPoint(ev, { anchor: this.start });
    if (!r) return;
    if (!this.start) this.start = r.p.clone();
    else this.commitTo(r.p);
  },
  commitTo(p) {
    const res = G.addLine(model, A(this.start), A(p), editGroup);
    if (!res) return;
    if (res.face) {
      this.start = null;
      selection = new Set([res.face.id]);
      toast('Bidang dibuat');
    } else {
      this.start = p.clone();
    }
    this.cur = null;
    changed();
  },
  move(ev) {
    const r = inferPoint(ev, { anchor: this.start });
    showSnap(r, this.start);
    if (!r) return;
    this.cur = r.p;
    if (this.start) {
      const pm = G.cloneModel(model);
      G.addLine(pm, A(this.start), A(r.p), editGroup);
      preview(pm);
      setMeasure(fmt(r.p.distanceTo(this.start)));
    }
  },
  onVCB(t) {
    if (!this.start || !this.cur) return;
    const [L] = parseNums(t);
    const dir = this.cur.clone().sub(this.start);
    if (!(L > 0) || dir.length() < 1e-6) return;
    this.commitTo(this.start.clone().addScaledVector(dir.normalize(), L));
  },
  onLock() { lastEv && this.move(lastEv); },
};

// ---- Persegi panjang & lingkaran (bidang kerja) ----
function planeAt(ev) {
  const hit = pickFace(ev);
  if (hit) return { p: hit.point.clone(), n: V3(hit.face.n) };
  return { p: new THREE.Vector3(), n: AXES[2].clone() };
}
function planeAxes(n) {
  let u;
  if (Math.abs(n.z) > 0.999) u = AXES[0].clone();
  else u = new THREE.Vector3().crossVectors(AXES[2], n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  return { u, v };
}

tools.rect = {
  label: 'Persegi panjang (R)', key: 'r',
  icon: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
  hint: 'Klik sudut pertama, klik sudut berlawanan. Ketik "lebar,tinggi" + Enter (mis. 3,2). Gambar di atas bidang untuk membuat lubang/tonjolan.',
  p0: null,
  cancel() { this.p0 = null; },
  corners(p, w, h) {
    const { u, v } = this.ax;
    return [this.p0, this.p0.clone().addScaledVector(u, w), this.p0.clone().addScaledVector(u, w).addScaledVector(v, h), this.p0.clone().addScaledVector(v, h)];
  },
  down(ev) {
    if (!this.p0) {
      const plane = planeAt(ev);
      const r = inferPoint(ev, { plane });
      if (!r) return;
      this.plane = plane;
      this.p0 = r.p.clone();
      this.ax = planeAxes(plane.n);
    } else {
      const r = inferPoint(ev, { plane: this.plane });
      if (r) this.finish(r.p.clone().sub(this.p0).dot(this.ax.u), r.p.clone().sub(this.p0).dot(this.ax.v));
    }
  },
  finish(w, h) {
    if (Math.abs(w) < 1e-4 || Math.abs(h) < 1e-4) return;
    const f = G.addFace(model, this.corners(null, w, h).map(A), this.plane.n, editGroup);
    this.p0 = null;
    if (f) changed();
  },
  move(ev) {
    if (!this.p0) {
      showSnap(inferPoint(ev, { plane: planeAt(ev) }));
      return;
    }
    const r = inferPoint(ev, { plane: this.plane });
    showSnap(r);
    if (!r) return;
    const d = r.p.clone().sub(this.p0);
    this.w = d.dot(this.ax.u);
    this.h = d.dot(this.ax.v);
    const pm = G.cloneModel(model);
    G.addFace(pm, this.corners(null, this.w, this.h).map(A), this.plane.n, editGroup);
    preview(pm);
    setMeasure(`${fmt(Math.abs(this.w))} , ${fmt(Math.abs(this.h))}`);
  },
  onVCB(t) {
    if (!this.p0) return;
    const nums = parseNums(t, 2);
    if (!nums.length || nums.some(isNaN)) return;
    const sw = (this.w ?? 1) < 0 ? -1 : 1, sh = (this.h ?? 1) < 0 ? -1 : 1;
    const w = Math.abs(nums[0]) * sw;
    const h = nums.length > 1 ? Math.abs(nums[1]) * sh : Math.abs(this.h ?? nums[0]) * sh;
    this.finish(w, h);
  },
};

// ---- Kurva halus (spline melalui titik-titik) ----
function splinePoints(P, closed, per = 8) {
  const n = P.length;
  if (n < 2) return P.slice();
  const get = (i) => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
  const out = [];
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push(new THREE.Vector3(
        0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
      ));
    }
  }
  if (!closed) out.push(P[n - 1].clone());
  return out;
}
function addPolyline(m, pts, closed) {
  const seq = closed ? [...pts, pts[0]] : pts;
  for (let i = 0; i < seq.length - 1; i++) G.addLine(m, A(seq[i]), A(seq[i + 1]), editGroup);
}

tools.spline = {
  label: 'Kurva Halus',
  icon: '<path d="M3 17c3-9 6-9 9-4s6 5 9-4"/><circle cx="3" cy="17" r="1.6" fill="currentColor"/><circle cx="12" cy="13" r="1.6" fill="currentColor"/><circle cx="21" cy="9" r="1.6" fill="currentColor"/>',
  hint: 'Klik titik-titik yang dilalui kurva. Klik titik pertama lagi untuk menutup (jadi bidang). Enter atau klik ganda untuk selesai. Esc: batal.',
  pts: [],
  cancel() { this.pts = []; },
  down(ev) {
    const r = inferPoint(ev, { anchor: this.pts[this.pts.length - 1] });
    if (!r) return;
    if (this.pts.length >= 3 && (r.p.distanceTo(this.pts[0]) < 1e-6 || screenDist(this.pts[0], ev) < 10)) return this.finish(true);
    if (this.pts.length && r.p.distanceTo(this.pts[this.pts.length - 1]) < 1e-6) return;
    this.pts.push(r.p.clone());
  },
  dbl() { this.finish(false); },
  onEnter() { this.finish(false); },
  finish(closed) {
    if (this.pts.length >= 2) {
      addPolyline(model, splinePoints(this.pts, closed), closed);
      changed();
    }
    this.pts = [];
  },
  move(ev) {
    const r = inferPoint(ev, { anchor: this.pts[this.pts.length - 1] });
    showSnap(r, this.pts[this.pts.length - 1]);
    if (!r || !this.pts.length) return;
    const pm = G.cloneModel(model);
    addPolyline(pm, splinePoints([...this.pts, r.p], false), false);
    preview(pm);
  },
};

// ---- Gambar bebas (freehand) ----
tools.freehand = {
  label: 'Gambar Bebas',
  icon: '<path d="M4 18c2-6 4-1 6-5s3-7 5-5 1 6 5 4"/>',
  hint: 'Tekan dan seret untuk menggambar bebas di bidang/tanah. Lepaskan dekat titik awal untuk menutup (jadi bidang).',
  stroke: null,
  cancel() { this.stroke = null; },
  pointAt(ev) { return rayPlane(getRay(ev), this.stroke.plane.p, this.stroke.plane.n); },
  down(ev) {
    const plane = planeAt(ev);
    const r = inferPoint(ev, { plane });
    if (!r) return;
    this.stroke = { plane, pts: [r.p.clone()], sx: ev.clientX, sy: ev.clientY };
  },
  move(ev) {
    if (!this.stroke) {
      showSnap(inferPoint(ev, { plane: planeAt(ev) }));
      return;
    }
    const p = this.pointAt(ev);
    if (!p) return;
    const last = this.stroke.pts[this.stroke.pts.length - 1];
    if (p.distanceTo(last) < view.dist * 0.008) return;
    this.stroke.pts.push(p);
    const pm = G.cloneModel(model);
    addPolyline(pm, this.stroke.pts, false);
    preview(pm);
  },
  up(ev) {
    const st = this.stroke;
    this.stroke = null;
    if (!st || st.pts.length < 3) return clearPreview();
    const closed = Math.hypot(ev.clientX - st.sx, ev.clientY - st.sy) < 14 && st.pts.length > 4;
    if (closed) st.pts.pop();
    addPolyline(model, st.pts, closed);
    changed();
  },
};

// ---- Dinding dari denah ----
tools.wall = {
  label: 'Dinding',
  icon: '<path d="M3 20V9l6-3v14M9 20V6l6 3v11M15 20V9l6-3v14"/>',
  hint: 'Klik titik-titik denah di lantai. Klik titik pertama untuk ruang tertutup, Enter/klik ganda untuk dinding terbuka. Ketik "tebal;tinggi" + Enter sebelum mulai (sekarang 0.15;2.8).',
  t: 0.15, h: 2.8, pts: [],
  cancel() { this.pts = []; },
  activate() { setHint(`Klik titik-titik denah. Klik titik pertama untuk ruang tertutup, Enter untuk dinding terbuka. Ketik "tebal;tinggi" (sekarang ${fmt(this.t)} ; ${fmt(this.h)}).`); },
  plane() { return { p: this.pts[0] ? this.pts[0].clone() : new THREE.Vector3(0, 0, curLevel().z), n: AXES[2] }; },
  build(m, pts, closed) {
    const fp = G.wallFootprint(pts.map(A), this.t, closed);
    if (!fp) return null;
    const f = G.makeFace(m, fp.pts, AXES[2], '#efece6');
    if (!f) return null;
    f.holes = fp.holes;
    f.group = editGroup;
    m.faces.push(f);
    G.pushPull(m, f.id, this.h);
    return f.solid;
  },
  down(ev) {
    const r = inferPoint(ev, { anchor: this.pts[this.pts.length - 1], plane: this.plane() });
    if (!r) return;
    if (this.pts.length >= 3 && (r.p.distanceTo(this.pts[0]) < 1e-6 || screenDist(this.pts[0], ev) < 10)) return this.finish(true);
    if (this.pts.length && r.p.distanceTo(this.pts[this.pts.length - 1]) < 1e-6) return;
    const p = r.p.clone();
    p.z = this.pts.length ? this.pts[0].z : curLevel().z;
    this.pts.push(p);
  },
  dbl() { this.finish(false); },
  onEnter() { this.finish(false); },
  finish(closed) {
    const sid = this.pts.length >= 2 ? this.build(model, this.pts, closed) : null;
    if (sid != null) {
      levelTag(C.makeWallGroup(model, sid, { t: this.t, h: this.h, pts: this.pts.map(A), closed }, editGroup));
      changed();
    } else {
      if (this.pts.length >= 2) toast('Denah tidak valid');
      clearPreview();
    }
    this.pts = [];
  },
  move(ev) {
    const anchor = this.pts[this.pts.length - 1];
    const r = inferPoint(ev, { anchor, plane: this.pts.length ? this.plane() : null });
    showSnap(r, anchor);
    if (!r || !this.pts.length) return;
    const p = r.p.clone();
    p.z = this.pts[0].z;
    const pm = { ...model, faces: [], lines: [], nextId: model.nextId };
    this.build(pm, [...this.pts, p], false);
    if (!fastIds) fastBegin(new Set(), pm);
    else fastSetMoving(pm);
    setMeasure(fmt(p.distanceTo(anchor)));
  },
  onVCB(t) {
    const nums = parseNums(t, 2);
    if (!this.pts.length) {
      if (nums[0] > 0) this.t = nums[0];
      if (nums[1] > 0) this.h = nums[1];
      this.activate();
      return toast(`Dinding: tebal ${fmt(this.t)}, tinggi ${fmt(this.h)}`);
    }
    // panjang segmen berikutnya searah kursor
    const last = this.pts[this.pts.length - 1];
    if (!(nums[0] > 0) || !lastEv) return;
    const r = inferPoint(lastEv, { anchor: last, plane: this.plane() });
    if (!r) return;
    const d = r.p.clone().sub(last).setZ(0);
    if (d.length() < 1e-6) return;
    this.pts.push(last.clone().addScaledVector(d.normalize(), nums[0]));
  },
};

// ======================= Konstruksi: lantai, kusen, ruang =======================
function curLevel() {
  const L = C.levelsOf(model);
  return L[Math.min(model.activeLevel || 0, L.length - 1)];
}
function newTag(name) {
  const t = { id: model.nextId++, name, visible: true, color: TAG_COLORS[model.tags.length % TAG_COLORS.length] };
  model.tags.push(t);
  return t.id;
}
function levelTag(gid) {
  const lv = curLevel();
  if (gid != null && lv.tag != null && model.groups[gid] && model.groups[gid].tag == null) model.groups[gid].tag = lv.tag;
  return gid;
}
function nextLevelHeight() {
  const L = C.levelsOf(model), i = Math.min(model.activeLevel || 0, L.length - 1);
  return L[i + 1] ? L[i + 1].z - L[i].z : L[i].h;
}
let stairShape = 'lurus';
function ceilingZ() {
  const z = curLevel().z, sz = roomSliceZ(z);
  return sz - z > 1.01 ? sz + 0.1 : z + 2.8;
}
function placeMepTool(kind) {
  const it = C.MEP[kind];
  toast(`${it.name}: klik ${it.mount === 'ceiling' ? 'lantai/plafon ruangan (dipasang di plafon)' : it.mount === 'wall' ? `bidang dinding (tinggi ${fmt(it.z)} dari lantai)` : 'lantai, atau dinding agar punggungnya menempel'}. Panah kiri/kanan memutar.`);
  startPlace({
    label: it.name,
    gen: (m, at, n, angle) => {
      const real = m === model;
      const opt = real
        ? { levelZ: curLevel().z, ceilingZ: ceilingZ(), parent: editGroup }
        : { levelZ: it.mount === 'wall' ? -it.z : 0, ceilingZ: 0 };
      const r = C.placeMep(m, kind, at, n, angle, opt);
      if (real) levelTag(r.gid);
      return r;
    },
  });
}
function buildAllStructure() {
  const walls = Object.entries(model.groups).filter(([, g]) => g.wall);
  if (!walls.length) return toast('Belum ada dinding. Gambar dinding dengan alat Dinding dulu.');
  let tag = model.tags.find((t) => t.name === 'Struktur');
  if (!tag) { newTag('Struktur'); tag = model.tags[model.tags.length - 1]; }
  const z0 = C.levelsOf(model)[0].z;
  let n = 0;
  for (const [gid, g] of walls) if (C.buildStructure(model, +gid, { ground: Math.abs(g.wall.pts[0][2] - z0) < 0.1, tag: tag.id }) != null) n++;
  // hapus struktur yang dindingnya sudah tidak ada
  for (const [k, sg] of Object.entries(model.groups)) if (sg.struct && !model.groups[sg.struct.wall]?.wall) G.deleteIds(model, G.entitiesInTree(model, +k));
  changed();
  toast(`Struktur dibuat untuk ${n} dinding: kolom praktis, ring balok, sloof & pondasi`);
}
function toggleStructView(on) {
  for (const g of Object.values(model.groups)) if (g.wall || g.room) g.hidden = on;
  snapCache = null;
  changed();
}
// ---- Renovasi: tandai eksisting / dibongkar / baru ----
function topGroupsOfSelection(looseName) {
  const tops = new Set(), loose = new Set();
  for (const e of [...model.faces, ...model.lines]) {
    if (!selection.has(e.id)) continue;
    let g = gOf(e);
    if (g === editGroup) { loose.add(e.id); continue; }
    while (g != null && (model.groups[g]?.parent ?? null) !== editGroup) g = model.groups[g]?.parent ?? null;
    if (g != null) tops.add(g);
  }
  if (loose.size && looseName) tops.add(G.makeGroup(model, expand(loose), looseName, false, editGroup));
  return tops;
}
function markPhase(phase) {
  if (!selection.size) return toast('Pilih bagian bangunan dulu (dinding, atap, ruang, kusen, plat, ...), lalu klik fasenya.');
  const tops = topGroupsOfSelection(C.PHASE_LABEL[phase]);
  C.setPhase(model, [...tops], phase);
  model.reno = { view: 'warna', ...(model.reno || {}) };
  changed();
  toast(`${tops.size} objek ditandai ${C.PHASE_LABEL[phase]}`);
}
function markAllExisting() {
  const tops = Object.entries(model.groups).filter(([, g]) => (g.parent ?? null) === null && !g.struct).map(([k]) => +k);
  const loose = new Set(model.faces.filter((f) => f.group == null).map((f) => f.id));
  if (loose.size) tops.push(G.makeGroup(model, loose, 'Eksisting', false, null));
  if (!tops.length) return toast('Model masih kosong. Gambar dulu kondisi bangunan yang sudah ada.');
  C.setPhase(model, tops, 'exist');
  model.reno = { ...(model.reno || {}), view: 'warna' };
  changed();
  toast(`Kondisi sekarang (${tops.length} objek) ditandai Eksisting. Semua yang digambar setelah ini dihitung sebagai pekerjaan Baru.`);
}
function setRenoView(v) {
  model.reno = { ...(model.reno || {}), view: v };
  snapCache = null;
  changed();
}

// ---- Elemen struktur: plat, balok, kolom + cek struktur ----
const strukDim = { t: 0.12, bw: 0.15, bh: 0.3, cb: 0.2 };
function offsetPoly(P, d) {
  const sa = P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
  const Q = sa < 0 ? P.slice().reverse() : P;
  const n = Q.length;
  const lines = Q.map((a, i) => {
    const b = Q[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L;
    return { a: [a[0] + nx * d, a[1] + ny * d], u: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] };
  });
  return Q.map((_, i) => {
    const l1 = lines[(i - 1 + n) % n], l2 = lines[i];
    const den = l1.u[0] * l2.u[1] - l1.u[1] * l2.u[0];
    if (Math.abs(den) < 1e-6) return l2.a;
    const t = ((l2.a[0] - l1.a[0]) * l2.u[1] - (l2.a[1] - l1.a[1]) * l2.u[0]) / den;
    return [l1.a[0] + l1.u[0] * t, l1.a[1] + l1.u[1] * t];
  });
}
function elemTag(gid, z) {
  const L = C.levelsOf(model), lv = L[C.levelAt(model, z)];
  if (gid != null && lv?.tag != null && model.groups[gid]) model.groups[gid].tag = lv.tag;
  return gid;
}
function slabFromSelection() {
  const ids = expand(selection);
  const L = C.levelsOf(model);
  const made = [];
  const rooms = new Set();
  for (const f of model.faces) if (ids.has(f.id) && model.groups[f.group]?.room) rooms.add(f.group);
  for (const rg of rooms) {
    const r = model.groups[rg].room, f = model.faces.find((q) => q.group === rg);
    if (!f) continue;
    const li = C.levelAt(model, r.z), zTop = L[li + 1] ? L[li + 1].z : r.z + L[li].h;
    made.push(elemTag(C.makeSlab(model, offsetPoly(f.pts.map((p) => [p[0], p[1]]), 0.075), zTop, strukDim.t, editGroup), zTop - 0.5));
  }
  for (const f of model.faces.filter((q) => ids.has(q.id) && Math.abs(q.n[2]) > 0.99 && !model.groups[q.group]?.room && !model.groups[q.group]?.slab)) {
    const zTop = f.pts[0][2];
    const gid = C.makeSlab(model, f.pts.map((p) => [p[0], p[1]]), zTop, strukDim.t, editGroup);
    if (gid == null) continue;
    made.push(elemTag(gid, zTop - 0.5));
    if (f.solid == null) G.deleteIds(model, new Set([f.id]));
  }
  if (!made.length) return toast('Pilih ruang (plat dibuat di atasnya, setebal pengaturan) atau gambar persegi di ketinggian atas plat lalu pilih bidangnya.');
  selection = new Set();
  changed();
  toast(`${made.length} plat beton ${Math.round(strukDim.t * 100)} cm dibuat. Klik "Cek struktur" untuk memeriksa tumpuannya.`);
}
function beamsFromSelection() {
  const ids = expand(selection);
  let n = 0;
  for (const l of model.lines) {
    if (!ids.has(l.id) || Math.abs(l.a[2] - l.b[2]) > 0.01) continue;
    if (elemTag(C.makeBeam(model, [l.a[0], l.a[1]], [l.b[0], l.b[1]], l.a[2], strukDim.bw, strukDim.bh, editGroup), l.a[2] - 0.5) != null) n++;
  }
  const slabs = new Set();
  for (const f of model.faces) if (ids.has(f.id) && model.groups[f.group]?.slab) slabs.add(f.group);
  for (const sg of slabs) {
    const sl = model.groups[sg].slab;
    for (const [a, b] of S.slabFreeEdges(model, sg)) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const h = Math.max(strukDim.bh, Math.ceil((L / 12) * 20 - 1e-9) / 20);
      if (elemTag(C.makeBeam(model, a, b, sl.z, Math.max(strukDim.bw, Math.ceil(h * 0.4 * 20 - 1e-9) / 20), h, editGroup), sl.z - 0.5) != null) n++;
    }
  }
  if (!n) return toast('Pilih garis datar (as balok, digambar di ketinggian atas balok) atau pilih plat untuk membuat balok di tepi yang belum ditopang.');
  selection = new Set();
  changed();
  toast(`${n} balok dibuat. Klik "Cek struktur" untuk memeriksa ukuran & tumpuannya.`);
}
function placeColumnTool() {
  const lv = curLevel(), H = nextLevelHeight(), b = strukDim.cb, ground = (model.activeLevel || 0) === 0;
  toast(`Kolom struktur ${Math.round(b * 100)}/${Math.round(b * 100)} setinggi ${fmt(H)}${ground ? ' + footplat 80×80' : ''}: klik titik kolom.`);
  startPlace({
    label: 'Kolom struktur',
    gen: (m, at) => {
      const real = m === model;
      const gid = C.makeColumn(m, at.x, at.y, real ? lv.z : 0, H, b, { foot: ground ? 0.8 : 0, depth: 1.0 }, real ? editGroup : null);
      if (real) levelTag(gid);
      return { gid, ids: G.entitiesInTree(m, gid) };
    },
  });
}
let lastCheck = null;
const strukTag = () => model.tags.find((t) => t.name === 'Struktur')?.id;
function runStructCheck() {
  lastCheck = S.structCheck(model);
  showTray('kons');
  renderKonsPane();
  const n = lastCheck.n;
  toast(n.err ? `Cek struktur: ${n.err} masalah serius, ${n.warn} peringatan — lihat panel Konstruksi` : n.warn ? `Cek struktur: ${n.warn} peringatan, tidak ada masalah serius` : 'Cek struktur: semua elemen memenuhi aturan praktis');
  return lastCheck;
}
function tagNewElems() {
  for (const [k, g] of Object.entries(model.groups)) {
    if (g.tag != null) continue;
    if (g.slab || g.beam) elemTag(+k, (g.slab || g.beam).z - 0.5);
    else if (g.column) elemTag(+k, g.column.z + 0.1);
  }
}
function applyStructFix(fix) {
  S.applyFix(model, fix, { parent: editGroup, tag: strukTag() });
  tagNewElems();
  lastCheck = S.structCheck(model);
  changed();
}
function fixAllStruct() {
  let n = 0;
  for (let it = 0; it < 5; it++) {
    const fx = S.structCheck(model).items.filter((x) => x.fix && x.lvl !== 'ok');
    if (!fx.length) break;
    for (const x of fx) n += S.applyFix(model, x.fix, { parent: editGroup, tag: strukTag() });
  }
  tagNewElems();
  lastCheck = S.structCheck(model);
  changed();
  toast(`${n} perbaikan diterapkan · sisa ${lastCheck.n.err} masalah, ${lastCheck.n.warn} peringatan`);
  return lastCheck;
}

function placeStairTool(opt = {}) {
  const sp = C.stairSpec(nextLevelHeight(), { shape: stairShape, ...opt });
  toast(`Tangga ${sp.n} anak tangga (optrede ${fmt(sp.R)}, antrede ${fmt(sp.T)}), panjang ${fmt(sp.n * sp.T)}. Klik kaki tangga; panah kiri/kanan memutar.`);
  startPlace({
    label: 'Tangga',
    gen: (m, at, n, angle) => {
      const base = at.clone();
      if (m === model) base.z = curLevel().z; // kaki tangga selalu di lantai aktif
      const r = C.placeStair(m, base, angle, sp, m === model ? editGroup : null);
      if (m === model) {
        levelTag(r.gid);
        const rid = C.cutStairVoid(model, r.gid);
        setTimeout(() => toast(rid != null ? `Lantai ruang "${model.groups[rid].room.name}" di atasnya otomatis dilubangi` : 'Tangga ditempatkan (tidak ada ruang lantai atas yang menutupinya)'), 50);
      }
      return r;
    },
  });
}
function addLevel() {
  const L = C.levelsOf(model);
  if (L.length === 1 && L[0].tag == null) {
    L[0].tag = newTag(L[0].name);
    for (const g of Object.values(model.groups)) if ((g.parent ?? null) === null && g.tag == null && (g.wall || g.room)) g.tag = L[0].tag;
  }
  const last = L[L.length - 1];
  const lv = { name: 'Lantai ' + (L.length + 1), z: +(last.z + last.h).toFixed(3), h: last.h, tag: null };
  lv.tag = newTag(lv.name);
  L.push(lv);
  model.activeLevel = L.length - 1;
  changed();
  toast(`${lv.name} ditambahkan (elevasi ${fmt(lv.z)}). Dinding & ruang baru digambar di lantai ini.`);
}
// tinggi irisan denah: sedikit di bawah puncak dinding terendah di lantai ini
function roomSliceZ(z) {
  let h = Infinity;
  for (const g of Object.values(model.groups)) if (g.wall && Math.abs((g.wall.pts[0]?.[2] ?? 0) - z) < 0.1) h = Math.min(h, g.wall.h);
  return z + (Number.isFinite(h) ? h - 0.1 : 1.0);
}
function planePoint(ev, z) {
  const ray = getRay(ev);
  return ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), new THREE.Vector3());
}

const openingTool = (type) => ({
  label: type === 'pintu' ? 'Kusen Pintu' : 'Kusen Jendela',
  icon: type === 'pintu'
    ? '<path d="M6 21V3h12v18M3 21h18"/><path d="M15 12h.5"/>'
    : '<rect x="4" y="5" width="16" height="14"/><path d="M12 5v14M4 12h16"/>',
  hint: '',
  o: { ...C.OPENING_DEFAULTS[type] },
  activate() {
    const o = this.o;
    setHint(`Arahkan ke bidang dinding lalu klik: ${type} ${fmt(o.w)} × ${fmt(o.h)}${type === 'jendela' ? `, tinggi ambang ${fmt(o.sill)}` : ''}. Ketik "lebar;tinggi${type === 'jendela' ? ';ambang' : ''}" + Enter untuk mengubah ukuran. Dinding otomatis berlubang.`);
  },
  move(ev) {
    const hit = pickFace(ev);
    const fr = hit && C.openingFrame(model, hit.faceId, hit.point, this.o);
    if (!fr || fr.error) {
      if (fastIds) { fastEnd(); refresh(); }
      setMeasure(fr && fr.error ? fr.error : '');
      return;
    }
    const pm = { ...model, faces: [], lines: [], groups: {}, nextId: model.nextId };
    C.buildKusen(pm, type, fr.w, fr.h, fr.t, fr.M);
    if (!fastIds) fastBegin(new Set(), pm);
    else fastSetMoving(pm);
    setMeasure(`${fmt(fr.w)} × ${fmt(fr.h)} · tebal dinding ${fmt(fr.t)}`);
  },
  down(ev) {
    const hit = pickFace(ev);
    if (!hit) return;
    if (fastIds) fastEnd();
    const r = C.placeOpening(model, hit.faceId, hit.point, type, this.o);
    if (r.error) return toast(r.error);
    changed();
    toast(`${type === 'pintu' ? 'Pintu' : 'Jendela'} dipasang; dinding dilubangi otomatis`);
  },
  cancel() { if (fastIds) { fastEnd(); refresh(); } },
  onVCB(t) {
    const n = parseNums(t, 3);
    if (n[0] > 0) this.o.w = n[0];
    if (n[1] > 0) this.o.h = n[1];
    if (n[2] >= 0) this.o.sill = n[2];
    this.activate();
  },
});
tools.pintu = openingTool('pintu');
tools.jendela = openingTool('jendela');

tools.room = {
  label: 'Ruang (luas lantai)',
  icon: '<path d="M4 4h16v16H4zM13 4v7M4 14h6"/>',
  hint: 'Klik di dalam ruangan yang dikelilingi dinding untuk menamai ruang & menghitung luasnya.',
  activate() { setHint(`Klik di dalam ruangan tertutup dinding (${curLevel().name}). Nama + luas tampil di model, denah PDF, dan RAB.`); },
  down(ev) {
    const z = curLevel().z;
    const p = planePoint(ev, z);
    if (!p) return;
    const vis = makeVisible(model);
    const out = C.roomOutline(model, p.x, p.y, roomSliceZ(z), (f) => vis(f) && !model.groups[f.group]?.room);
    if (!out) return toast('Titik ini tidak berada di ruang yang tertutup dinding');
    const n = Object.values(model.groups).filter((g) => g.room).length + 1;
    const r0 = stage.getBoundingClientRect();
    askText(ev.clientX - r0.left, ev.clientY - r0.top, 'Ruang ' + n, (name) => {
      if (!name) return;
      levelTag(C.makeRoom(model, out, name, z, { parent: editGroup }));
      changed();
      toast(`${name}: ${out.area.toFixed(2)} m²`);
    });
  },
  move(ev) {
    const p = planePoint(ev, curLevel().z);
    showSnap(p ? { p, kind: 'on' } : null);
  },
};

// ---- Persegi sudut bulat ----
tools.rrect = Object.assign(Object.create(tools.rect), {
  label: 'Persegi Sudut Bulat',
  icon: '<rect x="3.5" y="5.5" width="17" height="13" rx="4.5"/>',
  hint: 'Ketik radius + Enter sebelum menggambar (sekarang 0.2 m). Klik sudut pertama dan sudut berlawanan, atau ketik "lebar,tinggi".',
  radius: 0.2,
  activate() { setHint(`Ketik radius + Enter sebelum menggambar (sekarang ${fmt(this.radius)}). Klik sudut pertama dan sudut berlawanan, atau ketik "lebar,tinggi".`); },
  corners(p, w, h) {
    const sq = tools.rect.corners.call(this, p, w, h).map(A);
    return G.filletLoop(sq, A(this.plane.n), this.radius).map(V3);
  },
  onVCB(t) {
    if (!this.p0) {
      const [r] = parseNums(t);
      if (r >= 0) {
        this.radius = r;
        this.activate();
        toast(`Radius sudut: ${fmt(r)}`);
      }
      return;
    }
    tools.rect.onVCB.call(this, t);
  },
});

tools.circle = {
  label: 'Lingkaran (C)', key: 'c',
  icon: '<circle cx="12" cy="12" r="8"/>',
  hint: 'Klik titik pusat, klik/ketik jari-jari + Enter.',
  p0: null,
  cancel() { this.p0 = null; },
  points(r) {
    const { u, v } = this.ax;
    const pts = [];
    const N = this.seg || 32;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      pts.push(A(this.p0.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r)));
    }
    return pts;
  },
  down(ev) {
    if (!this.p0) {
      const plane = planeAt(ev);
      const r = inferPoint(ev, { plane });
      if (!r) return;
      this.plane = plane;
      this.p0 = r.p.clone();
      this.ax = planeAxes(plane.n);
    } else if (this.r > 1e-4) this.finish(this.r);
  },
  finish(r) {
    if (!(r > 1e-4)) return;
    const f = G.addFace(model, this.points(r), this.plane.n, editGroup);
    this.p0 = null;
    this.r = 0;
    if (f) changed();
  },
  move(ev) {
    if (!this.p0) {
      showSnap(inferPoint(ev, { plane: planeAt(ev) }));
      return;
    }
    const res = inferPoint(ev, { plane: this.plane });
    showSnap(res);
    if (!res) return;
    this.r = res.p.distanceTo(this.p0);
    if (this.r < 1e-4) return;
    const pm = G.cloneModel(model);
    G.addFace(pm, this.points(this.r), this.plane.n, editGroup);
    preview(pm);
    setMeasure(fmt(this.r));
  },
  onVCB(t) {
    if (!this.p0) return;
    const [r] = parseNums(t);
    this.finish(r);
  },
};

// ---- Dorong/Tarik ----
let lastPull = 0;
tools.pushpull = {
  label: 'Dorong/Tarik (P)', key: 'p',
  icon: '<path d="M4 9l8-4 8 4v8l-8 4-8-4z"/><path d="M4 9l8 4 8-4M12 13v8"/>',
  hint: 'Klik bidang, gerakkan mouse, klik lagi. Atau ketik jarak + Enter. Klik ganda pada bidang lain: ulangi jarak terakhir.',
  pp: null,
  cancel() { this.pp = null; },
  down(ev) {
    if (this.pp) return this.commit(this.pp.d);
    const hit = pickFace(ev);
    if (!hit) return;
    if (topOf(hit.face) != null) {
      toast('Klik ganda grup untuk mengeditnya dulu');
      return;
    }
    selection = new Set();
    this.pp = { id: hit.faceId, n: V3(hit.face.n), p0: hit.point.clone(), d: 0 };
    // hanya solid yang ditarik yang dihitung ulang saat pratinjau
    const sid = hit.face.solid;
    this.pp.ids = new Set(model.faces.filter((f) => (sid != null ? f.solid === sid : f.id === hit.faceId)).map((f) => f.id));
    setHover(null);
    fastBegin(this.pp.ids);
  },
  commit(d) {
    if (Math.abs(d) < 1e-4) {
      this.pp = null;
      refresh();
      return;
    }
    G.pushPull(model, this.pp.id, d);
    lastPull = d;
    this.pp = null;
    changed();
  },
  move(ev) {
    if (!this.pp) {
      hoverFace(ev, '#7fb0ff');
      return;
    }
    const s = lineParamNearRay(this.pp.p0, this.pp.n, getRay(ev));
    if (s == null) return;
    this.pp.d = Math.round(s * 1000) / 1000;
    const sub = { ...model, faces: model.faces.filter((f) => this.pp.ids.has(f.id)).map((f) => structuredClone(f)), lines: [], nextId: model.nextId };
    G.pushPull(sub, this.pp.id, this.pp.d);
    fastSetMoving(sub);
    requestRender();
    setMeasure(fmt(this.pp.d));
  },
  dbl(ev) {
    if (this.pp || !lastPull) return;
    const hit = pickFace(ev);
    if (!hit) return;
    if (topOf(hit.face) != null) return;
    G.pushPull(model, hit.faceId, lastPull);
    changed();
  },
  onVCB(t) {
    if (!this.pp) return;
    let [d] = parseNums(t);
    if (isNaN(d)) return;
    if (d > 0 && this.pp.d < 0) d = -d;
    this.commit(d);
  },
};

// ---- Pindah ----
function selectionForTransform(ev) {
  if (!selection.size && ev) {
    const hit = pickFace(ev);
    if (hit) {
      const t = topOf(hit.face);
      selection = t != null ? G.entitiesInTree(model, t) : new Set([hit.faceId]);
    }
  }
  if (!selection.size) {
    toast('Pilih objek dulu dengan alat Pilih (Spasi)');
    return null;
  }
  return expand(selection);
}

// Larik (array) setelah menyalin dengan Pindah/Putar: ketik "5x" atau "/5".
let lastArray = null;
function applyArray(t) {
  const txt = t.trim().toLowerCase();
  let m = txt.match(/^(\d+)\s*[x*]$|^[x*]\s*(\d+)$/), mode = 'mul', n;
  if (m) n = +(m[1] || m[2]);
  else if ((m = txt.match(/^\/\s*(\d+)$/))) {
    mode = 'div';
    n = +m[1];
  } else return false;
  const la = lastArray;
  if (!la) {
    toast('Salin dulu (tahan Ctrl dengan Pindah/Putar), lalu ketik 5x atau /5');
    return true;
  }
  if (!(n >= 1 && n <= 500)) return true;
  if (hi !== la.hi) {
    if (la.applied === hi) {
      hi = la.hi;
      model = G.cloneModel(history[hi]);
    } else {
      lastArray = null;
      toast('Larik hanya bisa langsung setelah menyalin');
      return true;
    }
  }
  const T = (ids, f) =>
    la.kind === 'move' ? G.translate(model, ids, la.delta.clone().multiplyScalar(f)) : G.rotate(model, ids, la.center, la.axis, la.ang * f);
  if (mode === 'div') T(new Set(la.copyIds), 1 / n - 1);
  const all = new Set(la.copyIds);
  for (let i = 2; i <= n; i++) {
    const ids = G.duplicate(model, la.src, editGroup);
    T(ids, mode === 'mul' ? i : i / n);
    ids.forEach((x) => all.add(x));
  }
  selection = all;
  changed();
  la.applied = hi;
  toast(mode === 'mul' ? `Larik: ${n} salinan` : `Dibagi rata: ${n} salinan`);
  return true;
}

tools.move = {
  label: 'Pindah (M)', key: 'm',
  icon: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  hint: 'Klik objek terpilih (atau bidang/garis/titik untuk meregangkan), gerakkan, klik lagi. Ctrl: salin, lalu ketik 5x atau /5 untuk larik. Panah: kunci sumbu.',
  base: null, ids: null, copy: false, stretch: null,
  cancel() {
    this.base = null;
    this.ids = null;
    this.stretch = null;
    if (this.copy) {
      this.copy = false;
      revertToHistory();
    }
  },
  // target regang: titik, tepi, atau bidang di bawah kursor (hanya geometri yang bisa diedit langsung)
  stretchTarget(ev) {
    const g = snapGeometry(ev, {});
    const inScope = (ids) => ids.some((id) => {
      const e = entityOf(id);
      return e && topOf(e) == null && (editGroup == null ? gOf(e) == null : G.isInTree(model, gOf(e), editGroup));
    });
    if (g && (g.kind === 'end' || g.a)) {
      const keys = g.kind === 'end' ? [G.key(A(g.p))] : [G.key(A(g.a)), G.key(A(g.b))];
      const owners = model.faces.filter((f) => [f.pts, ...f.holes].some((l) => l.some((q) => keys.includes(G.key(q))))).map((f) => f.id)
        .concat(model.lines.filter((l) => keys.includes(G.key(l.a)) || keys.includes(G.key(l.b))).map((l) => l.id));
      if (owners.length && inScope(owners)) return { keys: new Set(keys), owners };
    }
    const lid = pickLine(ev);
    if (lid != null) {
      const l = entityOf(lid);
      if (l && l.a && inScope([lid])) return { keys: new Set([G.key(l.a), G.key(l.b)]), owners: [lid] };
    }
    const hit = pickFace(ev);
    if (hit && topOf(hit.face) == null) {
      const keys = new Set([hit.face.pts, ...hit.face.holes].flat().map(G.key));
      const owners = model.faces.filter((f) => [f.pts, ...f.holes].some((l) => l.some((q) => keys.has(G.key(q))))).map((f) => f.id);
      return { keys, owners };
    }
    return null;
  },
  down(ev) {
    if (this.base) {
      if (this.delta) this.finish(this.delta);
      return;
    }
    const r = inferPoint(ev, { exclude: new Set() });
    if (!r) return;
    // tanpa pilihan & tanpa Ctrl: regangkan bidang/tepi/titik yang diklik
    if (!selection.size && !ev.ctrlKey) {
      const st = this.stretchTarget(ev);
      if (st) {
        this.stretch = st;
        this.ids = new Set(st.owners);
        this.base = r.p.clone();
        setHover(null);
        return;
      }
    }
    const ids = selectionForTransform(ev);
    if (!ids) return;
    this.src = ids;
    this.ids = ids;
    if (ev.ctrlKey) {
      this.ids = G.duplicate(model, ids, editGroup);
      selection = new Set(this.ids);
      this.copy = true;
    }
    this.base = r.p.clone();
    updateInfo();
    fastBegin(this.ids);
  },
  apply(m, delta) {
    if (this.stretch) G.stretch(m, this.stretch.keys, delta, editGroup);
    else G.translate(m, this.ids, delta);
  },
  finish(delta) {
    this.apply(model, delta);
    const copied = this.copy;
    if (copied) lastArray = { kind: 'move', src: this.src, copyIds: [...this.ids], delta: delta.clone() };
    this.base = null;
    this.ids = null;
    this.delta = null;
    this.copy = false;
    this.stretch = null;
    changed();
    if (copied) lastArray.hi = hi;
  },
  move(ev) {
    if (!this.base) {
      if (!selection.size) {
        const g = snapGeometry(ev, {});
        if (g && (g.kind === 'end' || g.a)) {
          setHover(null);
          showSnap({ p: g.p, kind: g.kind, label: g.kind === 'end' ? 'Regangkan titik' : 'Regangkan tepi' });
        } else {
          hoverFace(ev, '#7fb0ff');
          hideSnap();
        }
      }
      return;
    }
    const r = inferPoint(ev, { anchor: this.base, exclude: this.ids });
    showSnap(r, this.base);
    if (!r) return;
    this.delta = r.p.clone().sub(this.base);
    setMeasure(fmt(this.delta.length()));
    if (!this.stretch) {
      fastUpdate(new THREE.Matrix4().makeTranslation(this.delta.x, this.delta.y, this.delta.z));
      return;
    }
    if (this.delta.length() < 1e-6) return;
    const pm = G.cloneModel(model);
    this.apply(pm, this.delta);
    preview(pm);
  },
  onVCB(t) {
    if (!this.base) {
      applyArray(t);
      return;
    }
    if (!this.delta) return;
    const [L] = parseNums(t);
    if (!(L > 0) || this.delta.length() < 1e-6) return;
    this.finish(this.delta.clone().normalize().multiplyScalar(L));
  },
  onLock() { lastEv && this.move(lastEv); },
};
tools.rotate = {
  label: 'Putar (Q)', key: 'q',
  icon: '<path d="M19.5 12a7.5 7.5 0 1 1-2.6-5.7M19.5 4v5h-5"/>',
  hint: 'Pilih objek (atau klik langsung). Klik titik pusat, klik titik acuan, gerakkan, klik lagi. Ctrl di klik pertama: salin, lalu ketik 6x untuk larik melingkar. Ketik sudut + Enter. Panah: sumbu.',
  st: 0, copy: false, ax: null,
  cancel() {
    this.st = 0;
    this.ref = null;
    this.ids = null;
    if (this.copy) {
      this.copy = false;
      revertToHistory();
    }
  },
  axis() { return lockAxis != null ? AXES[lockAxis] : this.ax || AXES[2]; },
  planePoint(ev) { return rayPlane(getRay(ev), this.center, this.axis()); },
  down(ev) {
    if (this.st === 0) {
      const ids = selectionForTransform(ev);
      if (!ids) return;
      const r = inferPoint(ev, { exclude: new Set() });
      if (!r) return;
      this.src = ids;
      this.ids = ids;
      if (ev.ctrlKey) {
        this.ids = G.duplicate(model, ids, editGroup);
        selection = new Set(this.ids);
        this.copy = true;
      }
      this.center = r.p.clone();
      this.ax = null;
      const hit = pickFace(ev);
      if (hit) {
        const n = V3(hit.face.n);
        const ai = AXES.findIndex((a) => Math.abs(n.dot(a)) > 0.999);
        this.ax = ai >= 0 ? AXES[ai].clone() : n;
      }
      this.st = 1;
      updateInfo();
      fastBegin(this.ids);
    } else if (this.st === 1) {
      const p = this.planePoint(ev);
      if (!p) return;
      const v = p.sub(this.center);
      if (v.length() < 1e-3) return;
      this.ref = v;
      this.st = 2;
    } else this.finish(this.ang || 0);
  },
  finish(ang) {
    const copied = this.copy;
    if (Math.abs(ang) > 1e-6) G.rotate(model, this.ids, this.center, this.axis(), ang);
    if (copied) lastArray = { kind: 'rotate', src: this.src, copyIds: [...this.ids], center: this.center.clone(), axis: this.axis().clone(), ang };
    this.copy = false;
    this.st = 0;
    this.ref = null;
    this.ids = null;
    changed();
    if (copied) lastArray.hi = hi;
  },
  move(ev) {
    if (this.st === 0) {
      if (!selection.size) hoverFace(ev, '#7fb0ff');
      showSnap(inferPoint(ev));
      return;
    }
    const p = this.planePoint(ev);
    if (!p) return;
    const ac = AXCOL[lockAxis ?? (this.ax ? AXES.findIndex((a) => a.equals(this.ax)) : 2)] || '#888';
    if (this.st === 1) {
      guide.geometry.setFromPoints([this.center, p]);
      guide.material.color.set(ac);
      guide.visible = true;
      requestRender();
      return;
    }
    const v2 = p.clone().sub(this.center);
    const axis = this.axis();
    let ang = Math.atan2(this.ref.clone().cross(v2).dot(axis), this.ref.dot(v2));
    if (!ev.altKey) ang = Math.round(ang / THREE.MathUtils.degToRad(5)) * THREE.MathUtils.degToRad(5);
    this.ang = ang;
    fastUpdate(aboutM(this.center, new THREE.Matrix4().makeRotationAxis(axis, ang)));
    guide.geometry.setFromPoints([this.center, this.center.clone().add(v2)]);
    guide.material.color.set(ac);
    guide.visible = true;
    setMeasure(`${fmtNum(THREE.MathUtils.radToDeg(ang))}°`);
  },
  onVCB(t) {
    if (this.st === 0) {
      applyArray(t);
      return;
    }
    if (this.st !== 2) return;
    const a = parseFloat(t.replace(',', '.'));
    if (!isNaN(a)) this.finish(THREE.MathUtils.degToRad(a));
  },
  onLock() {
    if (this.st > 0) {
      this.st = 1;
      this.ref = null;
      fastUpdate(new THREE.Matrix4());
    }
  },
};

// ---- Skala ----
// Pegangan skala di layar (seperti SketchUp): sudut = rata, tepi = 2 sumbu, muka = 1 sumbu.
const gripLayer = $('grips');
let gripState = null; // { ids, box, grips: [{p, mask:[bool,bool,bool], opp}] }
function showGrips(ids) {
  if (!ids || !ids.size) return hideGrips();
  const box = G.bboxOf(model, ids);
  if (box.isEmpty()) return hideGrips();
  const v = [box.min, box.getCenter(new THREE.Vector3()), box.max];
  const grips = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) {
        if (i === 1 && j === 1 && k === 1) continue;
        const p = new THREE.Vector3(v[i].x, v[j].y, v[k].z);
        const opp = new THREE.Vector3(v[2 - i].x, v[2 - j].y, v[2 - k].z);
        const mask = [i !== 1, j !== 1, k !== 1];
        // abaikan sumbu yang tebalnya nol (mis. bidang datar)
        const size = box.getSize(new THREE.Vector3());
        for (let a = 0; a < 3; a++) if (size.getComponent(a) < 1e-6) mask[a] = false;
        if (!mask.some(Boolean)) continue;
        grips.push({ p, opp, mask, n: mask.filter(Boolean).length });
      }
  gripState = { ids, box, grips };
  gripLayer.replaceChildren(...grips.map((g) => mkEl('i', { className: 'grip g' + g.n })));
  positionGrips();
}
function hideGrips() {
  gripState = null;
  if (gripLayer) gripLayer.replaceChildren();
}
function positionGrips() {
  if (!gripState) return;
  gripState.grips.forEach((g, i) => {
    const el = gripLayer.children[i];
    const sp = toScreen(g.p);
    if (!el) return;
    el.style.display = sp ? 'block' : 'none';
    if (sp) el.style.transform = `translate(${sp.x}px, ${sp.y}px)`;
  });
}
function gripAt(ev) {
  if (!gripState) return null;
  let best = null, bd = 9;
  for (const g of gripState.grips) {
    const d = screenDist(g.p, ev);
    if (d < bd) {
      bd = d;
      best = g;
    }
  }
  return best;
}

tools.scale = {
  label: 'Skala (S)', key: 's',
  icon: '<path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/>',
  hint: 'Seret pegangan hijau: sudut = skala rata, tepi = dua sumbu, sisi = satu sumbu (dari pegangan seberang). Atau klik titik acuan lalu gerakkan; panah mengunci sumbu. Ketik 2 atau "1;2;0.5".',
  st: null,
  activate() { if (selection.size) showGrips(expand(selection)); },
  cancel() {
    this.st = null;
    hideGrips();
  },
  down(ev) {
    if (this.st) return this.finish(this.st.f);
    const grip = gripAt(ev);
    if (grip) {
      const ray = getRay(ev);
      this.st = { ids: gripState.ids, c: grip.opp.clone(), grip, pn: airNormal(ray), p0: grip.p.clone(), f: [1, 1, 1] };
      fastBegin(this.st.ids);
      return;
    }
    const ids = selectionForTransform(ev);
    if (!ids) return;
    const box = G.bboxOf(model, ids);
    const c = box.getCenter(new THREE.Vector3());
    if (!ev.ctrlKey) c.z = box.min.z; // skala dari alas agar benda tetap menapak
    const ray = getRay(ev);
    const pn = airNormal(ray);
    const p = rayPlane(ray, c, pn);
    if (!p) return;
    this.st = { ids, c, pn, p0: p.clone(), f: [1, 1, 1] };
    updateInfo();
    showGrips(ids);
    fastBegin(ids);
  },
  move(ev) {
    if (!this.st) {
      if (!selection.size) hoverFace(ev, '#7fb0ff');
      return;
    }
    const st = this.st;
    if (st.grip) {
      const g = st.grip, ray = getRay(ev);
      const d0 = g.p.clone().sub(st.c);
      let f = [1, 1, 1];
      if (g.n === 1) {
        // satu sumbu: titik pada garis sumbu itu yang paling dekat dengan kursor
        const a = g.mask.indexOf(true), ax = AXES[a];
        const t = lineParamNearRay(g.p, ax, ray);
        if (t == null) return;
        const den = d0.getComponent(a);
        f[a] = Math.round(((den + t) / den) * 100) / 100;
      } else {
        const p = rayPlane(ray, g.p, airNormal(ray));
        if (!p) return;
        const d1 = p.clone().sub(st.c);
        if (g.n === 3) {
          const k = Math.round((d1.dot(d0) / d0.lengthSq()) * 100) / 100;
          f = [k, k, k];
        } else for (let a = 0; a < 3; a++) if (g.mask[a]) f[a] = Math.round((d1.getComponent(a) / d0.getComponent(a)) * 100) / 100;
      }
      f = f.map((x) => (Math.abs(x) < 0.01 ? 0.01 : x));
      st.f = f;
      fastUpdate(aboutM(st.c, new THREE.Matrix4().makeScale(...f)));
      setMeasure(f.every((x) => x === f[0]) ? fmtNum(f[0]) : f.map(fmtNum).join(' ; '));
      return;
    }
    const p = rayPlane(getRay(ev), st.c, st.pn);
    if (!p) return;
    const d0 = st.p0.clone().sub(st.c), d1 = p.clone().sub(st.c);
    let f;
    if (lockAxis != null) {
      const a = AXES[lockAxis], den = d0.dot(a);
      if (Math.abs(den) < 1e-4) return setMeasure('geser titik acuan menjauh di sumbu itu');
      let k = Math.round((d1.dot(a) / den) * 100) / 100;
      if (Math.abs(k) < 0.01) k = 0.01 * (Math.sign(k) || 1);
      f = [1, 1, 1];
      f[lockAxis] = k;
    } else {
      const L0 = d0.length();
      if (L0 < 1e-4) return;
      const k = Math.max(0.01, Math.min(100, Math.round((d1.length() / L0) * 100) / 100));
      f = [k, k, k];
    }
    st.f = f;
    fastUpdate(aboutM(st.c, new THREE.Matrix4().makeScale(...f)));
    guide.geometry.setFromPoints([st.c, p]);
    guide.material.color.set(lockAxis != null ? AXCOL[lockAxis] : '#888888');
    guide.visible = true;
    setMeasure(f.every((x) => x === f[0]) ? fmtNum(f[0]) : f.map(fmtNum).join(' ; '));
  },
  finish(f) {
    const ids = this.st.ids;
    if (f.some((x) => Math.abs(x - 1) > 1e-6)) G.scaleAxes(model, ids, this.st.c, ...f);
    this.st = null;
    changed();
    showGrips(ids);
  },
  onVCB(t) {
    if (!this.st && gripState) {
      // tanpa menyeret: ketik faktor langsung, dari pusat bawah
      const c = gripState.box.getCenter(new THREE.Vector3());
      c.z = gripState.box.min.z;
      this.st = { ids: gripState.ids, c, f: [1, 1, 1] };
    }
    if (!this.st) return;
    const txt = t.trim();
    const parts = txt.includes(';') ? txt.split(';') : (txt.match(/,/g) || []).length >= 2 ? txt.split(',') : [txt.replace(',', '.')];
    const nums = parts.map((x) => parseFloat(x)).filter((x) => !isNaN(x));
    let f = null;
    if (nums.length === 1) {
      f = lockAxis != null ? [1, 1, 1] : [nums[0], nums[0], nums[0]];
      if (lockAxis != null) f[lockAxis] = nums[0];
    } else if (nums.length === 2) f = [nums[0], nums[1], 1];
    else if (nums.length === 3) f = nums;
    if (!f || f.some((x) => x === 0)) return;
    this.finish(f);
  },
  onLock() { lastEv && this.move(lastEv); },
};

// ---- Bentuk dasar: bola, kerucut, kapsul, torus ----
function primTool(kind, label, icon, hint) {
  return {
    label, icon, hint, st: 0,
    cancel() { this.st = 0; },
    build(m) {
      const color = curMat.tex ? '#e9e4d4' : curMat.color;
      return G.primitive(m, kind, A(this.p), A(this.n), this.a, this.b, color, 24);
    },
    down(ev) {
      if (this.st === 0) {
        const plane = planeAt(ev);
        const r = inferPoint(ev, { plane });
        if (!r) return;
        this.p = r.p.clone();
        this.n = plane.n.clone().normalize();
        if (this.n.dot(getRay(ev).direction) > 0) this.n.negate();
        this.st = 1;
        this.a = 0;
        return;
      }
      if (this.st === 1) {
        if (!(this.a > 1e-4)) return;
        if (kind === 'sphere') return this.finish();
        this.st = 2;
        this.b = kind === 'torus' ? this.a * 0.3 : this.a * 2;
        return;
      }
      this.finish();
    },
    finish() {
      const res = this.build(model);
      this.st = 0;
      selection = new Set(res.ids);
      changed();
    },
    move(ev) {
      if (this.st === 0) {
        showSnap(inferPoint(ev, { plane: planeAt(ev) }));
        return;
      }
      if (this.st === 1) {
        const r = inferPoint(ev, { plane: { p: this.p, n: this.n } });
        showSnap(r);
        if (!r) return;
        this.a = Math.round(r.p.distanceTo(this.p) * 1000) / 1000;
        if (kind !== 'sphere') this.b = kind === 'torus' ? this.a * 0.3 : this.a * 2;
      } else if (kind === 'torus') {
        const r = inferPoint(ev, { plane: { p: this.p, n: this.n } });
        if (!r) return;
        this.b = Math.max(0.005, Math.min(this.a * 0.95, Math.abs(r.p.distanceTo(this.p) - this.a)));
      } else {
        const sp = lineParamNearRay(this.p, this.n, getRay(ev));
        if (sp == null) return;
        this.b = Math.max(0.005, Math.round(Math.abs(sp) * 1000) / 1000);
      }
      if (!(this.a > 1e-4)) return;
      const pm = G.cloneModel(model);
      this.build(pm);
      preview(pm);
      setMeasure(this.st === 1 ? fmt(this.a) : `${fmt(this.a)} ; ${fmt(this.b)}`);
    },
    onVCB(t) {
      if (this.st === 0) return;
      const nums = parseNums(t, 2);
      if (!(nums[0] > 0)) return;
      if (this.st === 2 && nums.length === 1) {
        this.b = nums[0]; // langkah kedua: tinggi / tebal cincin
        return this.finish();
      }
      this.a = nums[0];
      if (kind === 'sphere') return this.finish();
      if (nums[1] > 0) this.b = nums[1];
      else if (this.st === 1) {
        this.st = 2;
        return;
      }
      this.finish();
    },
  };
}
tools.sphere = primTool('sphere', 'Bola', '<circle cx="12" cy="12" r="8"/><ellipse cx="12" cy="12" rx="8" ry="3"/>',
  'Klik titik di bidang/tanah, gerakkan untuk jari-jari, klik lagi. Atau ketik jari-jari + Enter.');
tools.cone = primTool('cone', 'Kerucut', '<path d="M12 3L5 18h14z"/><ellipse cx="12" cy="18" rx="7" ry="2.5"/>',
  'Klik pusat alas, klik jari-jari, lalu gerakkan untuk tinggi dan klik. Atau ketik "jari2;tinggi".');
tools.capsule = primTool('capsule', 'Kapsul', '<rect x="7" y="3" width="10" height="18" rx="5"/>',
  'Klik pusat alas, klik jari-jari, lalu gerakkan untuk tinggi dan klik. Atau ketik "jari2;tinggi".');
tools.torus = primTool('torus', 'Torus (donat)', '<ellipse cx="12" cy="12" rx="9" ry="5"/><ellipse cx="12" cy="12" rx="3.5" ry="1.6"/>',
  'Klik pusat, klik jari-jari besar, lalu gerakkan untuk tebal cincin dan klik. Atau ketik "jari2_besar;jari2_tabung".');

// ---- Penghapus ----
tools.eraser = {
  label: 'Penghapus (E)', key: 'e',
  icon: '<path d="M16 3l5 5-11 11H5l-1-1v-4z"/><path d="M13 6l5 5"/>',
  hint: 'Klik (atau seret) pada bidang atau garis untuk menghapusnya.',
  drag: false, did: false,
  down(ev) { this.drag = true; this.did = false; this.erase(ev); },
  up() {
    if (!this.drag) return;
    this.drag = false;
    if (this.did) changed();
  },
  move(ev) {
    if (this.drag) this.erase(ev);
    else hoverFace(ev, '#ff6b6b');
  },
  erase(ev) {
    const lid = pickLine(ev);
    let id = lid;
    if (id == null) {
      const hit = pickFace(ev);
      id = hit ? hit.faceId : null;
    }
    if (id == null) return;
    let ids = new Set([id]);
    const ent = entityOf(id);
    const t = topOf(ent);
    if (t != null) ids = G.entitiesInTree(model, t);
    G.deleteIds(model, ids);
    this.did = true;
    snapCache = null;
    setHover(null);
    refresh();
  },
};

// ---- Cat ----
tools.paint = {
  label: 'Cat (B)', key: 'b',
  icon: '<path d="M5 11l6-6 8 8-6 6z"/><path d="M19 16c1 1.5 2 2.500 2 3.500a2 2 0 1 1-4 0c0-1 1-2 2-3.500z"/>',
  hint: 'Pilih warna/tekstur di panel Material, klik bidang. Shift+klik: seluruh objek. Alt+klik: ambil material dari bidang.',
  move(ev) { hoverFace(ev, '#ffd43b'); },
  down(ev) {
    const hit = pickFace(ev);
    if (!hit) return;
    if (ev.altKey) {
      const f = hit.face;
      setMat({ color: f.color, tex: f.tex || null, scale: f.texScale || 1, scaleV: f.texScaleV || null, rot: f.texRot || 0, finish: f.finish || (f.shiny ? 'glossy' : 'matte') });
      toast('Material diambil');
      return;
    }
    let ids = new Set([hit.faceId]);
    const t = topOf(hit.face);
    if (t != null) ids = G.entitiesInTree(model, t);
    else if (ev.shiftKey) ids = expand(ids);
    G.paint(model, ids, curMat.tex ? '#ffffff' : curMat.color, curMat.tex, curMat.scale, curMat.scaleV, curMat.rot);
    for (const f of model.faces) {
      if (!ids.has(f.id)) continue;
      delete f.shiny;
      if (curMat.finish && curMat.finish !== 'matte') f.finish = curMat.finish;
      else delete f.finish;
    }
    changed();
  },
};

// ---- Pita ukur & garis bantu ----
tools.tape = {
  label: 'Pita ukur (T)', key: 't',
  icon: '<path d="M3 15l12-9 6 6-12 9z"/><path d="M7 14l3 3M10 12l2 2M13 10l3 3"/>',
  hint: 'Klik dua titik untuk mengukur jarak sekaligus membuat garis bantu (putus-putus). Atau ketik panjang + Enter. Hapus dengan Penghapus.',
  p0: null, cur: null,
  cancel() { this.p0 = null; this.cur = null; },
  down(ev) {
    const r = inferPoint(ev, { anchor: this.p0 });
    if (!r) return;
    if (!this.p0) this.p0 = r.p.clone();
    else this.place(r.p);
  },
  place(p) {
    const d = p.distanceTo(this.p0);
    if (d < 1e-4) return;
    model.guides.push({ id: model.nextId++, a: A(this.p0), b: A(p) });
    toast(`Jarak: ${fmt(d)}`);
    this.p0 = null;
    this.cur = null;
    changed();
  },
  move(ev) {
    const r = inferPoint(ev, { anchor: this.p0 });
    showSnap(r, this.p0);
    if (!r) return;
    this.cur = r.p;
    if (this.p0) {
      guide.geometry.setFromPoints([this.p0, r.p]);
      guide.material.color.set('#1c9ad6');
      guide.visible = true;
      setMeasure(fmt(r.p.distanceTo(this.p0)));
      requestRender();
    }
  },
  onVCB(t) {
    if (!this.p0 || !this.cur) return;
    const [L] = parseNums(t);
    const dir = this.cur.clone().sub(this.p0);
    if (!(L > 0) || dir.length() < 1e-6) return;
    this.place(this.p0.clone().addScaledVector(dir.normalize(), L));
  },
  onLock() { lastEv && this.move(lastEv); },
};

// ---- Poligon ----
tools.polygon = Object.assign(Object.create(tools.circle), {
  label: 'Poligon (G)', key: 'g',
  icon: '<path d="M12 3l8 6-3 10H7L4 9z"/>',
  hint: 'Klik pusat, klik/ketik jari-jari. Ketik jumlah sisi + "s" lalu Enter (mis. 8s) untuk mengubah sisi. Sekarang: 6 sisi.',
  seg: 6,
  onVCB(t) {
    const m = t.trim().toLowerCase().match(/^(\d+)s$/);
    if (m) {
      this.seg = Math.max(3, Math.min(64, +m[1]));
      this.hint = `Klik pusat, klik/ketik jari-jari. Ketik jumlah sisi + "s" lalu Enter (mis. 8s). Sekarang: ${this.seg} sisi.`;
      setHint(this.hint);
      toast(`Jumlah sisi: ${this.seg}`);
      return;
    }
    tools.circle.onVCB.call(this, t);
  },
});

// ---- Busur ----
tools.arc = {
  label: 'Busur (A)', key: 'a',
  icon: '<path d="M4 18a10 10 0 0 1 16 0"/><circle cx="4" cy="18" r="1.6" fill="currentColor"/><circle cx="20" cy="18" r="1.6" fill="currentColor"/>',
  hint: 'Klik titik awal, klik titik akhir, lalu gerakkan mouse untuk melengkungkan dan klik. Ketik tinggi busur + Enter. Busur tertutup jadi bidang.',
  st: 0, p0: null, p1: null, h: 0,
  cancel() { this.st = 0; this.p0 = null; this.p1 = null; this.h = 0; },
  wdir() {
    const u = this.p1.clone().sub(this.p0).normalize();
    return new THREE.Vector3().crossVectors(this.plane.n, u).normalize();
  },
  points(h) {
    const c = this.p0.distanceTo(this.p1);
    const u = this.p1.clone().sub(this.p0).normalize();
    const w = this.wdir();
    const mid = this.p0.clone().add(this.p1).multiplyScalar(0.5);
    const sgn = h < 0 ? -1 : 1, ah = Math.abs(h);
    const R = (c * c / 4 + ah * ah) / (2 * ah);
    const apex = mid.clone().addScaledVector(w, h);
    const center = mid.clone().addScaledVector(w, sgn * (ah - R));
    const ang = (p) => {
      const v = p.clone().sub(center);
      return Math.atan2(v.dot(w), v.dot(u));
    };
    const TAU = Math.PI * 2;
    const t0 = ang(this.p0), t1 = ang(this.p1), ta = ang(apex);
    let d = t1 - t0;
    while (d > Math.PI) d -= TAU;
    while (d <= -Math.PI) d += TAU;
    const x = ta - t0;
    const off = d > 0 ? ((x % TAU) + TAU) % TAU : -((((-x) % TAU) + TAU) % TAU);
    if (Math.abs(off) > Math.abs(d) + 1e-6) d = d > 0 ? d - TAU : d + TAU;
    const n = Math.max(6, Math.ceil((Math.abs(d) / TAU) * 36));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      if (i === 0) pts.push(this.p0.clone());
      else if (i === n) pts.push(this.p1.clone());
      else {
        const t = t0 + (d * i) / n;
        pts.push(center.clone().addScaledVector(u, Math.cos(t) * R).addScaledVector(w, Math.sin(t) * R));
      }
    }
    return pts;
  },
  addTo(m, h) {
    const pts = Math.abs(h) < 1e-4 ? [this.p0, this.p1] : this.points(h);
    for (let i = 0; i < pts.length - 1; i++) G.addLine(m, A(pts[i]), A(pts[i + 1]), editGroup);
  },
  down(ev) {
    if (this.st === 0) {
      const plane = planeAt(ev);
      const r = inferPoint(ev, { plane });
      if (!r) return;
      this.plane = plane;
      this.p0 = r.p.clone();
      this.st = 1;
    } else if (this.st === 1) {
      const r = inferPoint(ev, { plane: this.plane });
      if (!r || r.p.distanceTo(this.p0) < 1e-3) return;
      this.p1 = r.p.clone();
      this.st = 2;
      this.h = 0;
    } else this.finish(this.h);
  },
  finish(h) {
    this.addTo(model, h);
    this.cancel();
    changed();
  },
  move(ev) {
    if (this.st === 0) {
      showSnap(inferPoint(ev, { plane: planeAt(ev) }));
      return;
    }
    const r = inferPoint(ev, { plane: this.plane });
    showSnap(r);
    if (!r) return;
    if (this.st === 1) {
      guide.geometry.setFromPoints([this.p0, r.p]);
      guide.material.color.set('#1c9ad6');
      guide.visible = true;
      setMeasure(fmt(r.p.distanceTo(this.p0)));
    } else {
      const mid = this.p0.clone().add(this.p1).multiplyScalar(0.5);
      this.h = Math.round(r.p.clone().sub(mid).dot(this.wdir()) * 1000) / 1000;
      const pm = G.cloneModel(model);
      this.addTo(pm, this.h);
      preview(pm);
      setMeasure(fmt(this.h));
    }
    requestRender();
  },
  onVCB(t) {
    if (this.st !== 2) return;
    let [h] = parseNums(t);
    if (isNaN(h)) return;
    this.finish(Math.abs(h) * (this.h < 0 ? -1 : 1));
  },
};

// ---- Offset ----
const distToPoly2 = (P, poly) => {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ab = b.clone().sub(a);
    const t = Math.max(0, Math.min(1, P.clone().sub(a).dot(ab) / (ab.lengthSq() || 1)));
    best = Math.min(best, a.clone().addScaledVector(ab, t).distanceTo(P));
  }
  return best;
};

tools.offset = {
  label: 'Offset (F)', key: 'f',
  icon: '<rect x="3.5" y="3.5" width="17" height="17" rx="1"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  hint: 'Klik bidang, gerakkan mouse ke dalam atau luar tepi, klik lagi. Atau ketik jarak + Enter.',
  st: null,
  cancel() { this.st = null; },
  down(ev) {
    if (this.st) return this.commit(this.st.d);
    const hit = pickFace(ev);
    if (!hit) return;
    if (topOf(hit.face) != null) return toast('Klik ganda grup untuk mengeditnya dulu');
    this.st = { id: hit.faceId, plane: { p: hit.point.clone(), n: V3(hit.face.n) }, d: 0 };
    setHover(null);
  },
  distAt(ev) {
    const f = model.faces.find((x) => x.id === this.st.id);
    const p = rayPlane(getRay(ev), this.st.plane.p, this.st.plane.n);
    if (!f || !p) return null;
    const bs = G.basis(f.n), o = V3(f.pts[0]);
    const poly = f.pts.map((q) => G.to2D(q, o, bs));
    const P = G.to2D(A(p), o, bs);
    const d = distToPoly2(P, poly);
    return G.pointInPoly2(P, poly) ? -d : d;
  },
  move(ev) {
    if (!this.st) {
      hoverFace(ev, '#7fb0ff');
      return;
    }
    const d = this.distAt(ev);
    if (d == null) return;
    this.st.d = Math.round(d * 1000) / 1000;
    const pm = G.cloneModel(model);
    G.applyOffset(pm, this.st.id, this.st.d);
    preview(pm);
    setMeasure(fmt(this.st.d));
  },
  commit(d) {
    const r = G.applyOffset(model, this.st.id, d);
    this.st = null;
    if (r) changed();
    else {
      refresh();
      toast('Offset tidak valid');
    }
  },
  onVCB(t) {
    if (!this.st) return;
    let [d] = parseNums(t);
    if (isNaN(d)) return;
    this.commit(Math.abs(d) * (this.st.d < 0 ? -1 : 1));
  },
};

// ---- Follow Me ----
tools.follow = {
  label: 'Follow Me (W)', key: 'w',
  icon: '<path d="M4 20c0-8 6-8 8-8s8 0 8-8"/><rect x="2.5" y="17" width="4" height="4"/><path d="M17 3h4v4"/>',
  hint: 'Pilih jalur dulu dengan alat Pilih (garis tersambung atau satu bidang), lalu klik bidang profil di ujung jalur.',
  move(ev) { hoverFace(ev, '#7fb0ff'); },
  down(ev) {
    const hit = pickFace(ev);
    if (!hit) return;
    const selLines = model.lines.filter((l) => selection.has(l.id));
    let path = null;
    if (selLines.length) path = G.pathFromLines(selLines);
    else {
      const sf = model.faces.find((f) => selection.has(f.id) && f.id !== hit.faceId);
      if (sf) path = { pts: sf.pts.map(V3), closed: true };
    }
    if (!path) return toast('Pilih jalur dulu (garis tersambung atau satu bidang)');
    if (G.followMe(model, hit.faceId, path.pts, path.closed)) {
      selection = new Set();
      changed();
      toast('Follow Me selesai');
    } else toast('Gagal: profil harus berada di ujung jalur');
  },
};

// ---- Dimensi ----
tools.dim = {
  label: 'Dimensi (D)', key: 'd',
  icon: '<path d="M4 6v12M20 6v12M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3"/>',
  hint: 'Klik titik pertama, titik kedua, lalu klik untuk menentukan posisi garis dimensi.',
  pts: [],
  cancel() { this.pts = []; },
  offsetFor(p) {
    const [a, b] = this.pts;
    const ab = b.clone().sub(a).normalize();
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const off = p.clone().sub(mid);
    off.addScaledVector(ab, -off.dot(ab));
    if (off.length() < 1e-3) {
      const o = new THREE.Vector3().crossVectors(AXES[2], ab);
      if (o.length() < 1e-3) o.copy(AXES[0]);
      return o.normalize().multiplyScalar(0.3);
    }
    return off;
  },
  anchor() { return this.pts.length ? this.pts[this.pts.length - 1] : null; },
  down(ev) {
    const r = inferPoint(ev, { anchor: this.anchor() });
    if (!r) return;
    if (this.pts.length < 2) {
      this.pts.push(r.p.clone());
      return;
    }
    model.dims.push({ id: model.nextId++, a: A(this.pts[0]), b: A(this.pts[1]), off: A(this.offsetFor(r.p)) });
    this.pts = [];
    changed();
  },
  move(ev) {
    const r = inferPoint(ev, { anchor: this.anchor() });
    showSnap(r, this.anchor());
    if (!r) return;
    if (this.pts.length === 1) {
      guide.geometry.setFromPoints([this.pts[0], r.p]);
      guide.material.color.set('#c0392b');
      guide.visible = true;
      setMeasure(fmt(r.p.distanceTo(this.pts[0])));
      requestRender();
    } else if (this.pts.length === 2) {
      const pm = G.cloneModel(model);
      pm.dims.push({ id: -1, a: A(this.pts[0]), b: A(this.pts[1]), off: A(this.offsetFor(r.p)) });
      preview(pm);
      setMeasure(fmt(this.pts[0].distanceTo(this.pts[1])));
    }
  },
};

// ---- Teks ----
tools.text = {
  label: 'Teks (X)', key: 'x',
  icon: '<path d="M5 6h14M12 6v13M9 19h6"/>',
  hint: 'Klik titik untuk menaruh teks, ketik lalu Enter. Klik ganda teks dengan alat Pilih untuk mengedit; Penghapus untuk menghapus.',
  move(ev) { showSnap(inferPoint(ev)); },
  down(ev) {
    const r = inferPoint(ev);
    if (!r) return;
    const rect = canvas.getBoundingClientRect();
    askText(ev.clientX - rect.left, ev.clientY - rect.top, '', (t) => {
      if (!t) return;
      model.labels.push({ id: model.nextId++, p: A(r.p), text: t });
      changed();
    });
  },
};

// ---- Bidang potong (Section Plane) ----
tools.section = {
  label: 'Bidang Potong (N)', key: 'n',
  icon: '<path d="M4 4h12v12H4z"/><path d="M8 8h12v12H8z" stroke-dasharray="2 2"/><path d="M12 2v4M12 18v4"/>',
  hint: 'Klik bidang untuk menaruh bidang potong, gerakkan mouse untuk mengatur kedalaman, klik lagi (atau ketik jarak + Enter). Menu Tampilan: nyalakan/matikan/hapus potongan.',
  st: null,
  cancel() { this.st = null; },
  plane(d) { return { p: A(this.st.p.clone().addScaledVector(this.st.n, -d)), n: A(this.st.n), on: true }; },
  down(ev) {
    if (this.st) return this.commit(this.st.d);
    const hit = pickFace(ev);
    if (!hit) return;
    const n = V3(hit.face.n);
    if (n.dot(getRay(ev).direction) > 0) n.negate();
    this.st = { p: hit.point.clone(), n, d: 0 };
    setHover(null);
  },
  move(ev) {
    if (!this.st) {
      hoverFace(ev, '#ff9f43');
      return;
    }
    const s = lineParamNearRay(this.st.p, this.st.n, getRay(ev));
    if (s == null) return;
    this.st.d = Math.round(-s * 1000) / 1000;
    const pm = G.cloneModel(model);
    pm.section = this.plane(this.st.d);
    preview(pm);
    setMeasure(fmt(this.st.d));
  },
  commit(d) {
    model.section = this.plane(d);
    this.st = null;
    changed();
    toast('Bidang potong dipasang');
  },
  onVCB(t) {
    if (!this.st) return;
    const [d] = parseNums(t);
    if (!isNaN(d)) this.commit(d);
  },
};

// ---- Kamera: Lihat Sekeliling, Jalan, Posisi Kamera ----
const eyePos = () => view.target.clone().addScaledVector(camDir(), view.dist);
function setEye(eye) {
  view.target.copy(eye).addScaledVector(camDir(), -view.dist);
  updateCamera();
}
function turnView(dAz, dEl) {
  const eye = eyePos();
  view.az -= dAz;
  view.el = Math.max(-1.45, Math.min(1.45, view.el + dEl));
  setEye(eye);
}
function walkBy(fwd, up = 0) {
  const eye = eyePos();
  const f = new THREE.Vector3(-Math.cos(view.az), -Math.sin(view.az), 0);
  eye.addScaledVector(f, fwd);
  eye.z += up;
  setEye(eye);
}

tools.look = {
  label: 'Lihat Sekeliling (K)', key: 'k', cursor: 'grab',
  icon: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  hint: 'Seret untuk menoleh dari posisi kamera saat ini.',
  drag: null,
  down(ev) { this.drag = { x: ev.clientX, y: ev.clientY }; },
  move(ev) {
    if (!this.drag) return;
    turnView((ev.clientX - this.drag.x) * 0.004, (ev.clientY - this.drag.y) * 0.004);
    this.drag = { x: ev.clientX, y: ev.clientY };
  },
  up() { this.drag = null; },
};

tools.walk = {
  label: 'Jalan (J)', key: 'j', cursor: 'grab',
  icon: '<circle cx="13" cy="4" r="2"/><path d="M9 21l2-6 3 3v3M7 12l3-4 4 1 3 3M11 15l1-6"/>',
  hint: 'Seret ke atas/bawah untuk maju/mundur, kiri/kanan untuk berbelok. Shift+seret: naik/turun. Panah juga bisa dipakai.',
  drag: null,
  down(ev) { this.drag = { x: ev.clientX, y: ev.clientY }; },
  move(ev) {
    if (!this.drag) return;
    const dx = ev.clientX - this.drag.x, dy = ev.clientY - this.drag.y;
    if (ev.shiftKey) walkBy(0, -dy * 0.02);
    else {
      turnView(dx * 0.003, 0);
      walkBy(-dy * 0.03);
    }
    this.drag = { x: ev.clientX, y: ev.clientY };
  },
  up() { this.drag = null; },
  onArrow(k) {
    if (k === 'ArrowUp') walkBy(0.5);
    else if (k === 'ArrowDown') walkBy(-0.5);
    else if (k === 'ArrowLeft') turnView(-0.15, 0);
    else if (k === 'ArrowRight') turnView(0.15, 0);
  },
};

let eyeHeight = 1.68;
tools.poscam = {
  label: 'Posisi Kamera (U)', key: 'u',
  icon: '<path d="M4 8h11l3-2v12l-3-2H4z"/><path d="M8 20l2-4"/>',
  hint: 'Klik titik di lantai/bidang untuk berdiri di sana (tinggi mata 1.68 m, ketik angka untuk mengubah). Lalu pakai Lihat Sekeliling / Jalan.',
  move(ev) { showSnap(inferPoint(ev)); },
  down(ev) {
    const r = inferPoint(ev);
    if (!r) return;
    const dir = r.p.clone().sub(eyePos());
    dir.z = 0;
    if (dir.length() > 1e-6) view.az = Math.atan2(dir.y, dir.x) + Math.PI;
    view.el = 0;
    view.dist = 2;
    if (view.ortho) setOrtho(false);
    setEye(r.p.clone().add(new THREE.Vector3(0, 0, eyeHeight)));
    hideSnap();
    setTool('look');
    toast('Seret untuk menoleh. Alat Jalan (J) untuk berjalan.');
  },
  onVCB(t) {
    const [h] = parseNums(t);
    if (h > 0) {
      eyeHeight = h;
      toast(`Tinggi mata: ${fmt(h)}`);
    }
  },
};

// ---- Penempatan (pustaka komponen & teks 3D) ----
let placeGen = null; // { label, gen(m, at, n, angle) -> { ids } }
function startPlace(gen) {
  placeGen = gen;
  setTool('place');
}
tools.place = {
  label: 'Tempatkan', cursor: 'copy',
  hint: 'Klik untuk menaruh. Panah kiri/kanan: putar 90°. Esc: batal.',
  angle: 0,
  cancel() {
    this.angle = 0;
    this.key = null;
  },
  normalAt(ev) {
    const hit = pickFace(ev);
    return hit ? V3(hit.face.n) : AXES[2].clone();
  },
  move(ev) {
    if (!placeGen) return;
    const r = inferPoint(ev);
    showSnap(r);
    if (!r) return;
    // benda dibangun sekali di titik asal, lalu hanya digeser mengikuti kursor
    const n = this.normalAt(ev);
    const key = `${n.toArray().map((x) => x.toFixed(3))}|${this.angle}|${placeGen.label}`;
    if (!fastIds || this.key !== key) {
      const temp = G.normalizeModel(G.newModel());
      temp.nextId = model.nextId;
      placeGen.gen(temp, new THREE.Vector3(), n, this.angle);
      if (!fastIds) fastBegin(new Set(), temp);
      else fastSetMoving(temp);
      this.key = key;
    }
    fastUpdate(new THREE.Matrix4().makeTranslation(r.p.x, r.p.y, r.p.z));
  },
  down(ev) {
    if (!placeGen) return;
    const r = inferPoint(ev);
    if (!r) return;
    this.key = null;
    const res = placeGen.gen(model, r.p, this.normalAt(ev), this.angle);
    selection = new Set(res.ids);
    const label = placeGen.label;
    placeGen = null;
    changed();
    toast(`${label} ditempatkan`);
    setTool('select');
  },
  onArrow(k) {
    this.key = null;
    if (k === 'ArrowLeft') this.angle += Math.PI / 2;
    else if (k === 'ArrowRight') this.angle -= Math.PI / 2;
    lastEv && this.move(lastEv);
  },
};

// ---- Teks 3D (memakai font TrueType yang terpasang di Windows) ----
const fontCache = new Map();
async function getFont(file) {
  if (!fontCache.has(file)) {
    const data = await window.api.readFont(file);
    if (!data) throw new Error('font tidak ditemukan');
    fontCache.set(file, parseFont(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)));
  }
  return fontCache.get(file);
}
function textShapes(font, text, size) {
  const shapes = [];
  text.split('\n').forEach((ln, li) => {
    const path = font.getPath(ln, 0, li * size * 1.3, size);
    const sp = new THREE.ShapePath();
    for (const c of path.commands) {
      if (c.type === 'M') sp.moveTo(c.x, -c.y);
      else if (c.type === 'L') sp.lineTo(c.x, -c.y);
      else if (c.type === 'Q') sp.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y);
      else if (c.type === 'C') sp.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y);
    }
    shapes.push(...sp.toShapes(false));
  });
  return shapes;
}
function buildText3D(m, shapes, at, n, angle, depth, color, name) {
  const { u: u0, v: v0 } = planeAxes(n);
  const u = u0.clone().applyAxisAngle(n, angle), v = v0.clone().applyAxisAngle(n, angle);
  const to3 = (q) => A(at.clone().addScaledVector(u, q.x).addScaledVector(v, q.y));
  const clean = (arr) => {
    const out = [];
    for (const q of arr) if (!out.length || out[out.length - 1].distanceTo(q) > 1e-6) out.push(q);
    if (out.length > 1 && out[0].distanceTo(out[out.length - 1]) < 1e-6) out.pop();
    return out;
  };
  const before = new Set(m.faces.map((f) => f.id));
  for (const sh of shapes) {
    const { shape, holes } = sh.extractPoints(5);
    const c = clean(shape);
    if (c.length < 3) continue;
    const f = G.makeFace(m, c.map(to3), n, color);
    if (!f) continue;
    f.holes = holes.map(clean).filter((h) => h.length >= 3).map((h) => h.map(to3));
    m.faces.push(f);
    if (depth > 0) G.pushPull(m, f.id, depth);
  }
  const ids = new Set(m.faces.filter((f) => !before.has(f.id)).map((f) => f.id));
  if (ids.size) G.makeGroup(m, ids, name, true, editGroup);
  return { ids: G.expandSelection(m, ids, editGroup) };
}
function openText3D() {
  $('t3d').hidden = false;
  $('t3dText').focus();
  $('t3dText').select();
}
async function confirmText3D() {
  const text = $('t3dText').value.trim();
  if (!text) return;
  const size = parseNums($('t3dSize').value)[0];
  const depth = parseNums($('t3dDepth').value)[0];
  if (!(size > 0) || !(depth >= 0)) return toast('Tinggi/ketebalan tidak valid');
  let font;
  try {
    font = await getFont($('t3dFont').value);
  } catch (e) {
    return toast('Gagal memuat font: ' + e.message);
  }
  const shapes = textShapes(font, text, size);
  if (!shapes.length) return toast('Teks kosong');
  $('t3d').hidden = true;
  const color = curMat.tex ? '#d9b27c' : curMat.color;
  startPlace({ label: 'Teks 3D', gen: (m, at, n, angle) => buildText3D(m, shapes, at, n, angle, depth, color, 'Teks: ' + text.slice(0, 20)) });
}
tools.text3d = {
  label: 'Teks 3D (Y)', key: 'y',
  icon: '<path d="M4 6h10M9 6v12"/><path d="M14 10h6M17 10v8" stroke-width="2.4"/>',
  hint: 'Isi teks, pilih font & ukuran, lalu klik untuk menaruhnya pada bidang/tanah.',
  activate() { openText3D(); },
  cancel() { $('t3d').hidden = true; },
};

// ---- Sandbox: medan baru & Smoove ----
tools.terrain = {
  label: 'Medan Baru (Sandbox)', key: 'z',
  icon: '<path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7M7.5 5v10.5M12 11v10M16.5 5v10.5M3 12l9 4 9-4"/>',
  hint: 'Klik dua sudut di tanah untuk membuat medan ber-grid. Ketik jarak grid + Enter sebelum mulai (sekarang 1 m). Lalu pakai Smoove untuk membentuk bukit.',
  spacing: 1, p0: null,
  cancel() { this.p0 = null; },
  down(ev) {
    const r = inferPoint(ev, { plane: { p: this.p0 || new THREE.Vector3(), n: AXES[2] } });
    if (!r) return;
    if (!this.p0) {
      this.p0 = r.p.clone();
      return;
    }
    this.make(model, r.p);
    this.p0 = null;
    changed();
  },
  make(m, p1) {
    const res = G.terrainGrid(m, this.p0, p1, this.spacing, '#7fa35b');
    if (!res) return toast('Area terlalu kecil');
    const gid = G.makeGroup(m, res, 'Medan', false, editGroup);
    m.groups[gid].terrain = true;
    selection = new Set();
    return res;
  },
  move(ev) {
    const r = inferPoint(ev, { plane: { p: this.p0 || new THREE.Vector3(), n: AXES[2] } });
    showSnap(r);
    if (!r || !this.p0) return;
    const pm = G.cloneModel(model);
    const a = this.p0, b = r.p;
    G.addFace(pm, [[a.x, a.y, a.z], [b.x, a.y, a.z], [b.x, b.y, a.z], [a.x, b.y, a.z]], AXES[2], editGroup);
    preview(pm);
    const nx = Math.ceil(Math.abs(b.x - a.x) / this.spacing), ny = Math.ceil(Math.abs(b.y - a.y) / this.spacing);
    setMeasure(`${fmt(Math.abs(b.x - a.x))} × ${fmt(Math.abs(b.y - a.y))} (${nx}×${ny})`);
  },
  onVCB(t) {
    const nums = parseNums(t, 2);
    if (!this.p0) {
      if (nums[0] > 0) {
        this.spacing = nums[0];
        toast(`Jarak grid: ${fmt(this.spacing)}`);
      }
      return;
    }
    if (nums.length === 2 && nums.every((x) => x > 0)) {
      this.make(model, this.p0.clone().add(new THREE.Vector3(nums[0], nums[1], 0)));
      this.p0 = null;
      changed();
    }
  },
};

tools.smoove = {
  label: 'Smoove / Pahat (V)', key: 'v',
  icon: '<path d="M3 18c4 0 5-9 9-9s5 9 9 9"/><path d="M12 3v4M10 5l2-2 2 2"/>',
  hint: 'Klik bidang (medan atau benda apa pun), gerakkan lalu klik untuk menonjolkan/menekan permukaan dengan lembut. Ketik radius + Enter sebelum klik. Untuk benda biasa, pakai Edit → Perbanyak Bidang dulu agar halus.',
  R: 3, st: null,
  cancel() { this.st = null; },
  apply(m, h) {
    const { solid, grp, c, dir, terrain } = this.st, R = this.R;
    G.deform(m, (f) => f.solid === solid && gOf(f) === grp, (p) => {
      let d;
      if (terrain) d = Math.hypot(p[0] - c.x, p[1] - c.y);
      else {
        // jarak di sepanjang permukaan; titik di balik permukaan (sisi belakang benda tipis) dianggap jauh
        const v = new THREE.Vector3(p[0] - c.x, p[1] - c.y, p[2] - c.z);
        const depth = -v.dot(dir);
        const lat = v.addScaledVector(dir, depth).length();
        d = Math.hypot(lat, Math.max(0, depth) * 4);
      }
      if (d >= R) return p;
      const w = h * 0.5 * (1 + Math.cos((Math.PI * d) / R));
      return [p[0] + dir.x * w, p[1] + dir.y * w, p[2] + dir.z * w];
    });
  },
  down(ev) {
    if (this.st) return this.commit(this.st.h);
    const hit = pickFace(ev);
    if (!hit || hit.face.solid == null) return toast('Klik bidang medan atau benda solid');
    const g = gOf(hit.face) != null ? model.groups[gOf(hit.face)] : null;
    const terrain = !!(g && g.terrain);
    const dir = terrain ? AXES[2].clone() : V3(hit.face.n);
    if (!terrain && dir.dot(getRay(ev).direction) > 0) dir.negate();
    this.st = { solid: hit.face.solid, grp: gOf(hit.face), c: hit.point.clone(), h: 0, dir, terrain };
    setHover(null);
  },
  commit(h) {
    if (Math.abs(h) > 1e-4) this.apply(model, h);
    this.st = null;
    changed();
  },
  move(ev) {
    if (!this.st) {
      hoverFace(ev, '#7fb0ff');
      return;
    }
    const s = lineParamNearRay(this.st.c, this.st.dir, getRay(ev));
    if (s == null) return;
    this.st.h = Math.round(s * 1000) / 1000;
    const pm = G.cloneModel(model);
    this.apply(pm, this.st.h);
    preview(pm);
    setMeasure(`${fmt(this.st.h)} (r ${fmt(this.R)})`);
  },
  onVCB(t) {
    const [v] = parseNums(t);
    if (isNaN(v)) return;
    if (!this.st) {
      if (v > 0) {
        this.R = v;
        toast(`Radius Smoove: ${fmt(v)}`);
      }
    } else this.commit(v);
  },
};

// ---- Lampu ----
tools.lamp = {
  label: 'Lampu',
  icon: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  hint: 'Klik bidang untuk memasang lampu titik (sedikit menjauh dari bidang). Shift+klik: lampu sorot ke arah bidang (mis. klik plafon). Ketik daya + Enter sebelum klik (sekarang 20). Penghapus: klik label lampu.',
  power: 20,
  move(ev) { showSnap(inferPoint(ev)); },
  down(ev) {
    const hit = pickFace(ev);
    const r = inferPoint(ev);
    if (!r) return;
    const n = hit ? V3(hit.face.n) : AXES[2].clone();
    if (n.dot(getRay(ev).direction) > 0) n.negate();
    const p = r.p.clone().addScaledVector(n, 0.15);
    model.lights ||= [];
    model.lights.push({ id: model.nextId++, p: A(p), dir: ev.shiftKey ? A(n.clone().negate()) : null, color: '#ffd59a', power: ev.shiftKey ? this.power * 2 : this.power });
    changed();
    toast(ev.shiftKey ? 'Lampu sorot dipasang' : 'Lampu dipasang · coba Gaya → Waktu: Malam');
  },
  onVCB(t) {
    const [v] = parseNums(t);
    if (v > 0) {
      this.power = v;
      toast(`Daya lampu: ${v}`);
    }
  },
};

// ---- Orbit, Geser ----
tools.orbit = {
  label: 'Orbit (O)', key: 'o', nav: 'orbit', cursor: 'grab',
  icon: '<ellipse cx="12" cy="12" rx="9" ry="4.5"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M21 12l-2-2.500M21 12l-2.500 2"/>',
  hint: 'Seret untuk memutar pandangan. (Tombol tengah/kanan mouse juga memutar di alat mana pun; +Shift untuk menggeser.)',
};
tools.pan = {
  label: 'Geser (H)', key: 'h', nav: 'pan', cursor: 'grab',
  icon: '<path d="M8 12V6a1.500 1.500 0 0 1 3 0v5V4.500a1.500 1.500 0 0 1 3 0V11V6a1.500 1.500 0 0 1 3 0v8c0 4-2 6-6 6s-5-2-7-5l-1.500-2.500a1.500 1.500 0 0 1 2.500-1.500L8 14z"/>',
  hint: 'Seret untuk menggeser pandangan. Roda mouse: zoom.',
};

// ======================= Toolbar =======================
const order = ['select', 'line', 'arc', 'spline', 'freehand', 'rect', 'rrect', 'wall', 'pintu', 'jendela', 'room', 'circle', 'polygon', '|', 'sphere', 'cone', 'capsule', 'torus', '|', 'pushpull', 'offset', 'follow', '|', 'move', 'rotate', 'scale', '|', 'eraser', 'paint', '|', 'tape', 'dim', 'text', 'section', 'text3d', 'lamp', '|', 'terrain', 'smoove', '|', 'orbit', 'pan', 'look', 'walk', 'poscam'];
for (const name of order) {
  const tb = $('toolbar');
  if (name === '|') {
    const s = document.createElement('div');
    s.className = 'sep';
    tb.appendChild(s);
    continue;
  }
  const t = tools[name];
  const b = document.createElement('button');
  b.dataset.tool = name;
  b.title = t.label;
  b.innerHTML = `<svg viewBox="0 0 24 24">${t.icon}</svg>`;
  b.onclick = () => setTool(name);
  tb.appendChild(b);
}
{
  const c = document.createElement('input');
  c.type = 'color';
  c.value = curMat.color;
  c.title = 'Warna cat';
  c.oninput = () => setMat({ color: c.value, tex: null, scale: 1 });
  $('toolbar').appendChild(c);
}

// ======================= Menu klik kanan =======================
function closeCtx() {
  $('ctxmenu').hidden = true;
}
function selFaceIds() {
  return new Set([...selection].filter((i) => model.faces.some((f) => f.id === i)));
}
function subdivideSel() {
  const ids = selFaceIds();
  if (!ids.size) return toast('Pilih benda dulu (klik ganda untuk memilih seluruh benda)');
  const r0 = stage.getBoundingClientRect();
  askText(r0.width / 2 - 70, 120, '2', (t) => {
    const lvl = Math.round(parseFloat(t));
    if (!(lvl >= 1 && lvl <= 4)) return toast('Tingkat 1–4');
    if (ids.size * Math.pow(4, lvl) * 2 > 80000) return toast('Terlalu banyak bidang, kecilkan tingkat');
    const res = G.subdivide(model, ids, lvl);
    if (!res) return;
    selection = res;
    changed();
    toast(`Permukaan dihaluskan (tingkat ${lvl}, ${res.size} bidang)`);
  });
}
function roundAllSel() {
  const fs = model.faces.filter((f) => selection.has(f.id));
  const solids = [...new Set(fs.map((f) => f.solid).filter((x) => x != null))];
  if (!solids.length) return toast('Pilih benda hasil Dorong/Tarik (klik ganda pada benda)');
  const r0 = stage.getBoundingClientRect();
  askText(r0.width / 2 - 70, 120, String(lastFillet), (t) => {
    const [r] = parseNums(t);
    if (!(r > 0)) return toast('Radius tidak valid');
    lastFillet = r;
    let ok = 0;
    for (const sid of solids) {
      const cands = model.faces.filter((f) => f.solid === sid);
      if (cands.some((f) => G.roundPrism(model, f.id, r))) ok++;
    }
    if (!ok) return toast('Tidak bisa: hanya untuk benda prisma sederhana (bidang yang ditarik dengan Dorong/Tarik)');
    selection = new Set();
    changed();
    toast(`Semua rusuk dibulatkan (radius ${fmt(r)})`);
  });
}
function mirrorSel(axis) {
  if (!selection.size) return toast('Pilih objek dulu');
  const ids = expand(selection);
  const c = G.bboxOf(model, ids).getCenter(new THREE.Vector3());
  const f = [1, 1, 1];
  f[axis] = -1;
  G.scaleAxes(model, ids, c, ...f);
  changed();
  toast(`Dicerminkan pada sumbu ${AXNAME[axis]}`);
}
function importReference(file) {
  const fr = new FileReader();
  fr.onload = () => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const id = 'u:ref' + Date.now().toString(36);
      textures.set(id, { name: 'Referensi', data: c.toDataURL('image/jpeg', 0.9), scale: 1 });
      const H = 3, W = (H * img.width) / img.height, y = 1.5;
      const f = G.makeFace(model, [[-W / 2, y, 0], [W / 2, y, 0], [W / 2, y, H], [-W / 2, y, H]], new THREE.Vector3(0, -1, 0), '#ffffff');
      f.tex = id;
      f.opacity = 0.6;
      model.faces.push(f);
      fitTexture(f);
      let tag = model.tags.find((t) => t.name === 'Referensi');
      if (!tag) model.tags.push((tag = { id: model.nextId++, name: 'Referensi', visible: true, color: '#868e96' }));
      const gid = G.makeGroup(model, new Set([f.id]), 'Gambar Referensi', false, null);
      model.groups[gid].tag = tag.id;
      selection = new Set([f.id]);
      changed();
      setStdView('front');
      toast('Gambar referensi ditaruh (tinggi 3 m). Geser/skala sesuai kebutuhan; matikan lewat tab Tag.');
    };
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}

// ---- Lentur / Runcing / Puntir (dengan pratinjau langsung) ----
let deformIds = null;
function openDeform() {
  const ids = selFaceIds();
  if (!ids.size) return toast('Pilih benda dulu (klik ganda pada benda)');
  deformIds = expand(ids);
  $('deform').hidden = false;
  updateDeformUi();
  previewDeform();
}
function deformParams() {
  return {
    kind: $('dfKind').value,
    axis: +$('dfAxis').value,
    amount: parseFloat(String($('dfAmount').value).replace(',', '.')),
    dir: +$('dfDir').value,
    slices: Math.max(2, Math.min(64, parseInt($('dfSlices').value, 10) || 16)),
  };
}
function updateDeformUi() {
  const k = $('dfKind').value;
  $('dfAmountLbl').textContent = k === 'taper' ? 'Skala ujung' : 'Sudut (°)';
  $('dfDirRow').hidden = k !== 'bend';
  $('dfSliceRow').hidden = k === 'taper';
}
function previewDeform() {
  const q = deformParams();
  if (!deformIds || isNaN(q.amount)) return;
  const pm = G.cloneModel(model);
  G.deformAxis(pm, deformIds, q.kind, q.axis, q.amount, q.dir, q.slices);
  preview(pm);
}
function applyDeform() {
  const q = deformParams();
  if (!deformIds || isNaN(q.amount)) return;
  if (q.kind === 'taper' && !(q.amount > 0)) return toast('Skala ujung harus > 0');
  G.deformAxis(model, deformIds, q.kind, q.axis, q.amount, q.dir, q.slices);
  $('deform').hidden = true;
  deformIds = null;
  selection = new Set();
  changed();
  toast({ bend: 'Benda dilentur', taper: 'Benda diruncingkan', twist: 'Benda dipuntir' }[q.kind]);
}
function closeDeform() {
  $('deform').hidden = true;
  deformIds = null;
  clearPreview();
}

function tessellateSel() {
  const ids = selFaceIds();
  if (!ids.size) return toast('Pilih benda dulu');
  const r0 = stage.getBoundingClientRect();
  askText(r0.width / 2 - 70, 120, '0.1', (t) => {
    const [step] = parseNums(t);
    if (!(step > 0)) return toast('Jarak tidak valid');
    const box = G.bboxOf(model, expand(ids));
    const sz = box.getSize(new THREE.Vector3());
    const est = ids.size * Math.max(1, sz.x / step) * Math.max(1, sz.y / step) * 0.5;
    if (est > 60000) return toast('Terlalu rapat untuk benda sebesar ini, perbesar jaraknya');
    const res = G.tessellate(model, expand(ids), step);
    selection = res;
    changed();
    toast(`Bidang diperbanyak (${res.size} bidang). Sekarang bisa dipahat/dilentur dengan halus.`);
  });
}

// Salinan cermin yang bertaut: edit satu sisi, sisi lain ikut (pemodelan simetris).
function mirrorLinked(axis) {
  if (!selection.size) return toast('Pilih objek dulu');
  let { tops, loose } = selectedTops();
  let gid;
  if (tops.size === 1 && !loose.length && model.groups[[...tops][0]].def) gid = [...tops][0];
  else {
    const ids = expand(selection);
    gid = G.makeGroup(model, ids, 'Simetris', true, editGroup);
  }
  const src = G.entitiesInTree(model, gid);
  const cp = G.duplicate(model, src, editGroup);
  const f = [1, 1, 1];
  f[axis] = -1;
  G.scaleAxes(model, cp, new THREE.Vector3(0, 0, 0), ...f);
  selection = new Set([...src, ...cp]);
  changed();
  toast(`Salinan cermin bertaut dibuat di seberang bidang ${AXNAME[axis]} = 0. Edit salah satu, yang lain ikut.`);
}

function intersectSel() {
  const ids = selection.size ? expand(selection) : new Set(model.faces.filter((f) => editGroup == null || G.isInTree(model, gOf(f), editGroup)).map((f) => f.id));
  const fids = new Set([...ids].filter((i) => model.faces.some((f) => f.id === i)));
  if (fids.size < 2) return toast('Pilih dua benda atau lebih yang saling bersilangan');
  const n = G.intersectFaces(model, fids, editGroup);
  if (!n) return toast('Tidak ada perpotongan ditemukan');
  changed();
  toast(`${n} garis potong ditambahkan; bidang yang tertembus otomatis terbelah`);
}
function roofSel() {
  if (!selection.size) return toast('Pilih dinding/bangunan dulu');
  const box = G.bboxOf(model, expand(selection));
  const r0 = stage.getBoundingClientRect();
  askText(r0.width / 2 - 70, 120, '30;0.4', (t) => {
    const [pitch, over] = t.split(/[;,]/).map((x) => parseFloat(x));
    if (!(pitch > 0 && pitch < 80)) return toast('Kemiringan 1–79°');
    const sid = G.gableRoof(model, box, pitch, over >= 0 ? over : 0.4, '#ffffff', editGroup);
    if (sid == null) return toast('Gagal membuat atap');
    const rids = new Set(model.faces.filter((f) => f.solid === sid).map((f) => f.id));
    G.paint(model, rids, '#ffffff', 'b:atap', 0.6);
    const rg = G.makeGroup(model, rids, 'Atap', false, editGroup);
    model.groups[rg].roof = { pitch };
    selection = new Set();
    changed();
    toast(`Atap pelana ${pitch}° dibuat (teritis ${fmt(over >= 0 ? over : 0.4)})`);
  });
}

let lastFillet = 0.1;
function filletSel(mode = 'round') {
  const fs = model.faces.filter((f) => selection.has(f.id) && topOf(f) == null);
  if (!fs.length) return toast('Pilih bidang dulu (mis. bidang atas kotak)');
  const r0 = stage.getBoundingClientRect();
  askText(r0.width / 2 - 70, 120, String(lastFillet), (t) => {
    const [r] = parseNums(t);
    if (!(r > 0)) return toast('Radius tidak valid');
    lastFillet = r;
    let ok = 0, bad = 0;
    const done = new Set();
    for (const f of fs) {
      if (!model.faces.includes(f)) continue; // sudah diganti saat membangun ulang solid
      const key = f.solid ?? 'f' + f.id;
      if (done.has(key)) continue;
      done.add(key);
      const res = G.filletFace(model, f.id, r, mode);
      if (res) ok++;
      else bad++;
    }
    if (!ok) return toast('Tidak bisa dibulatkan: pilih bidang datar atau benda hasil Dorong/Tarik sederhana');
    selection = new Set();
    changed();
    toast(`${mode === 'chamfer' ? 'Sudut dipotong' : 'Sudut dibulatkan'} (${fmt(r)})${bad ? `, ${bad} dilewati` : ''}`);
  });
}

function reverseSel() {
  const ids = new Set([...selection].filter((i) => model.faces.some((f) => f.id === i && topOf(f) == null)));
  if (!ids.size) return toast('Pilih bidang dulu');
  G.reverseFaces(model, ids);
  changed();
  toast('Arah bidang dibalik');
}
function openCtx(ev) {
  const lid = pickLine(ev);
  const hit = pickFace(ev);
  const id = lid != null ? lid : hit ? hit.faceId : null;
  if (id != null && !selection.has(id)) {
    const t = topOf(entityOf(id));
    selection = t != null ? G.entitiesInTree(model, t) : new Set([id]);
    refresh();
    updateInfo();
  }
  const items = [];
  const add = (label, fn, key = '') => items.push({ label, fn, key });
  const sep = () => items.length && items[items.length - 1] !== '-' && items.push('-');
  if (selection.size) {
    const { tops, loose } = selectedTops();
    if (tops.size === 1 && !loose.length) {
      const g = [...tops][0];
      add(`Edit ${model.groups[g].def ? 'Komponen' : 'Grup'}`, () => enterEdit(g));
    }
    add('Hapus', () => handleMenu('delete'), 'Del');
    add('Sembunyikan', hideSelection, 'Ctrl+H');
    sep();
    add('Buat Grup', () => groupCmd(false), 'Ctrl+G');
    add('Buat Komponen', () => groupCmd(true), 'Ctrl+Shift+G');
    if (tops.size) add('Urai', explodeCmd, 'Ctrl+Shift+E');
    sep();
    if (selectedTexFaces().length) {
      add('Putar Tekstur 90°', () => editTexture((f) => (f.texRot = ((f.texRot || 0) + 90) % 360)));
      add('Pas-kan Tekstur ke Bidang', () => editTexture(fitTexture, 'Tekstur dipaskan ke bidang'));
      add('Atur Posisi Tekstur…', () => showTray('info'));
      sep();
    }
    if (loose.some((e) => e.pts)) {
      add('Bulatkan Sudut…', () => filletSel('round'), 'Ctrl+Shift+R');
      add('Potong Sudut (Chamfer)…', () => filletSel('chamfer'));
      add('Bulatkan Semua Rusuk…', roundAllSel, 'Ctrl+Shift+B');
      add('Haluskan Permukaan…', subdivideSel, 'Ctrl+Shift+U');
      add('Lentur / Runcing / Puntir…', openDeform, 'Ctrl+Shift+D');
      add('Perbanyak Bidang…', tessellateSel);
      add('Balik Arah Bidang', reverseSel);
      add('Pilih Semua Terhubung', () => { selection = expand(selection); refresh(); updateInfo(); });
    }
    add('Potong Bersilangan (Intersect)', intersectSel, 'Ctrl+Shift+I');
    add('Buat Atap Pelana…', roofSel);
    add('Cermin (merah)', () => mirrorSel(0));
    add('Cermin (hijau)', () => mirrorSel(1));
    add('Cermin (biru)', () => mirrorSel(2));
    add('Salinan Cermin Bertaut (merah)', () => mirrorLinked(0), 'Ctrl+Shift+M');
    sep();
    add('Zoom ke Pilihan', zoomSelection);
    add('Info Entitas', () => showTray('info'));
  } else {
    if (editGroup != null) add('Tutup Grup', exitEdit, 'Esc');
    add('Pilih Semua', () => handleMenu('selectAll'), 'Ctrl+A');
    add('Tampilkan Semua', unhideAll, 'Ctrl+Shift+H');
    add('Zoom Semua', zoomExtents, 'Shift+Z');
    add('Tambah Adegan', addScene);
  }
  const box = $('ctxmenu');
  box.replaceChildren();
  for (const it of items) {
    if (it === '-') {
      box.append(mkEl('hr'));
      continue;
    }
    box.append(mkEl('button', { onclick: () => { closeCtx(); it.fn(); } }, mkEl('span', { textContent: it.label }), mkEl('kbd', { textContent: it.key })));
  }
  const r = stage.getBoundingClientRect();
  box.hidden = false;
  const w = box.offsetWidth, h = box.offsetHeight;
  box.style.left = Math.min(ev.clientX - r.left, r.width - w - 4) + 'px';
  box.style.top = Math.min(ev.clientY - r.top, r.height - h - 4) + 'px';
}
window.addEventListener('pointerdown', (e) => {
  if (!e.target.closest || !e.target.closest('#ctxmenu')) closeCtx();
});

// ======================= Input mouse =======================
let nav = null;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (ev) => {
  playing = false;
  lastEv = ev;
  canvas.focus();
  let mode = null;
  closeCtx();
  if (ev.button === 1 || ev.button === 2) mode = ev.shiftKey ? 'pan' : 'orbit';
  else if (ev.button === 0 && tool.nav) mode = ev.shiftKey && tool.nav === 'orbit' ? 'pan' : tool.nav;
  try { canvas.setPointerCapture(ev.pointerId); } catch {}
  if (mode) {
    nav = { mode, x: ev.clientX, y: ev.clientY, sx: ev.clientX, sy: ev.clientY, btn: ev.button };
    ev.preventDefault();
    return;
  }
  if (ev.button === 0 && tool.down) tool.down(ev);
});

canvas.addEventListener('pointermove', (ev) => {
  if (nav) {
    const dx = ev.clientX - nav.x, dy = ev.clientY - nav.y;
    nav.x = ev.clientX;
    nav.y = ev.clientY;
    if (nav.mode === 'orbit') {
      view.az -= dx * 0.006;
      view.el += dy * 0.006;
    } else {
      const h = canvas.clientHeight;
      const k = view.ortho
        ? (2 * view.dist * Math.tan(THREE.MathUtils.degToRad(persp.fov / 2))) / h
        : (2 * view.dist * Math.tan(THREE.MathUtils.degToRad(persp.fov / 2))) / h;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      view.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
    }
    updateCamera();
    return;
  }
  lastEv = ev;
  tool.move && tool.move(ev);
});

canvas.addEventListener('pointerup', (ev) => {
  if (nav) {
    const click = nav.btn === 2 && Math.hypot(ev.clientX - nav.sx, ev.clientY - nav.sy) < 4;
    nav = null;
    if (click) openCtx(ev);
    return;
  }
  tool.up && tool.up(ev);
});

canvas.addEventListener('pointerleave', () => {
  if (!nav) hideSnap();
});

canvas.addEventListener('dblclick', (ev) => tool.dbl && tool.dbl(ev));

canvas.addEventListener(
  'wheel',
  (ev) => {
    ev.preventDefault();
    const f = Math.exp(ev.deltaY * 0.0012);
    const nd = Math.max(0.2, Math.min(2500, view.dist * f));
    const k = nd / view.dist;
    const ray = getRay(ev);
    const dir = camDir();
    const p = rayPlane(ray, view.target, dir) || view.target.clone();
    view.target.copy(p).addScaledVector(view.target.clone().sub(p), k);
    view.dist = nd;
    updateCamera();
  },
  { passive: false },
);

// ======================= Keyboard =======================
const keyTools = {};
const defaultKeys = Object.fromEntries(Object.entries(tools).map(([n, t]) => [n, t.key || '']));
function loadKeys() {
  let custom = {};
  try {
    custom = JSON.parse(localStorage.getItem('sketchclone.keys') || '{}');
  } catch {}
  for (const k of Object.keys(keyTools)) delete keyTools[k];
  for (const [n, t] of Object.entries(tools)) {
    t.key = custom[n] !== undefined ? custom[n] : defaultKeys[n];
    if (t.key) keyTools[t.key] = n;
  }
  document.querySelectorAll('#toolbar [data-tool]').forEach((b) => {
    const t = tools[b.dataset.tool];
    b.title = t.label.replace(/\s*\(.*\)$/, '') + (t.key ? ` (${t.key === ' ' ? 'Spasi' : t.key.toUpperCase()})` : '');
  });
}
function openKeys() {
  const box = $('keyList');
  box.replaceChildren();
  for (const [n, t] of Object.entries(tools)) {
    if (n === 'place') continue;
    const inp = mkEl('input', { value: t.key === ' ' ? 'Spasi' : (t.key || '').toUpperCase(), maxLength: 5, className: 'keyin' });
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (e.key === 'Backspace' || e.key === 'Delete') inp.value = '';
      else if (e.key === ' ') inp.value = 'Spasi';
      else if (/^[a-z0-9]$/i.test(e.key)) inp.value = e.key.toUpperCase();
    });
    inp.dataset.tool = n;
    box.append(mkEl('label', { className: 'krow' }, mkEl('span', { textContent: t.label.replace(/\s*\(.*\)$/, '') }), inp));
  }
  $('keyDlg').hidden = false;
}
function saveKeys() {
  const map = {}, used = new Map();
  for (const inp of document.querySelectorAll('#keyList .keyin')) {
    const v = inp.value === 'Spasi' ? ' ' : inp.value.toLowerCase();
    if (v && used.has(v)) return toast(`Tombol "${inp.value}" dipakai dua kali (${used.get(v)})`);
    if (v) used.set(v, tools[inp.dataset.tool].label);
    map[inp.dataset.tool] = v;
  }
  try {
    localStorage.setItem('sketchclone.keys', JSON.stringify(map));
  } catch {}
  loadKeys();
  $('keyDlg').hidden = true;
  toast('Pintasan disimpan');
}
loadKeys();

window.addEventListener('keydown', (ev) => {
  if (ev.target && ev.target.closest && ev.target.closest('input:not([type=checkbox]):not([type=range]), textarea, select')) return;
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const k = ev.key;

  if (!$('help').hidden && k === 'Escape') {
    $('help').hidden = true;
    return;
  }
  if (/^[0-9.,;\-/*]$/.test(k) || (vcbText && /^[mcsxinft"']$/i.test(k))) {
    vcbText += k;
    renderVCB();
    ev.preventDefault();
    return;
  }
  if (k === 'Backspace' && vcbText) {
    vcbText = vcbText.slice(0, -1);
    renderVCB();
    return;
  }
  if (k === 'Enter') {
    if (vcbText && tool.onVCB) {
      const t = vcbText;
      vcbText = '';
      tool.onVCB(t);
      renderVCB();
    } else {
      vcbText = '';
      renderVCB();
      tool.onEnter && tool.onEnter();
    }
    return;
  }
  if (k === 'Escape') {
    closeCtx();
    if (vcbText) vcbText = '';
    else if (tool === tools.select && editGroup != null) exitEdit();
    else {
      const wasLine = tool === tools.line;
      cancelTool();
      if (wasLine) setHint(tool.hint);
    }
    renderVCB();
    return;
  }
  if (k === 'Delete') {
    if (selection.size) {
      G.deleteIds(model, selection);
      selection = new Set();
      changed();
    }
    return;
  }
  if (tool.onArrow && /^Arrow/.test(k)) {
    tool.onArrow(k);
    ev.preventDefault();
    return;
  }
  const arrow = { ArrowRight: 0, ArrowLeft: 1, ArrowUp: 2 }[k];
  if (arrow !== undefined) {
    lockAxis = lockAxis === arrow ? null : arrow;
    toast(lockAxis == null ? 'Kunci sumbu dilepas' : `Dikunci pada sumbu ${AXNAME[lockAxis]}`);
    tool.onLock && tool.onLock();
    ev.preventDefault();
    return;
  }
  if (k === 'ArrowDown') {
    lockAxis = null;
    tool.onLock && tool.onLock();
    ev.preventDefault();
    return;
  }
  if (k === 'Z' && ev.shiftKey) return;
  const name = keyTools[k.toLowerCase()];
  if (name && !ev.shiftKey) setTool(name);
});

// ======================= Berkas & menu =======================
async function confirmDiscard() {
  return hi === savedHi || confirm('Ada perubahan yang belum disimpan. Lanjutkan tanpa menyimpan?');
}

function loadModel(m) {
  cancelTool();
  playing = false;
  activeScene = -1;
  model = G.normalizeModel(m);
  editGroup = null;
  selection = new Set();
  history = [G.cloneModel(model)];
  hi = 0;
  savedHi = 0;
  snapCache = null;
  refresh();
  updateTitle();
  updateInfo();
}

function serializeProject() {
  const used = {};
  for (const f of model.faces) if (f.tex && f.tex.startsWith('u:') && textures.has(f.tex)) used[f.tex] = textures.get(f.tex);
  return JSON.stringify({ format: 'sketchclone', version: 2, model, textures: used, camera: { target: A(view.target), dist: view.dist, az: view.az, el: view.el } });
}

async function saveProject(forceDialog) {
  const p = await window.api.save(serializeProject(), filePath, forceDialog);
  if (!p) return;
  filePath = p;
  savedHi = hi;
  updateTitle();
  window.api.autosaveClear();
  window.api.versionAdd(filePath, serializeProject());
  toast('Tersimpan');
}

function applyProjectData(text, path, dirtyAfter = false) {
  const d = JSON.parse(text);
  if (d.format !== 'sketchclone' || !Array.isArray(d.model?.faces) || !Array.isArray(d.model?.lines)) throw new Error('format');
  filePath = path;
  for (const [id, t] of Object.entries(d.textures || {})) textures.set(id, t);
  renderMatPanel();
  loadModel(d.model);
  if (dirtyAfter) {
    savedHi = -1;
    updateTitle();
  }
  if (d.camera) {
    view.target.fromArray(d.camera.target);
    Object.assign(view, { dist: d.camera.dist, az: d.camera.az, el: d.camera.el });
    updateCamera();
  }
}

async function openProject(path = null) {
  if (!(await confirmDiscard())) return;
  const r = path ? await window.api.openPath(path) : await window.api.open();
  if (!r) {
    if (path) toast('Berkas tidak ditemukan');
    return;
  }
  try {
    applyProjectData(r.data, r.path);
    window.api.autosaveClear();
  } catch {
    toast('Berkas tidak valid');
  }
}

// ---- Simpan otomatis & pemulihan ----
setInterval(() => {
  if (hi !== savedHi) window.api.autosave(serializeProject());
}, 90 * 1000);
// cuplikan versi berkala (tiap 10 menit bila ada perubahan sejak cuplikan terakhir)
let lastVersionHi = -1;
setInterval(() => {
  if (hi !== lastVersionHi && model.faces.length) {
    lastVersionHi = hi;
    window.api.versionAdd(filePath || 'tanpa-judul', serializeProject());
  }
}, 10 * 60 * 1000);

async function openVersions() {
  const list = await window.api.versionList(filePath || 'tanpa-judul');
  const box = $('verList');
  box.replaceChildren();
  if (!list.length) box.append(mkEl('div', { className: 'muted', textContent: 'Belum ada versi tersimpan. Versi dibuat setiap kali menyimpan dan tiap 10 menit.' }));
  for (const v of list) {
    box.append(mkEl('div', { className: 'vrow' },
      mkEl('span', { textContent: new Date(v.time).toLocaleString('id-ID') }),
      mkEl('span', { className: 'muted', textContent: (v.size / 1024).toFixed(0) + ' KB' }),
      mkEl('button', {
        textContent: 'Pulihkan',
        onclick: async () => {
          if (!(await confirmDiscard())) return;
          const data = await window.api.versionRead(filePath || 'tanpa-judul', v.name);
          if (!data) return toast('Versi tidak terbaca');
          const keep = filePath;
          applyProjectData(data, keep, true);
          $('verDlg').hidden = true;
          toast('Versi dipulihkan (belum disimpan)');
        },
      })));
  }
  $('verDlg').hidden = false;
}

async function checkRecovery() {
  const r = await window.api.autosaveRead();
  if (!r) return;
  const bar = $('recover');
  $('recoverTime').textContent = new Date(r.mtime).toLocaleString('id-ID');
  bar.hidden = false;
  $('recoverYes').onclick = () => {
    bar.hidden = true;
    try {
      applyProjectData(r.data, null, true);
      toast('Pekerjaan dipulihkan. Jangan lupa simpan (Ctrl+S).');
    } catch {
      toast('Data pemulihan rusak');
    }
    window.api.autosaveClear();
  };
  $('recoverNo').onclick = () => {
    bar.hidden = true;
    window.api.autosaveClear();
  };
}

// ---- Ekspor gambar PNG (resolusi 2x layar, termasuk latar & label) ----
async function exportPNG(scale = 2, toFile = true) {
  const pr = renderer.getPixelRatio();
  renderer.setPixelRatio(pr * scale);
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  if (styleOf(model).ao) {
    aoInteract = false;
    renderAO();
  } else renderer.render(scene, camera);
  const c2 = document.createElement('canvas');
  c2.width = canvas.width;
  c2.height = canvas.height;
  const g = c2.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, c2.height);
  const bgc = BACKGROUNDS[styleOf(model).bg] || BACKGROUNDS.sky;
  grad.addColorStop(0, bgc[0]);
  grad.addColorStop(0.45, bgc[1]);
  grad.addColorStop(1, bgc[2]);
  g.fillStyle = grad;
  g.fillRect(0, 0, c2.width, c2.height);
  g.drawImage(canvas, 0, 0);
  const k = c2.width / canvas.clientWidth;
  g.font = `${12 * k}px "Segoe UI", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  for (const el of labelLayer.children) {
    const sp = toScreen(el._p);
    if (!sp) continue;
    const x = sp.x * k, y = sp.y * k - 4 * k;
    const w = g.measureText(el.textContent).width + 12 * k;
    if (!el.classList.contains('dim')) {
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.fillRect(x - w / 2, y - 18 * k, w, 18 * k);
    }
    g.fillStyle = el.classList.contains('dim') ? '#c0392b' : '#1e2430';
    g.fillText(el.textContent, x, y - 2 * k);
  }
  renderer.setPixelRatio(pr);
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  requestRender();
  if (toFile === 'url') return c2.toDataURL('image/jpeg', 0.9);
  const blob = await new Promise((r) => c2.toBlob(r, 'image/png'));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!toFile) return bytes.length;
  const base = filePath ? filePath.split(/[\\/]/).pop().replace(/\.skc$/, '') : 'model';
  const out = await window.api.exportBinary('png', bytes, base + '.png');
  out && toast(`Gambar disimpan (${c2.width}×${c2.height})`);
  return bytes.length;
}

const HELP = `<h3>Pintasan Keyboard</h3><table>
<tr><td>Spasi</td><td>Pilih</td></tr><tr><td>L</td><td>Garis</td></tr><tr><td>R</td><td>Persegi panjang</td></tr>
<tr><td>C</td><td>Lingkaran</td></tr><tr><td>P</td><td>Dorong/Tarik</td></tr><tr><td>M</td><td>Pindah</td></tr>
<tr><td>Q</td><td>Putar</td></tr><tr><td>S</td><td>Skala</td></tr><tr><td>E</td><td>Penghapus</td></tr><tr><td>B</td><td>Cat</td></tr>
<tr><td>O / H</td><td>Orbit / Geser</td></tr>
<tr><td>Tombol tengah/kanan</td><td>Orbit (+Shift: geser). Roda: zoom ke kursor</td></tr>
<tr><td>→ ← ↑</td><td>Kunci sumbu merah / hijau / biru (↓ lepas)</td></tr>
<tr><td>Angka + Enter</td><td>Ukuran tepat (m, cm, mm). Persegi: 3,2 atau 3;2</td></tr>
<tr><td>T</td><td>Pita ukur + garis bantu</td></tr><tr><td>Klik ganda</td><td>Pilih objek / masuk-keluar grup</td></tr><tr><td>Ctrl+G / Ctrl+Shift+G</td><td>Buat grup / komponen (Ctrl+Shift+E: urai)</td></tr><tr><td>Ctrl+klik (Pindah)</td><td>Salin objek (Ctrl+D: duplikat)</td></tr><tr><td>A / G / F / W</td><td>Busur / Poligon (8s = 8 sisi) / Offset / Follow Me</td></tr><tr><td>D / X</td><td>Dimensi / Teks</td></tr><tr><td>N</td><td>Bidang potong (section plane)</td></tr><tr><td>Edit → Solid</td><td>Gabung / Kurangi / Irisan dua benda</td></tr><tr><td>Ctrl+Shift+K</td><td>Konsol skrip &amp; plugin</td></tr><tr><td>K / J / U</td><td>Lihat Sekeliling / Jalan / Posisi Kamera</td></tr><tr><td>Ctrl + Pindah/Putar</td><td>Salin, lalu ketik 5x (larik) atau /5 (bagi rata)</td></tr><tr><td>Y / Z / V</td><td>Teks 3D / Medan baru / Smoove</td></tr><tr><td>Seret kotak</td><td>Kiri→kanan: di dalam · kanan→kiri: menyentuh</td></tr><tr><td>Klik kanan</td><td>Menu konteks (orbit: seret tombol kanan/tengah)</td></tr><tr><td>Ctrl+Shift+R</td><td>Bulatkan sudut bidang/benda terpilih (radius)</td></tr><tr><td>Ctrl+Shift+B / U</td><td>Bulatkan semua rusuk / Haluskan permukaan</td></tr><tr><td>Skala + panah</td><td>Skala satu sumbu (negatif = cermin)</td></tr><tr><td>Ctrl+Shift+D</td><td>Lentur / Runcing / Puntir</td></tr><tr><td>Ctrl+Shift+M</td><td>Salinan cermin bertaut (simetri)</td></tr><tr><td>Ctrl+Shift+I</td><td>Potong bersilangan (Intersect)</td></tr><tr><td>Ctrl+Shift+J</td><td>Asisten AI (teks/gambar → model)</td></tr><tr><td>Ctrl+P</td><td>Gambar kerja PDF</td></tr><tr><td>Delete</td><td>Hapus pilihan</td></tr><tr><td>Ctrl+Z / Ctrl+Y</td><td>Urungkan / Ulangi</td></tr>
<tr><td>Ctrl+S / Ctrl+O</td><td>Simpan / Buka</td></tr><tr><td>Shift+Z</td><td>Zoom semua</td></tr><tr><td>Esc</td><td>Batal</td></tr></table>
<p style="color:#6b7686">Tekan Esc untuk menutup.</p>`;

function groupCmd(isComp) {
  if (!selection.size) return toast('Pilih objek dulu dengan alat Pilih');
  const ids = expand(selection);
  const kind = isComp ? 'Komponen' : 'Grup';
  const n = Object.values(model.groups).filter((g) => !!g.def === isComp).length + 1;
  G.makeGroup(model, ids, `${kind}#${n}`, isComp, editGroup);
  selection = expand(ids);
  changed();
  toast(`${kind} dibuat. Klik ganda untuk mengedit.`);
}

function explodeCmd() {
  const gs = new Set([...model.faces, ...model.lines].filter((e) => selection.has(e.id)).map(topOf).filter((g) => g != null));
  if (!gs.size) return toast('Pilih grup/komponen dulu');
  G.explode(model, gs);
  changed();
  toast('Grup diurai');
}

function duplicateCmd() {
  if (!selection.size) return toast('Pilih objek dulu');
  const ids = G.duplicate(model, expand(selection), editGroup);
  G.translate(model, ids, new THREE.Vector3(0.5, 0.5, 0));
  selection = ids;
  changed();
}

function solidOp(op) {
  const order = [];
  for (const id of selection) {
    const f = model.faces.find((x) => x.id === id);
    if (f && f.solid != null && !order.includes(f.solid)) order.push(f.solid);
  }
  if (order.length !== 2) return toast('Pilih tepat dua benda: klik ganda benda pertama, lalu Shift+klik ganda benda kedua');
  try {
    const r = booleanSolids(model, order[0], order[1], op);
    if (r === 'open') return toast('Gagal: kedua benda harus solid tertutup. Tips: buat benda di area kosong (tidak digambar di atas bidang lain) agar tidak menempel.');
    if (r !== 'ok') return toast('Operasi solid gagal');
  } catch (e) {
    console.error(e);
    return toast('Operasi solid gagal: kedua benda harus tertutup rapat');
  }
  selection = new Set();
  changed();
  toast({ union: 'Benda digabung', subtract: 'Benda kedua dikurangkan dari benda pertama', intersect: 'Irisan dibuat' }[op]);
}

// ---- Konsol skrip & plugin (ekstensi) ----
const conOut = (...a) => {
  const o = $('conOut');
  o.textContent += a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n';
  o.scrollTop = o.scrollHeight;
};
const pluginCommands = [];
const sketch = {
  get model() { return model; },
  get selection() { return [...selection]; },
  THREE,
  face(pts, color) {
    const f = G.addFace(model, pts, null, editGroup);
    if (f && color) f.color = color;
    return f;
  },
  box(x, y, z, w, d, h, color) {
    const f = this.face([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]], color);
    if (!f) return null;
    G.pushPull(model, f.id, h);
    return f.solid;
  },
  cylinder(cx, cy, cz, r, h, seg = 32, color) {
    const pts = [...Array(seg)].map((_, i) => [cx + r * Math.cos((i / seg) * Math.PI * 2), cy + r * Math.sin((i / seg) * Math.PI * 2), cz]);
    const f = this.face(pts, color);
    if (!f) return null;
    G.pushPull(model, f.id, h);
    return f.solid;
  },
  line(a, b) { return G.addLine(model, a, b, editGroup); },
  _prim(kind, x, y, z, a, b, color, n = [0, 0, 1]) {
    const res = G.primitive(model, kind, [x, y, z], n, a, b, color || '#e9e4d4', 32);
    res.ids.forEach((id) => { const f = model.faces.find((q) => q.id === id); if (f) f.group = editGroup; });
    return res.sid;
  },
  sphere(x, y, z, r, color) { return this._prim('sphere', x, y, z, r, 0, color); },
  cone(x, y, z, r, h, color) { return this._prim('cone', x, y, z, r, h, color); },
  capsule(x, y, z, r, h, color) { return this._prim('capsule', x, y, z, r, h, color); },
  torus(x, y, z, R, r, color) { return this._prim('torus', x, y, z, R, r, color); },
  ellipsoid(cx, cy, cz, rx, ry, rz, color) {
    const sid = this._prim('sphere', cx, cy, cz - rz, rz, 0, color);
    G.scaleAxes(model, new Set(this.solidFaces(sid)), new THREE.Vector3(cx, cy, cz), rx / rz, ry / rz, 1);
    return sid;
  },
  roundBox(x, y, z, w, d, h, r, color) {
    const sid = this.box(x, y, z, w, d, h, color);
    const top = model.faces.find((f) => f.solid === sid && f.n[2] > 0.99);
    if (top && r > 0 && G.roundPrism(model, top.id, r)) return model.faces[model.faces.length - 1].solid;
    return sid;
  },
  wall(points, thickness = 0.15, height = 2.8, closed = false, color = '#efece6') {
    const fp = G.wallFootprint(points, thickness, closed);
    if (!fp) return null;
    const f = G.makeFace(model, fp.pts, new THREE.Vector3(0, 0, 1), color);
    f.holes = fp.holes;
    f.group = editGroup;
    model.faces.push(f);
    G.pushPull(model, f.id, height);
    levelTag(C.makeWallGroup(model, f.solid, { t: thickness, h: height, pts: points, closed }, editGroup));
    return f.solid;
  },
  opening(faceId, point, type = 'pintu', w, h, sill) {
    const o = {};
    if (w > 0) o.w = w;
    if (h > 0) o.h = h;
    if (sill >= 0) o.sill = sill;
    const r = C.placeOpening(model, faceId, V3(point), type, o);
    if (r.error) throw new Error(r.error);
    return r.gid;
  },
  door(faceId, point, w, h) { return this.opening(faceId, point, 'pintu', w, h, 0); },
  window(faceId, point, w, h, sill) { return this.opening(faceId, point, 'jendela', w, h, sill); },
  wallFaceAt(x, y, z = 1) {
    // bidang dinding tegak terdekat dari titik (x,y,z); proyeksi memakai jarak bertanda
    const P = new THREE.Vector3(x, y, z);
    let best = null, bd = Infinity, bp = null;
    for (const f of model.faces) {
      if (Math.abs(f.n[2]) > 0.1 || f.solid == null) continue;
      const n = V3(f.n), sd = P.clone().sub(V3(f.pts[0])).dot(n);
      if (Math.abs(sd) >= bd) continue;
      const q = P.clone().addScaledVector(n, -sd);
      const bx = new THREE.Box3().setFromPoints(f.pts.map(V3)).expandByScalar(0.01);
      if (bx.containsPoint(q)) { bd = Math.abs(sd); best = f; bp = q; }
    }
    return best ? { id: best.id, point: [bp.x, bp.y, bp.z] } : null;
  },
  room(x, y, name = 'Ruang') {
    const z = curLevel().z;
    const out = C.roomOutline(model, x, y, roomSliceZ(z), (f) => !model.groups[f.group]?.room);
    if (!out) throw new Error('titik tidak berada dalam ruang tertutup dinding');
    return levelTag(C.makeRoom(model, out, name, z, { parent: editGroup }));
  },
  level(name, z, h = 3.5) {
    const L = C.levelsOf(model);
    let i = L.findIndex((l) => l.name === name);
    if (i < 0) {
      addLevel();
      i = L.length - 1;
      L[i].name = name;
      if (z != null) L[i].z = z;
      L[i].h = h;
    }
    model.activeLevel = i;
    return i;
  },
  rab() { return C.rabRows(model); },
  stairs(x, y, angleDeg = 0, w = 0.9, shape = 'lurus') {
    const z = curLevel().z;
    const r = C.placeStair(model, new THREE.Vector3(x, y, z), (angleDeg * Math.PI) / 180, C.stairSpec(nextLevelHeight(), { w, shape }), editGroup);
    levelTag(r.gid);
    C.cutStairVoid(model, r.gid);
    return r.gid;
  },
  mep(kind, x, y, z, wallNormal = null, angleDeg = 0) {
    if (!C.MEP[kind]) throw new Error('utilitas tidak ada: ' + kind + ' (pilihan: ' + Object.keys(C.MEP).join(', ') + ')');
    const z0 = z ?? curLevel().z;
    const r = C.placeMep(model, kind, new THREE.Vector3(x, y, z0), wallNormal ? V3(wallNormal) : new THREE.Vector3(0, 0, 1), (angleDeg * Math.PI) / 180, { levelZ: curLevel().z, ceilingZ: ceilingZ(), parent: editGroup });
    levelTag(r.gid);
    return r.gid;
  },
  slab(pts, zTop, t = 0.12) { return elemTag(C.makeSlab(model, pts, zTop, t, editGroup), zTop - 0.5); },
  beam(a, b, zTop, bw = 0.15, h = 0.3) { return elemTag(C.makeBeam(model, a, b, zTop, bw, h, editGroup), zTop - 0.5); },
  column(x, y, b = 0.2, H, foot) {
    const lv = curLevel(), ground = (model.activeLevel || 0) === 0;
    return levelTag(C.makeColumn(model, x, y, lv.z, H ?? nextLevelHeight(), b, { foot: foot ?? (ground ? 0.8 : 0), depth: 1.0 }, editGroup));
  },
  phase(gids, ph) { if (!C.PHASE_LABEL[ph]) throw new Error("fase: 'exist' | 'demo' | 'new'"); model.reno = { view: 'warna', ...(model.reno || {}) }; return C.setPhase(model, [].concat(gids), ph); },
  existingAll() { markAllExisting(); },
  structCheck() { return S.structCheck(model).items.filter((x) => x.lvl !== 'ok').map((x) => `${x.lvl === 'err' ? 'MASALAH' : 'PERINGATAN'} ${x.el}: ${x.msg}`); },
  fixStructure() { return fixAllStruct().n; },
  pondasi(p) { model.rab ||= {}; model.rab.pondasi = { ...(model.rab.pondasi || {}), ...p }; return C.pondasiOf(model); },
  roof(solidIds, pitchDeg = 30, overhang = 0.4) {
    const ids = new Set(solidIds.flatMap((sid) => this.solidFaces(sid)));
    const sid = G.gableRoof(model, G.bboxOf(model, ids), pitchDeg, overhang, '#ffffff', editGroup);
    if (sid != null) {
      G.paint(model, new Set(this.solidFaces(sid)), '#ffffff', 'b:atap', 0.6);
      model.groups[G.makeGroup(model, new Set(this.solidFaces(sid)), 'Atap', false, editGroup)].roof = { pitch: pitchDeg };
    }
    return sid;
  },
  library(name, x, y, z = 0, angleDeg = 0) {
    if (!LIBRARY[name]) throw new Error('item pustaka tidak ada: ' + name + ' (pilihan: ' + Object.keys(LIBRARY).join(', ') + ')');
    return insertLibrary(model, name, new THREE.Vector3(x, y, z), (angleDeg * Math.PI) / 180, editGroup).gid;
  },
  light(x, y, z, power = 20, spotDown = false) {
    model.lights ||= [];
    model.lights.push({ id: model.nextId++, p: [x, y, z], dir: spotDown ? [0, 0, -1] : null, color: '#ffd59a', power });
  },
  finish(ids, kind) { for (const f of model.faces) if (ids.includes(f.id)) f.finish = kind; },
  smooth(ids, level = 2) { return [...(G.subdivide(model, new Set(ids), level) || [])]; },
  roundEdges(solid, r) { const fs = this.solidFaces(solid); return fs.some((id) => G.roundPrism(model, id, r)) ? model.faces[model.faces.length - 1].solid : solid; },
  subtract(a, b) { return booleanSolids(model, a, b, 'subtract') === 'ok' ? model.faces[model.faces.length - 1].solid : null; },
  union(a, b) { return booleanSolids(model, a, b, 'union') === 'ok' ? model.faces[model.faces.length - 1].solid : null; },
  style(patch) { model.style = { ...styleOf(model), ...patch }; },
  units(u) { model.units = { ...unitOf(), u }; },
  pushPull(id, d) { return G.pushPull(model, id, d); },
  solidFaces(solid) { return model.faces.filter((f) => f.solid === solid).map((f) => f.id); },
  move(ids, dx, dy, dz) { G.translate(model, new Set(ids), new THREE.Vector3(dx, dy, dz)); },
  rotate(ids, deg, cx = 0, cy = 0, cz = 0) { G.rotate(model, new Set(ids), new THREE.Vector3(cx, cy, cz), AXES[2], (deg * Math.PI) / 180); },
  scale(ids, f, cx = 0, cy = 0, cz = 0) { G.scale(model, new Set(ids), new THREE.Vector3(cx, cy, cz), f); },
  paint(ids, color, tex = null, texScale = 1, texScaleV = null, texRot = 0) { G.paint(model, new Set(ids), color, tex, texScale, texScaleV, texRot); },
  group(ids, name = 'Grup', component = false) { return G.makeGroup(model, new Set(ids), name, component, editGroup); },
  boolean(a, b, op) { return booleanSolids(model, a, b, op); },
  remove(ids) { G.deleteIds(model, new Set(ids)); },
  scaleIds(ids, sx, sy, sz, cx = 0, cy = 0, cz = 0) { G.scaleAxes(model, new Set(ids), new THREE.Vector3(cx, cy, cz), sx, sy, sz); },
  select(ids) { selection = new Set(ids); },
  text(p, t) { model.labels.push({ id: model.nextId++, p, text: String(t) }); },
  log: conOut,
  toast,
  addCommand(name, fn) {
    pluginCommands.push({ name, fn });
    window.api.setPluginMenu(pluginCommands.map((c) => c.name));
    renderPluginButtons();
  },
};
function runGuarded(fn, label) {
  try {
    const r = fn();
    if (r !== undefined) conOut(r);
  } catch (e) {
    conOut(`[${label}] Error: ${e.message}`);
    toast(`Error di ${label}: ${e.message}`);
  }
  changed();
}
function runScript(code, label = 'konsol') {
  let fn;
  try {
    fn = new Function('sketch', 'THREE', code);
  } catch (e) {
    conOut(`[${label}] Sintaks salah: ${e.message}`);
    return;
  }
  runGuarded(() => fn(sketch, THREE), label);
}
function renderPluginButtons() {
  const box = $('plugBtns');
  box.replaceChildren();
  pluginCommands.forEach((c) => {
    const b = document.createElement('button');
    b.textContent = c.name;
    b.onclick = () => runGuarded(c.fn, c.name);
    box.appendChild(b);
  });
}
async function loadPlugins() {
  pluginCommands.length = 0;
  renderPluginButtons();
  window.api.setPluginMenu([]);
  const list = await window.api.listPlugins();
  for (const pl of list) {
    try {
      new Function('sketch', 'THREE', pl.code)(sketch, THREE);
      conOut(`Plugin dimuat: ${pl.name}`);
    } catch (e) {
      conOut(`Plugin ${pl.name} gagal: ${e.message}`);
    }
  }
}
$('conRun').onclick = () => runScript($('conIn').value);
$('conClose').onclick = () => ($('console').hidden = true);
$('conIn').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault();
    runScript($('conIn').value);
  }
});

// ---- panel material ----
$('matImport').onclick = () => $('matFile').click();
$('matFile').onchange = (e) => {
  const f = e.target.files[0];
  if (f) importTexture(f);
  e.target.value = '';
};
$('matScale').onchange = (e) => {
  const v = parseFloat(e.target.value);
  if (v > 0) curMat.scale = v;
  e.target.blur();
};
$('matScaleV').onchange = (e) => {
  const v = parseFloat(e.target.value);
  curMat.scaleV = v > 0 ? v : null;
  e.target.blur();
};
$('matFinish').onchange = (e) => {
  curMat.finish = e.target.value;
  e.target.blur();
};
$('matRot').onchange = (e) => {
  const v = parseFloat(e.target.value);
  curMat.rot = isNaN(v) ? 0 : v;
  e.target.blur();
};
for (const id of ['matScale', 'matScaleV', 'matRot']) $(id).addEventListener('keydown', (e) => e.stopPropagation());
renderMatPanel();

// ======================= Panel kanan (tray) =======================
const mkEl = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on') || k in e) e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c);
  return e;
};
const trow = (label, control) => mkEl('label', { className: 'row' }, mkEl('span', { textContent: label }), control);

let trayTab = 'info';
function showTray(tab) {
  $('tray').hidden = false;
  if (tab) trayTab = tab;
  document.querySelectorAll('#trayTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === trayTab));
  document.querySelectorAll('#tray .pane').forEach((p) => (p.hidden = p.id !== 'pane-' + trayTab));
  renderTray();
}
function toggleTray() {
  $('tray').hidden = !$('tray').hidden;
  if (!$('tray').hidden) showTray();
}
document.querySelectorAll('#trayTabs button').forEach((b) => (b.onclick = () => showTray(b.dataset.tab)));

function renderTray() {
  if ($('tray').hidden) return;
  const fn = { lib: renderLibPane, info: renderInfoPane, mat: renderMatPanel, tags: renderTagsPane, outliner: renderOutliner, scenes: renderScenesPane, styles: renderStylesPane, kons: renderKonsPane, prod: renderProdPane }[trayTab];
  fn && fn();
}

// ---- Pustaka komponen ----
function renderLibPane() {
  const P = $('pane-lib');
  P.replaceChildren();
  P.append(mkEl('div', { className: 'ttl', textContent: 'Pustaka Komponen' }));
  P.append(mkEl('div', { className: 'libgrid' }, ...Object.entries(LIBRARY).map(([k, it]) =>
    mkEl('button', {
      title: `Tempatkan ${it.name}`,
      onclick: () => startPlace({ label: it.name, gen: (m, at, n, angle) => insertLibrary(m, k, at, angle, editGroup) }),
    }, mkEl('b', { textContent: it.icon }), mkEl('span', { textContent: it.name })))));
  P.append(mkEl('div', { className: 'muted small', textContent: 'Klik item lalu klik di model untuk menaruhnya (panah kiri/kanan memutar). Semua salinan item yang sama bertaut: edit satu, semua ikut berubah.' }));
  // pustaka online
  P.append(mkEl('div', { className: 'ttl', style: 'margin-top:16px', textContent: 'Pustaka Online (GitHub)' }));
  if (!onlineLib) P.append(mkEl('div', { className: 'btnrow' }, mkEl('button', { textContent: '☁ Muat pustaka online', onclick: loadOnlineLib })), mkEl('div', { id: 'libStatus', className: 'muted small' }));
  else {
    if (onlineLib.error) P.append(mkEl('div', { className: 'muted small', textContent: onlineLib.error }));
    for (const it of onlineLib.items) P.append(mkEl('div', { className: 'srow' }, mkEl('span', { textContent: it.name }), mkEl('span', { className: 'muted', textContent: (it.size / 1024).toFixed(0) + ' KB' }), mkEl('button', { textContent: 'Tempatkan', onclick: () => placeOnline(it) })));
    P.append(mkEl('div', { className: 'btnrow' }, mkEl('button', { textContent: '↻ Muat ulang', onclick: loadOnlineLib })));
  }
  P.append(mkEl('div', { className: 'btnrow' },
    mkEl('button', { textContent: '💾 Simpan pilihan sebagai komponen', onclick: () => exportSelectionComponent(false) }),
    mkEl('button', { textContent: '⤴ Bagikan ke pustaka online', onclick: () => exportSelectionComponent(true) })));
}

// ---- Pustaka online (GitHub) ----
let onlineLib = null; // null = belum dimuat
async function loadOnlineLib() {
  $('libStatus') && ($('libStatus').textContent = 'Memuat dari GitHub…');
  try {
    const r = await window.api.libList();
    onlineLib = r.error ? { error: r.error, items: [] } : { items: r.items };
  } catch (e) {
    onlineLib = { error: 'Tidak bisa terhubung ke GitHub', items: [] };
  }
  renderTray();
}
// Sisipkan isi berkas .skc sebagai komponen: dipusatkan di XY, alas di z = 0.
function insertModelAsComponent(m, src, at, angle, name, parent = null) {
  const box = G.bboxOf(src);
  const c = box.getCenter(new THREE.Vector3());
  const M = new THREE.Matrix4().makeTranslation(at.x, at.y, at.z).multiply(new THREE.Matrix4().makeRotationZ(angle)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -box.min.z));
  const NM = new THREE.Matrix3().getNormalMatrix(M);
  const gid = m.nextId++;
  m.groups[gid] = { name, def: 'web:' + name, m: M.toArray(), parent };
  const gmap = new Map(), smap = new Map();
  for (const k of Object.keys(src.groups || {})) gmap.set(+k, m.nextId++);
  for (const [k, g] of Object.entries(src.groups || {})) {
    m.groups[gmap.get(+k)] = { ...structuredClone(g), def: g.def ? 'web:' + name + ':' + g.def : null, parent: g.parent != null ? gmap.get(g.parent) : gid, m: M.clone().multiply(new THREE.Matrix4().fromArray(g.m || new THREE.Matrix4().toArray())).toArray() };
  }
  const tp = (p) => A(V3(p).applyMatrix4(M));
  const ids = new Set();
  for (const f of src.faces) {
    const nf = structuredClone(f);
    nf.id = m.nextId++;
    nf.pts = f.pts.map(tp);
    nf.holes = f.holes.map((h) => h.map(tp));
    nf.n = A(V3(f.n).applyMatrix3(NM).normalize());
    if (nf.uv) nf.uv = { o: tp(f.uv.o), u: A(V3(f.uv.u).transformDirection(M)) };
    if (f.solid != null) {
      if (!smap.has(f.solid)) smap.set(f.solid, m.nextId++);
      nf.solid = smap.get(f.solid);
    }
    nf.group = f.group != null ? gmap.get(f.group) : gid;
    m.faces.push(nf);
    ids.add(nf.id);
  }
  for (const l of src.lines || []) {
    m.lines.push({ id: m.nextId++, a: tp(l.a), b: tp(l.b), group: l.group != null ? gmap.get(l.group) : gid });
  }
  return { ids, gid };
}
async function placeOnline(item) {
  toast('Mengunduh ' + item.name + '…');
  const text = await window.api.libGet(item.url);
  if (!text) return toast('Gagal mengunduh komponen');
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    return toast('Berkas komponen rusak');
  }
  for (const [id, t] of Object.entries(d.textures || {})) textures.set(id, t);
  const src = G.normalizeModel(d.model);
  startPlace({ label: item.name, gen: (m, at, n, angle) => insertModelAsComponent(m, src, at, angle, item.name, editGroup) });
}
// Simpan pilihan sebagai berkas komponen .skc (siap dibagikan ke pustaka online)
async function exportSelectionComponent(share = false) {
  if (!selection.size) return toast('Pilih benda yang mau dijadikan komponen');
  const ids = expand(selection);
  const sub = G.normalizeModel(G.newModel());
  const keepGroups = new Set();
  for (const e of [...model.faces, ...model.lines]) {
    if (!ids.has(e.id)) continue;
    (e.pts ? sub.faces : sub.lines).push(structuredClone(e));
    for (let g = gOf(e); g != null; g = G.parentOf(model, g)) keepGroups.add(g);
  }
  for (const g of keepGroups) sub.groups[g] = structuredClone(model.groups[g]);
  for (const g of Object.values(sub.groups)) if (g.parent != null && !keepGroups.has(g.parent)) g.parent = null;
  sub.nextId = model.nextId;
  const used = {};
  for (const f of sub.faces) if (f.tex && f.tex.startsWith('u:') && textures.has(f.tex)) used[f.tex] = textures.get(f.tex);
  const tops = [...keepGroups].filter((g) => sub.groups[g].parent == null);
  const name = tops.length === 1 ? sub.groups[tops[0]].name : 'Komponen';
  const out = await window.api.exportFile('skc', JSON.stringify({ format: 'sketchclone', version: 2, model: sub, textures: used }), name + '.skc');
  if (!out) return;
  toast('Komponen disimpan: ' + out.split(/[\\/]/).pop());
  if (share) {
    await window.api.openUpload();
    toast('Halaman GitHub dibuka: seret berkas .skc ke sana lalu klik "Commit changes"');
  }
}

// ---- Info Entitas ----
function selectedTops() {
  const tops = new Set(), loose = [];
  for (const e of [...model.faces, ...model.lines]) {
    if (!selection.has(e.id)) continue;
    const t = topOf(e);
    if (t != null) tops.add(t);
    else loose.push(e);
  }
  return { tops, loose };
}
function tagSelect(value, onchange) {
  const sel = mkEl(
    'select',
    { onchange: (e) => onchange(e.target.value === '' ? null : +e.target.value) },
    mkEl('option', { value: '', textContent: 'Tanpa tag' }),
    ...model.tags.map((t) => mkEl('option', { value: String(t.id), textContent: t.name })),
  );
  sel.value = value == null ? '' : String(value);
  return sel;
}
function hideSelection() {
  if (!selection.size) return toast('Pilih objek dulu');
  const { tops, loose } = selectedTops();
  tops.forEach((g) => (model.groups[g].hidden = true));
  loose.forEach((e) => (e.hidden = true));
  selection = new Set();
  changed();
  toast('Disembunyikan (Edit → Tampilkan Semua untuk memunculkan)');
}
function unhideAll() {
  for (const e of [...model.faces, ...model.lines]) delete e.hidden;
  for (const g of Object.values(model.groups)) delete g.hidden;
  changed();
}
function renderInfoPane() {
  const P = $('pane-info');
  P.replaceChildren();
  if (!selection.size) {
    const gs = Object.values(model.groups);
    P.append(
      mkEl('div', { className: 'ttl', textContent: 'Tidak ada yang dipilih' }),
      mkEl('div', {
        className: 'kv',
        innerHTML: `Bidang: <b>${model.faces.length}</b><br>Garis: <b>${model.lines.length}</b><br>Grup: <b>${gs.filter((g) => !g.def).length}</b> · Komponen: <b>${gs.filter((g) => g.def).length}</b><br>Tag: <b>${model.tags.length}</b> · Adegan: <b>${model.scenes.length}</b>`,
      }),
    );
    if (editGroup != null && model.groups[editGroup]) P.append(mkEl('div', { className: 'muted small', textContent: `Sedang mengedit: ${model.groups[editGroup].name}` }));
    P.append(mkEl('div', { className: 'ttl', style: 'margin-top:14px', textContent: 'Info Model' }));
    const u = unitOf();
    const us = mkEl('select', { onchange: (e) => { model.units = { ...unitOf(), u: e.target.value }; changed(); } },
      ...[['m', 'Meter'], ['cm', 'Sentimeter'], ['mm', 'Milimeter'], ['in', 'Inci'], ['ft', 'Kaki']].map(([v, t]) => mkEl('option', { value: v, textContent: t })));
    us.value = u.u;
    const ps = mkEl('select', { onchange: (e) => { model.units = { ...unitOf(), prec: +e.target.value }; changed(); } },
      ...[0, 1, 2, 3, 4].map((v) => mkEl('option', { value: String(v), textContent: v ? '0.' + '0'.repeat(v - 1) + '1' : '1' })));
    ps.value = String(u.prec);
    P.append(trow('Satuan', us), trow('Presisi', ps));
    return;
  }
  const { tops, loose } = selectedTops();
  const ids = new Set();
  for (const t of tops) G.entitiesInTree(model, t).forEach((i) => ids.add(i));
  loose.forEach((e) => ids.add(e.id));
  const box = G.bboxOf(model, ids);
  if (tops.size === 1 && !loose.length) {
    const gid = [...tops][0], g = model.groups[gid];
    P.append(mkEl('div', { className: 'ttl', textContent: g.def ? 'Komponen' : 'Grup' }));
    P.append(trow('Nama', mkEl('input', { value: g.name, onchange: (e) => { g.name = e.target.value || g.name; changed(); } })));
    if (g.def) {
      const n = Object.values(model.groups).filter((x) => x.def === g.def).length;
      P.append(trow('Instans', mkEl('span', { textContent: `${n} buah (bertaut)` })));
      if (n > 1) P.append(mkEl('div', { className: 'btnrow' }, mkEl('button', { textContent: 'Jadikan Unik', onclick: () => { g.def = 'd' + model.nextId++; changed(); toast('Komponen dijadikan unik'); } })));
    }
    P.append(trow('Tag', tagSelect(g.tag ?? null, (t) => { g.tag = t; changed(); })));
  } else {
    const nf = loose.filter((e) => e.pts).length, nl = loose.length - nf;
    const parts = [nf && `${nf} bidang`, nl && `${nl} garis`, tops.size && `${tops.size} grup/komponen`].filter(Boolean);
    P.append(mkEl('div', { className: 'ttl', textContent: parts.join(', ') }));
    const tags = new Set([...loose.map((e) => e.tag ?? null), ...[...tops].map((g) => model.groups[g].tag ?? null)]);
    P.append(trow('Tag', tagSelect(tags.size === 1 ? [...tags][0] : null, (t) => {
      loose.forEach((e) => (e.tag = t));
      tops.forEach((g) => (model.groups[g].tag = t));
      changed();
    })));
    if (nf) P.append(trow('Luas', mkEl('span', { textContent: fmtArea(loose.filter((e) => e.pts).reduce((a, f) => a + G.faceArea(f), 0)) })));
    if (nf === 1 && !nl) {
      const f = loose[0];
      P.append(trow('Material', mkEl('span', { textContent: f.tex ? textures.get(f.tex)?.name || 'Tekstur' : f.color })));
    }
  }
  if (!box.isEmpty()) {
    const sz = box.getSize(new THREE.Vector3());
    P.append(trow('Ukuran', mkEl('span', { textContent: `${fmt(sz.x)} × ${fmt(sz.y)} × ${fmt(sz.z)}` })));
  }
  const tf = selectedTexFaces();
  if (tf.length) {
    const f0 = tf[0];
    P.append(mkEl('div', { className: 'ttl', style: 'margin-top:14px', textContent: `Posisi Tekstur (${tf.length} bidang)` }));
    const num = (val, set) => mkEl('input', { value: fmtNum(val), onchange: (e) => { const v = parseFloat(String(e.target.value).replace(',', '.')); if (!isNaN(v)) editTexture((f) => set(f, v)); } });
    P.append(trow('Lebar (m)', num(f0.texScale || 1, (f, v) => v > 0 && (f.texScale = v))));
    P.append(trow('Tinggi (m)', num(f0.texScaleV || f0.texScale || 1, (f, v) => v > 0 && (f.texScaleV = v))));
    P.append(trow('Sudut (°)', num(f0.texRot || 0, (f, v) => (f.texRot = v))));
    P.append(mkEl('div', { className: 'btnrow' },
      mkEl('button', { textContent: 'Putar 90°', onclick: () => editTexture((f) => (f.texRot = ((f.texRot || 0) + 90) % 360)) }),
      mkEl('button', { textContent: 'Pas ke bidang', title: 'Gambar mengisi bidang tepat satu kali, searah tepi terpanjang', onclick: () => editTexture(fitTexture, 'Tekstur dipaskan ke bidang') }),
      mkEl('button', { textContent: 'Reset', onclick: () => editTexture((f) => { const t = textures.get(f.tex); f.texScale = t?.scale || 1; delete f.texScaleV; delete f.texRot; delete f.texOff; delete f.uv; }) })));
  }
  const btns = [mkEl('button', { textContent: 'Sembunyikan', onclick: hideSelection })];
  if (loose.some((e) => e.pts)) btns.unshift(mkEl('button', { textContent: 'Bulatkan sudut…', onclick: filletSel }));
  P.append(mkEl('div', { className: 'btnrow' }, ...btns));
}

// ---- Tag ----
const TAG_COLORS = ['#e8590c', '#2f9e44', '#1971c2', '#9c36b5', '#f08c00', '#0ca678'];
function renderTagsPane() {
  const P = $('pane-tags');
  P.replaceChildren();
  P.append(mkEl('div', { className: 'btnrow' }, mkEl('button', {
    textContent: '+ Tag baru',
    onclick: () => {
      const n = model.tags.length + 1;
      model.tags.push({ id: model.nextId++, name: 'Tag ' + n, visible: true, color: TAG_COLORS[(n - 1) % TAG_COLORS.length] });
      changed();
    },
  })));
  P.append(mkEl('div', { className: 'trow muted' }, mkEl('span', { textContent: '✓' }), mkEl('i'), mkEl('span', { textContent: 'Tanpa tag (selalu tampil)' })));
  for (const t of model.tags) {
    P.append(mkEl('div', { className: 'trow' },
      mkEl('input', { type: 'checkbox', checked: t.visible !== false, title: 'Tampil/sembunyi', onchange: (e) => { t.visible = e.target.checked; snapCache = null; changed(); } }),
      mkEl('i', { className: 'dot', style: `background:${t.color}` }),
      mkEl('input', { value: t.name, onchange: (e) => { t.name = e.target.value || t.name; changed(); } }),
      mkEl('button', {
        textContent: '×',
        title: 'Hapus tag',
        onclick: () => {
          for (const e of [...model.faces, ...model.lines]) if (e.tag === t.id) e.tag = null;
          for (const g of Object.values(model.groups)) if (g.tag === t.id) g.tag = null;
          model.tags = model.tags.filter((x) => x !== t);
          changed();
        },
      })));
  }
  P.append(mkEl('div', { className: 'muted small', textContent: 'Pasang tag pada objek lewat tab Info. Tag yang dimatikan menyembunyikan objeknya.' }));
}

// ---- Outliner ----
function renderOutliner() {
  const P = $('pane-outliner');
  P.replaceChildren();
  const kids = (parent) =>
    Object.entries(model.groups)
      .filter(([, g]) => (g.parent ?? null) === parent)
      .map(([k, g]) => [+k, g])
      .sort((a, b) => a[1].name.localeCompare(b[1].name, 'id', { numeric: true }));
  const loose = model.faces.filter((f) => gOf(f) == null).length + model.lines.filter((l) => gOf(l) == null).length;
  P.append(mkEl('div', { className: 'orow root', textContent: `Model · ${loose} entitas lepas`, onclick: () => { editGroup = null; selection = new Set(); refresh(); updateInfo(); } }));
  const walk = (parent, depth) => {
    for (const [gid, g] of kids(parent)) {
      const tree = G.entitiesInTree(model, gid);
      const on = [...tree].some((i) => selection.has(i));
      const r = mkEl('div', { className: 'orow' + (on ? ' on' : '') + (editGroup === gid ? ' edit' : ''), style: `padding-left:${8 + depth * 14}px` },
        mkEl('button', { className: 'eye', textContent: g.hidden ? '○' : '●', title: g.hidden ? 'Tampilkan' : 'Sembunyikan', onclick: (e) => { e.stopPropagation(); g.hidden = !g.hidden; snapCache = null; changed(); } }),
        mkEl('span', { className: 'ico', textContent: g.def ? '◈' : '▣' }),
        mkEl('span', { textContent: g.name }));
      r.onclick = () => {
        if (editGroup != null && !G.isInTree(model, gid, editGroup)) editGroup = null;
        selection = tree;
        refresh();
        updateInfo();
      };
      r.ondblclick = () => enterEdit(gid);
      P.append(r);
      walk(gid, depth + 1);
    }
  };
  walk(null, 0);
  if (!Object.keys(model.groups).length) P.append(mkEl('div', { className: 'muted small', textContent: 'Belum ada grup/komponen. Buat dengan Ctrl+G / Ctrl+Shift+G.' }));
  else P.append(mkEl('div', { className: 'muted small', textContent: 'Klik: pilih · Klik ganda: edit · ●: tampil/sembunyi' }));
}

// ---- Adegan (Scenes) ----
let activeScene = -1;
let sceneAnim = 0;
let playing = false;
function captureScene(sc) {
  sc.cam = { target: A(view.target), dist: view.dist, az: view.az, el: view.el, ortho: view.ortho };
  sc.style = structuredClone(styleOf(model));
  sc.shadows = { on: sunState.shadows, hour: sunState.hour };
  sc.tags = Object.fromEntries(model.tags.map((t) => [t.id, t.visible !== false]));
  sc.section = model.section ? !!model.section.on : null;
  sc.hiddenGroups = Object.entries(model.groups).filter(([, g]) => g.hidden).map(([k]) => +k);
}
function addScene() {
  const sc = { id: model.nextId++, name: 'Adegan ' + (model.scenes.length + 1) };
  captureScene(sc);
  model.scenes.push(sc);
  activeScene = model.scenes.length - 1;
  changed();
  toast(`${sc.name} ditambahkan`);
}
function goScene(i, dur = 0.8) {
  const sc = model.scenes[i];
  if (!sc) return Promise.resolve();
  model.style = structuredClone(sc.style);
  for (const t of model.tags) if (sc.tags && t.id in sc.tags) t.visible = sc.tags[t.id];
  if (sc.section != null && model.section) model.section.on = sc.section;
  if (sc.hiddenGroups) for (const [k, g] of Object.entries(model.groups)) g.hidden = sc.hiddenGroups.includes(+k);
  setShadows(sc.shadows.on, sc.shadows.hour);
  $('hour').value = sc.shadows.hour;
  $('hourLbl').textContent = hourLabel(sc.shadows.hour);
  if (view.ortho !== !!sc.cam.ortho) setOrtho(!!sc.cam.ortho);
  snapCache = null;
  refresh();
  activeScene = i;
  renderSceneBar();
  renderTray();
  const from = { t: view.target.clone(), dist: view.dist, az: view.az, el: view.el };
  const to = { t: V3(sc.cam.target), dist: sc.cam.dist, az: sc.cam.az, el: sc.cam.el };
  const TAU = Math.PI * 2;
  const daz = ((((to.az - from.az + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  cancelAnimationFrame(sceneAnim);
  const t0 = performance.now();
  return new Promise((res) => {
    const step = (now) => {
      const k = dur <= 0 ? 1 : Math.min(1, (now - t0) / (dur * 1000));
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      view.target.lerpVectors(from.t, to.t, e);
      view.dist = from.dist + (to.dist - from.dist) * e;
      view.az = from.az + daz * e;
      view.el = from.el + (to.el - from.el) * e;
      updateCamera();
      if (k < 1) sceneAnim = requestAnimationFrame(step);
      else res();
    };
    sceneAnim = requestAnimationFrame(step);
  });
}
function renderSceneBar() {
  const bar = $('scenebar');
  bar.replaceChildren();
  model.scenes.forEach((sc, i) => bar.append(mkEl('button', { className: i === activeScene ? 'on' : '', textContent: sc.name, onclick: () => goScene(i) })));
  bar.hidden = !model.scenes.length;
}
async function recordVideo(toFile = true) {
  if (model.scenes.length < 2) return toast('Buat minimal 2 adegan dulu (tab Adegan)');
  if (!window.MediaRecorder) return toast('Perekam video tidak tersedia');
  const stream = canvas.captureStream(30);
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  toast('Merekam video…');
  rec.start(200);
  playing = true;
  for (let i = 0; i < model.scenes.length && playing; i++) {
    await goScene(i, i === 0 ? 0 : 1.6);
    await new Promise((r) => setTimeout(r, 900));
  }
  playing = false;
  rec.stop();
  await done;
  const blob = new Blob(chunks, { type: 'video/webm' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!toFile) return bytes.length;
  const base = filePath ? filePath.split(/[\\/]/).pop().replace(/\.skc$/, '') : 'animasi';
  const out = await window.api.exportBinary('webm', bytes, base + '.webm');
  out && toast('Video disimpan (.webm, bisa diputar di browser/VLC)');
}

async function playScenes() {
  if (playing) {
    playing = false;
    return;
  }
  if (!model.scenes.length) return toast('Belum ada adegan');
  playing = true;
  renderTray();
  let i = (activeScene + 1) % model.scenes.length;
  while (playing) {
    await goScene(i, 1.6);
    if (!playing) break;
    await new Promise((r) => setTimeout(r, 900));
    i = (i + 1) % model.scenes.length;
  }
  renderTray();
}
function renderScenesPane() {
  const P = $('pane-scenes');
  P.replaceChildren();
  P.append(mkEl('div', { className: 'btnrow' },
    mkEl('button', { textContent: '+ Tambah adegan', onclick: addScene }),
    mkEl('button', { textContent: playing ? '■ Berhenti' : '▶ Putar animasi', onclick: playScenes }),
    mkEl('button', { textContent: '● Rekam video', onclick: () => recordVideo() })));
  model.scenes.forEach((sc, i) => {
    P.append(mkEl('div', { className: 'srow' + (i === activeScene ? ' on' : '') },
      mkEl('input', { value: sc.name, onchange: (e) => { sc.name = e.target.value || sc.name; changed(); } }),
      mkEl('button', { textContent: 'Buka', onclick: () => goScene(i) }),
      mkEl('button', { textContent: 'Perbarui', title: 'Simpan tampilan saat ini ke adegan ini', onclick: () => { captureScene(sc); changed(); toast(`${sc.name} diperbarui`); } }),
      mkEl('button', { textContent: '×', title: 'Hapus', onclick: () => { model.scenes.splice(i, 1); activeScene = -1; changed(); } })));
  });
  P.append(mkEl('div', { className: 'muted small', textContent: 'Adegan menyimpan sudut kamera, gaya, bayangan, tag, dan potongan. Klik tab adegan di atas layar untuk berpindah.' }));
}

// ---- Gaya ----
const STYLE_PRESETS = [
  ['Standar', { face: 'shaded', edges: true, width: 1, ext: false }],
  ['Sketsa', { face: 'shaded', edges: true, width: 2, ext: true }],
  ['Arsitek', { face: 'hidden', edges: true, width: 2, ext: true }],
  ['Monokrom', { face: 'mono', edges: true, width: 1, ext: false }],
  ['Kawat', { face: 'wire', edges: true, width: 1, ext: false }],
  ['X-Ray', { face: 'xray', edges: true, width: 1, ext: false }],
  ['Kartun', { face: 'toon', edges: false, width: 2, ext: false, profiles: true }],
  ['Render', { face: 'shaded', edges: false, width: 1, ext: false, profiles: false, smooth: 30, bg: 'studio', ao: true }],
];
function renderStylesPane() {
  const P = $('pane-styles');
  P.replaceChildren();
  const st = styleOf(model);
  P.append(mkEl('div', { className: 'presets' }, ...STYLE_PRESETS.map(([n, v]) =>
    mkEl('button', { textContent: n, className: Object.entries(v).every(([k, x]) => st[k] === x) ? 'on' : '', onclick: () => setStyle(v) }))));
  const faceSel = mkEl('select', { onchange: (e) => setStyle({ face: e.target.value }) },
    ...[['shaded', 'Berbayang + tekstur'], ['toon', 'Kartun (cel)'], ['mono', 'Monokrom'], ['hidden', 'Garis tersembunyi'], ['wire', 'Kawat'], ['xray', 'X-Ray']].map(([v, t]) => mkEl('option', { value: v, textContent: t })));
  faceSel.value = st.face;
  P.append(trow('Bidang', faceSel));
  P.append(trow('Garis tepi', mkEl('input', { type: 'checkbox', checked: st.edges, onchange: (e) => setStyle({ edges: e.target.checked }) })));
  P.append(trow('Tebal garis', mkEl('input', { type: 'range', min: 1, max: 4, step: 1, value: st.width, onchange: (e) => setStyle({ width: +e.target.value }) })));
  P.append(trow('Perpanjangan', mkEl('input', { type: 'checkbox', checked: st.ext, onchange: (e) => setStyle({ ext: e.target.checked }) })));
  P.append(trow('Garis profil', mkEl('input', { type: 'checkbox', checked: !!st.profiles, onchange: (e) => setStyle({ profiles: e.target.checked }) })));
  const bgSel = mkEl('select', { onchange: (e) => setStyle({ bg: e.target.value }) },
    ...[['sky', 'Langit'], ['realsky', 'Langit realistis'], ['studio', 'Studio putih'], ['gray', 'Abu-abu'], ['dark', 'Gelap']].map(([v, t]) => mkEl('option', { value: v, textContent: t })));
  bgSel.value = st.bg || 'sky';
  P.append(trow('Latar', bgSel));
  const lt = mkEl('select', { onchange: (e) => setStyle({ light: e.target.value }) }, mkEl('option', { value: 'day', textContent: 'Siang' }), mkEl('option', { value: 'night', textContent: 'Malam (lampu menyala)' }));
  lt.value = st.light || 'day';
  P.append(trow('Waktu', lt));
  P.append(trow('Bayangan lembut', mkEl('input', { type: 'checkbox', checked: !!st.ao, title: 'Ambient occlusion: bayangan halus di lekukan & sudut', onchange: (e) => setStyle({ ao: e.target.checked }) })));
  const sm = mkEl('select', { onchange: (e) => setStyle({ smooth: +e.target.value }) },
    ...[[0, 'Mati'], [10, '10°'], [20, '20°'], [30, '30°'], [45, '45°']].map(([v, t]) => mkEl('option', { value: String(v), textContent: t })));
  sm.value = String(st.smooth ?? 20);
  P.append(trow('Haluskan', sm));
  P.append(mkEl('div', { className: 'muted small', textContent: 'Gaya ikut tersimpan di adegan.' }));
}

// ---- Impor SketchUp (.skp 2021+) ----
const loopArea = (l) => {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < l.length; i++) {
    const a = l[i], b = l[(i + 1) % l.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return Math.hypot(x, y, z) / 2;
};
async function importSkp(r) {
  let res;
  try {
    res = await parseSkp(r.data);
  } catch (e) {
    return toast('Gagal membaca SketchUp: ' + e.message);
  }
  const all = new Set(), made = [];
  for (const g of res.groups) {
    const ids = new Set();
    for (const sf of g.faces) {
      const loops = sf.loops.slice().sort((a, b) => loopArea(b) - loopArea(a));
      const f = G.makeFace(model, loops[0], sf.n ? V3(sf.n) : null, sf.color || '#e8e4dc');
      if (!f) continue;
      f.holes = loops.slice(1);
      f.group = editGroup;
      model.faces.push(f);
      ids.add(f.id);
    }
    if (!ids.size) continue;
    const gid = G.makeGroup(model, ids, g.name, false, editGroup);
    if (g.layer) {
      let t = model.tags.find((q) => q.name === g.layer);
      model.groups[gid].tag = t ? t.id : newTag(g.layer);
    }
    ids.forEach((i) => all.add(i));
    made.push(gid);
  }
  if (!all.size) return toast('Berkas SketchUp tidak berisi bidang');
  selection = G.expandSelection(model, all, editGroup);
  changed();
  zoomExtents();
  toast(`SketchUp ${res.version || ''} diimpor: ${made.length} grup, ${all.size} bidang`);
  return made;
}

// ---- Impor OBJ/STL ----
async function importMesh(given = null) {
  const r = given || (await window.api.importFile());
  if (!r) return;
  if (r.ext === 'skp') return importSkp(r);
  const buf = r.data.buffer.slice(r.data.byteOffset, r.data.byteOffset + r.data.byteLength);
  const parts = [];
  try {
    if (r.ext === 'stl') parts.push({ g: new STLLoader().parse(buf), color: '#d6d2c8' });
    else {
      const obj = new OBJLoader().parse(new TextDecoder().decode(r.data));
      obj.updateMatrixWorld(true);
      obj.traverse((o) => {
        if (!o.isMesh) return;
        const mat = Array.isArray(o.material) ? o.material[0] : o.material;
        let color = mat && mat.color ? '#' + mat.color.getHexString() : '#d6d2c8';
        if (color === '#ffffff') color = '#d6d2c8';
        parts.push({ g: o.geometry.clone().applyMatrix4(o.matrixWorld), color });
      });
    }
  } catch (e) {
    return toast('Gagal membaca berkas: ' + e.message);
  }
  let total = 0;
  for (const pt of parts) total += (pt.g.index ? pt.g.index.count : pt.g.attributes.position.count) / 3;
  if (!total) return toast('Berkas tidak berisi geometri');
  if (total > 150000) return toast(`Terlalu besar (${Math.round(total)} segitiga, maks 150.000)`);
  // Y-atas -> Z-atas, deteksi satuan milimeter
  const box = new THREE.Box3();
  for (const pt of parts) {
    pt.g.computeBoundingBox();
    box.union(pt.g.boundingBox);
  }
  const big = box.getSize(new THREE.Vector3()).length() > 300;
  const k = big ? 0.001 : 1;
  const conv = (P, j) => [P.getX(j) * k, -P.getZ(j) * k, P.getY(j) * k].map((x) => Math.round(x * 1e6) / 1e6);
  const before = new Set(model.faces.map((f) => f.id));
  for (const pt of parts) {
    const P = pt.g.attributes.position, idx = pt.g.index ? pt.g.index.array : null;
    const n = idx ? idx.length : P.count;
    const tris = [];
    for (let i = 0; i < n; i += 3) {
      const p = [0, 1, 2].map((q) => conv(P, idx ? idx[i + q] : i + q));
      const nn = V3(p[1]).sub(V3(p[0])).cross(V3(p[2]).sub(V3(p[0])));
      if (nn.length() < 1e-12) continue;
      nn.normalize();
      tris.push({ p, n: [nn.x, nn.y, nn.z], mat: 0 });
    }
    const faces = trianglesToFaces(model, tris, model.nextId++, editGroup, [{ color: pt.color, tex: null, texScale: 1 }]);
    model.faces.push(...faces);
  }
  const ids = new Set(model.faces.filter((f) => !before.has(f.id)).map((f) => f.id));
  G.makeGroup(model, ids, r.name.replace(/\.[^.]+$/, ''), true, editGroup);
  selection = G.expandSelection(model, ids, editGroup);
  changed();
  zoomExtents();
  toast(`Diimpor: ${ids.size} bidang${big ? ' (satuan mm dikonversi ke m)' : ''}`);
}

// ---- Ekspor Collada (.dae) untuk dibuka di SketchUp ----
// Satu node per grup teratas, satu material per warna, Z-atas dalam meter.
function exportDAE() {
  const vis = makeVisible(model);
  const topOf = (g) => {
    while (g != null && model.groups[g] && model.groups[g].parent != null) g = model.groups[g].parent;
    return g ?? null;
  };
  const nodes = new Map(), mats = new Map();
  for (const f of model.faces) {
    if (!vis(f)) continue;
    const k = topOf(f.group);
    let nd = nodes.get(k);
    if (!nd) nodes.set(k, (nd = { name: k != null ? model.groups[k]?.name || 'Grup' : 'Model', vmap: new Map(), pos: [], nor: [], tris: new Map() }));
    const col = /^#[0-9a-f]{6}$/i.test(f.color) ? f.color.toLowerCase() : '#e8e4dc';
    if (!mats.has(col)) mats.set(col, 'm' + mats.size);
    let tl = nd.tris.get(col);
    if (!tl) nd.tris.set(col, (tl = []));
    const ni = nd.nor.length / 3;
    nd.nor.push(...f.n.map((v) => +v.toFixed(5)));
    for (const p of trisOf(f)) {
      const key = p.map((v) => v.toFixed(5)).join(' ');
      let vi = nd.vmap.get(key);
      if (vi == null) {
        vi = nd.pos.length / 3;
        nd.vmap.set(key, vi);
        nd.pos.push(...p.map((v) => +v.toFixed(5)));
      }
      tl.push(vi, ni);
    }
  }
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const rgb = (h) => [1, 3, 5].map((i) => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(4)).join(' ');
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const o = [];
  o.push('<?xml version="1.0" encoding="utf-8"?>', '<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">',
    `<asset><contributor><authoring_tool>SketchClone</authoring_tool></contributor><created>${now}</created><modified>${now}</modified><unit meter="1" name="meter"/><up_axis>Z_UP</up_axis></asset>`,
    '<library_effects>');
  for (const [c, id] of mats) o.push(`<effect id="${id}-fx"><profile_COMMON><technique sid="common"><lambert><diffuse><color>${rgb(c)} 1</color></diffuse></lambert></technique><extra><technique profile="GOOGLEEARTH"><double_sided>1</double_sided></technique></extra></profile_COMMON></effect>`);
  o.push('</library_effects><library_materials>');
  for (const [c, id] of mats) o.push(`<material id="${id}" name="warna_${c.slice(1)}"><instance_effect url="#${id}-fx"/></material>`);
  o.push('</library_materials><library_geometries>');
  let gi = 0;
  const sceneNodes = [];
  for (const nd of nodes.values()) {
    const id = 'g' + gi++;
    o.push(`<geometry id="${id}" name="${esc(nd.name)}"><mesh>`,
      `<source id="${id}-p"><float_array id="${id}-pa" count="${nd.pos.length}">${nd.pos.join(' ')}</float_array><technique_common><accessor source="#${id}-pa" count="${nd.pos.length / 3}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>`,
      `<source id="${id}-n"><float_array id="${id}-na" count="${nd.nor.length}">${nd.nor.join(' ')}</float_array><technique_common><accessor source="#${id}-na" count="${nd.nor.length / 3}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>`,
      `<vertices id="${id}-v"><input semantic="POSITION" source="#${id}-p"/></vertices>`);
    const binds = [];
    for (const [c, tl] of nd.tris) {
      const m = mats.get(c);
      o.push(`<triangles material="${m}" count="${tl.length / 6}"><input semantic="VERTEX" source="#${id}-v" offset="0"/><input semantic="NORMAL" source="#${id}-n" offset="1"/><p>${tl.join(' ')}</p></triangles>`);
      binds.push(`<instance_material symbol="${m}" target="#${m}"/>`);
    }
    o.push('</mesh></geometry>');
    sceneNodes.push(`<node id="n${id}" name="${esc(nd.name)}"><instance_geometry url="#${id}"><bind_material><technique_common>${binds.join('')}</technique_common></bind_material></instance_geometry></node>`);
  }
  o.push('</library_geometries><library_visual_scenes><visual_scene id="scene" name="SketchClone">', ...sceneNodes,
    '</visual_scene></library_visual_scenes><scene><instance_visual_scene url="#scene"/></scene></COLLADA>');
  return o.join('\n');
}

// ---- Ekspor glTF (.glb) dengan warna & tekstur ----
async function exportGLB(toFile = true) {
  const root = new THREE.Group();
  root.rotation.x = -Math.PI / 2; // Z-atas -> Y-atas
  const vis = makeVisible(model);
  const batches = new Map();
  for (const f of model.faces) {
    if (!vis(f)) continue;
    const tris = trisOf(f);
    const map = f.tex ? getTexture(f.tex) : null;
    const key = map ? 't:' + f.tex : f.color;
    let b = batches.get(key);
    if (!b) batches.set(key, (b = { pos: [], nor: [], uv: map ? [] : null, map, color: map ? '#ffffff' : f.color }));
    for (const p of tris) {
      b.pos.push(...p);
      b.nor.push(...f.n);
    }
    if (map) {
      const uvf = texMapper(f);
      for (const p of tris) b.uv.push(...uvf(p));
    }
  }
  for (const b of batches.values()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    if (b.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    root.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: b.color, map: b.map, roughness: 0.9, side: THREE.DoubleSide })));
  }
  const sceneOut = new THREE.Scene();
  sceneOut.add(root);
  const data = await new GLTFExporter().parseAsync(sceneOut, { binary: true });
  if (toFile === 'raw') return data;
  if (!toFile) return data.byteLength;
  const base = filePath ? filePath.split(/[\\/]/).pop().replace(/\.skc$/, '') : 'model';
  const p = await window.api.exportBinary('glb', new Uint8Array(data), base + '.glb');
  p && toast('Ekspor glTF selesai');
}

// ======================= Dokumentasi =======================
const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const VIEWDEF = {
  depan: { label: 'TAMPAK DEPAN', dir: [0, -1, 0], up: [0, 0, 1], h: 0, v: 2 },
  belakang: { label: 'TAMPAK BELAKANG', dir: [0, 1, 0], up: [0, 0, 1], h: 0, v: 2, flipH: true },
  kanan: { label: 'TAMPAK SAMPING KANAN', dir: [1, 0, 0], up: [0, 0, 1], h: 1, v: 2 },
  kiri: { label: 'TAMPAK SAMPING KIRI', dir: [-1, 0, 0], up: [0, 0, 1], h: 1, v: 2, flipH: true },
  atas: { label: 'DENAH / TAMPAK ATAS', dir: [0, 0, 1], up: [0, 1, 0], h: 0, v: 1 },
  iso: { label: 'PERSPEKTIF ISOMETRIK', dir: [1, -1, 0.8], up: [0, 0, 1], iso: true },
};

// Render satu tampak ortografis ke gambar PNG (gaya garis), dengan skala px/m tertentu.
function renderView(kind, W, H, pxPerM, box, clip = null) {
  const def = VIEWDEF[kind];
  const c = box.getCenter(new THREE.Vector3());
  const cam = new THREE.OrthographicCamera(-W / 2 / pxPerM, W / 2 / pxPerM, H / 2 / pxPerM, -H / 2 / pxPerM, 0.01, 10000);
  cam.up.set(...def.up);
  const d = new THREE.Vector3(...def.dir).normalize();
  cam.position.copy(c).addScaledVector(d, 1000);
  cam.lookAt(c);
  cam.updateMatrixWorld();
  const savedStyle = model.style, pr = renderer.getPixelRatio();
  const vis = [grid.visible, axesGroup.visible, shadowCatcher.visible, renderer.shadowMap.enabled, sun.castShadow];
  model.style = def.iso
    ? { ...styleOf(model), face: 'shaded', edges: true, width: 2, ext: false, profiles: false, ao: false }
    : { ...styleOf(model), face: 'hidden', edges: true, width: 2, ext: false, profiles: false, ao: false };
  const sel = selection;
  selection = new Set();
  rebuild(model);
  grid.visible = axesGroup.visible = shadowCatcher.visible = false;
  renderer.shadowMap.enabled = sun.castShadow = false;
  disposeGroup(overlay.children.includes(hoverGroup) ? hoverGroup : new THREE.Group());
  guide.visible = guide2.visible = false;
  for (const mt of fatMats) mt.resolution.set(W, H);
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  scene.background = new THREE.Color(0xffffff);
  renderer.clippingPlanes = clip || [];
  renderer.render(scene, cam);
  renderer.clippingPlanes = [];
  const data = canvas.toDataURL('image/png');
  scene.background = null;
  [grid.visible, axesGroup.visible, shadowCatcher.visible, renderer.shadowMap.enabled, sun.castShadow] = vis;
  model.style = savedStyle;
  selection = sel;
  renderer.setPixelRatio(pr);
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  refresh();
  return { data, cam };
}

async function exportDrawing() {
  const vis = makeVisible(model);
  const ids = selection.size ? expand(selection) : null;
  const box = G.bboxOf(model, ids, vis);
  if (box.isEmpty()) return toast('Model kosong');
  const size = box.getSize(new THREE.Vector3());
  const W = 1400, H = 860; // piksel per sel tampak
  const views = ['depan', 'kanan', 'atas', 'iso'];
  // skala bersama untuk tampak ortografis
  const ext = (k) => {
    const d = VIEWDEF[k];
    return [size.getComponent(d.h), size.getComponent(d.v)];
  };
  let px = Infinity;
  for (const k of ['depan', 'kanan', 'atas']) {
    const [hs, vs] = ext(k);
    px = Math.min(px, (W * 0.7) / Math.max(hs, 1e-3), (H * 0.66) / Math.max(vs, 1e-3));
  }
  // skala "rapi" untuk A3 (sel ± 200 mm x 123 mm)
  const mmPerPx = 200 / W;
  const nice = [10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000, 2000, 5000];
  let N = 1000 / (px * mmPerPx);
  N = nice.find((n) => n >= N) || Math.ceil(N);
  px = 1000 / (N * mmPerPx);
  const cells = [];
  for (const k of views) {
    let p2 = px;
    if (VIEWDEF[k].iso) {
      const r = size.length() / 2;
      p2 = Math.min(W, H) * 0.42 / Math.max(r, 1e-3);
    }
    const { data } = renderView(k, W, H, p2, box);
    let dims = '';
    if (!VIEWDEF[k].iso) {
      const [hs, vs] = ext(k);
      const l = W / 2 - (hs * p2) / 2, r = W / 2 + (hs * p2) / 2, t = H / 2 - (vs * p2) / 2, b = H / 2 + (vs * p2) / 2;
      const y = b + 40, x = l - 40;
      dims = `<svg viewBox="0 0 ${W} ${H}" class="dim">
        <line x1="${l}" y1="${b + 8}" x2="${l}" y2="${y + 10}"/><line x1="${r}" y1="${b + 8}" x2="${r}" y2="${y + 10}"/>
        <line x1="${l}" y1="${y}" x2="${r}" y2="${y}"/>
        <line x1="${l - 7}" y1="${y + 7}" x2="${l + 7}" y2="${y - 7}"/><line x1="${r - 7}" y1="${y + 7}" x2="${r + 7}" y2="${y - 7}"/>
        <text x="${(l + r) / 2}" y="${y - 10}" text-anchor="middle">${escHtml(fmt(hs))}</text>
        <line x1="${l - 8}" y1="${t}" x2="${x - 10}" y2="${t}"/><line x1="${l - 8}" y1="${b}" x2="${x - 10}" y2="${b}"/>
        <line x1="${x}" y1="${t}" x2="${x}" y2="${b}"/>
        <line x1="${x - 7}" y1="${t + 7}" x2="${x + 7}" y2="${t - 7}"/><line x1="${x - 7}" y1="${b + 7}" x2="${x + 7}" y2="${b - 7}"/>
        <text x="${x - 12}" y="${(t + b) / 2}" text-anchor="middle" transform="rotate(-90 ${x - 12} ${(t + b) / 2})">${escHtml(fmt(vs))}</text>
      </svg>`;
    }
    cells.push(`<div class="cell"><img src="${data}">${dims}<div class="cap">${VIEWDEF[k].label}${VIEWDEF[k].iso ? '' : ` &nbsp;·&nbsp; SKALA 1:${N}`}</div></div>`);
  }
  const name = filePath ? filePath.split(/[\\/]/).pop().replace(/\.skc$/, '') : model.rab?.project?.name || 'Tanpa Judul';
  const date = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const plans = planSheets(vis);
  const more = model.groups && Object.values(model.groups).some((g) => g.wall) ? [...elevSheets(vis, G.bboxOf(model, null, vis)), ...sectionSheets(vis, G.bboxOf(model, null, vis))] : [];
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A3 landscape; margin: 0; }
    html, body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #111; }
    .sheet { width: 420mm; height: 297mm; box-sizing: border-box; padding: 10mm; position: relative; }
    .frame { position: absolute; inset: 10mm; border: 0.7mm solid #111; }
    .grid { position: absolute; left: 12mm; top: 12mm; width: 396mm; height: 250mm; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 3mm; }
    .cell { position: relative; border: 0.25mm solid #999; overflow: hidden; }
    .cell img, .cell svg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
    .dim line { stroke: #c0392b; stroke-width: 2; } .dim text { fill: #c0392b; font-size: 26px; font-weight: 600; }
    .cap { position: absolute; left: 3mm; bottom: 2mm; font-size: 3.4mm; font-weight: 700; letter-spacing: .3mm; }
    .title { position: absolute; right: 12mm; bottom: 12mm; width: 160mm; height: 21mm; display: grid; grid-template-columns: 1.6fr 1fr 1fr; border: 0.5mm solid #111; font-size: 3mm; }
    .title div { border-left: 0.25mm solid #111; padding: 1.5mm 2mm; } .title div:first-child { border-left: none; }
    .title b { display: block; font-size: 4.2mm; margin-top: 1mm; }
    .brand { position: absolute; left: 12mm; bottom: 13mm; font-size: 3mm; color: #555; }
    .plan { position: absolute; left: 12mm; top: 12mm; width: 396mm; height: 250mm; }
    .plan img, .plan svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    .plan .cut, .cell .cut { stroke: #111; stroke-width: 5; stroke-linecap: square; }
    .grid.g2 { grid-template-columns: 1fr; grid-template-rows: 1fr; } .cell2 { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; height: 100%; } .cell2 .cell { height: 100%; }
    .lvl line { stroke: #2b6cb0; stroke-width: 1.5; stroke-dasharray: 10 6; } .lvl path { fill: #2b6cb0; } .lvl text { fill: #2b6cb0; font-size: 20px; font-weight: 700; } .lvl text.nm { font-size: 15px; font-weight: 400; }
    .gnd { stroke: #6b4f2a; stroke-width: 4; }
    .plan .col { fill: #111; } .plan .otag rect { fill: #fff; stroke: #7a3e9d; stroke-width: 2; } .plan .otag text { fill: #7a3e9d; font-size: 15px; font-weight: 700; }
    .plan .secl line { stroke: #2b6cb0; stroke-width: 2; stroke-dasharray: 22 6 4 6; } .plan .secl circle { fill: #fff; stroke: #2b6cb0; stroke-width: 2.5; } .plan .secl text { fill: #2b6cb0; font-size: 18px; font-weight: 700; }
    .ktab { position: absolute; right: 2mm; top: 2mm; background: #fff; font-size: 2.8mm; border: 0.3mm solid #555; padding: 1.5mm 2mm; }
    .ktab table { border-collapse: collapse; margin-top: 1mm; } .ktab td, .ktab th { border: 0.2mm solid #999; padding: 0.6mm 1.6mm; text-align: center; }
    .plan .mep circle { fill: #fff; stroke: #1f5fa8; stroke-width: 2; } .plan .mep path { stroke: #1f5fa8; stroke-width: 2; } .plan .mep text { fill: #1f5fa8; font-size: 12px; font-weight: 700; }
    .plan .leaf { stroke: #111; stroke-width: 3; } .plan .swing { stroke: #555; stroke-width: 1.5; fill: none; stroke-dasharray: 8 5; }
    .plan .rn { font-size: 22px; font-weight: 700; fill: #1d2b3a; } .plan .ra { font-size: 19px; fill: #44515f; }
    ${PLAN_EXTRA_CSS}
    .plan .dim line { stroke: #c0392b; stroke-width: 2; } .plan .dim text { fill: #c0392b; font-size: 22px; font-weight: 600; }
  </style></head><body><div class="sheet"><div class="frame"></div><div class="grid">${cells.join('')}</div>
    <div class="title"><div>PROYEK<b>${escHtml(name)}</b></div><div>TANGGAL<b>${escHtml(date)}</b></div><div>SATUAN / SKALA<b>${escHtml(unitOf().u)} · 1:${N}</b></div></div>
    <div class="brand">Dibuat dengan SketchClone · ukuran keseluruhan ${escHtml(fmt(size.x))} × ${escHtml(fmt(size.y))} × ${escHtml(fmt(size.z))}</div>
  </div>${more.map((pl) => `<div class="sheet" style="page-break-before:always"><div class="frame"></div>
    <div class="grid${pl.title === 'POTONGAN' ? ' g2' : ''}">${pl.grid}</div>
    <div class="title"><div>${escHtml(pl.title)}<b>${escHtml(name)}</b></div><div>TANGGAL<b>${escHtml(date)}</b></div><div>${pl.k3}<b>${escHtml(pl.area)}</b></div></div>
    <div class="brand">Dibuat dengan SketchClone · SKALA 1:${pl.N}</div></div>`).join('')}${plans.map((pl) => `<div class="sheet" style="page-break-before:always"><div class="frame"></div>
    <div class="plan">${pl.body}</div>
    <div class="title"><div>${escHtml(pl.title)}<b>${escHtml(name)}</b></div><div>TANGGAL<b>${escHtml(date)}</b></div><div>LUAS LANTAI<b>${escHtml(pl.area)}</b></div></div>
    <div class="brand">Dibuat dengan SketchClone · SKALA 1:${pl.N}</div></div>`).join('')}</body></html>`;
  const out = await window.api.savePdf(html, name + ' - gambar kerja.pdf');
  out && toast('Gambar kerja PDF disimpan');
  return html.length;
}

const PLAN_EXTRA_CSS = `.plan .cut-ex { stroke: #8f979f; } .plan .cut-dm { stroke: #d63c2a; stroke-dasharray: 10 7; stroke-width: 4; }
    .plan .beam { stroke: #5b6470; stroke-width: 2.5; stroke-dasharray: 16 8; } .plan .btag { fill: #5b6470; font-size: 14px; font-weight: 700; }
    .rleg { position: absolute; left: 2mm; top: 2mm; background: #fff; border: 0.3mm solid #555; padding: 1.5mm 2.5mm; font-size: 2.8mm; display: flex; gap: 3mm; align-items: center; }
    .rleg i { display: inline-block; width: 7mm; height: 1.4mm; margin-right: 1.2mm; vertical-align: middle; } .rleg .ex { background: #8f979f; } .rleg .nw { background: #111; } .rleg .dm { background: repeating-linear-gradient(90deg, #d63c2a 0 2mm, transparent 2mm 3.2mm); }`;
// Lembar denah per lantai: irisan dinding tebal + nama & luas ruang + dimensi luar.
function planSheets(vis) {
  const L = C.levelsOf(model);
  const out = [];
  L.forEach((lv, li) => {
    const walls = Object.entries(model.groups).filter(([gid, g]) => g.wall && Math.abs((g.wall.pts[0]?.[2] ?? 0) - lv.z) < 0.1 && vis({ group: +gid }));
    if (!walls.length) return;
    const ids = new Set();
    for (const [gid] of walls) for (const id of G.entitiesInTree(model, +gid)) ids.add(id);
    // kolom struktur lantai ini & balok di atasnya ikut masuk bingkai denah
    for (const [gid, g] of Object.entries(model.groups)) if ((g.column && Math.abs(g.column.z - lv.z) < 0.1) || (g.beam && g.beam.z > lv.z + 0.5 && g.beam.z <= lv.z + lv.h + 0.06)) for (const id of G.entitiesInTree(model, +gid)) if (vis(model.faces.find((f) => f.id === id) || {})) ids.add(id);
    const box = G.bboxOf(model, ids, vis);
    const size = box.getSize(new THREE.Vector3());
    const W = 1600, H = 1010;
    const mmPerPx = 396 / W;
    let px = Math.min((W * 0.78) / Math.max(size.x, 1e-3), (H * 0.74) / Math.max(size.y, 1e-3));
    const nice = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000];
    const N = nice.find((n) => n >= 1000 / (px * mmPerPx)) || 1000;
    px = 1000 / (N * mmPerPx);
    const cutZ = lv.z + 1.2;
    const clip = [new THREE.Plane(new THREE.Vector3(0, 0, -1), cutZ), new THREE.Plane(new THREE.Vector3(0, 0, 1), -(lv.z + 0.001))];
    const { data, cam } = renderView('atas', W, H, px, box, clip);
    const sp = (x, y, z) => {
      const v = new THREE.Vector3(x, y, z).project(cam);
      return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H];
    };
    const renoOn = C.renoActive(model) && !(model.reno && (model.reno.view === 'sebelum' || model.reno.view === 'sesudah'));
    const phc = new Map();
    const fph = (f) => { const g = f.group ?? null; if (!phc.has(g)) phc.set(g, C.phaseOf(model, g)); return phc.get(g); };
    const segs = C.sliceSegments(model, cutZ, (f) => vis(f) && ids.has(f.id) && f.part !== 'leaf' && (!renoOn || fph(f) === 'new'));
    const segsEx = renoOn ? C.sliceSegments(model, cutZ, (f) => vis(f) && ids.has(f.id) && f.part !== 'leaf' && fph(f) === 'exist') : [];
    const segsDm = renoOn ? C.sliceSegments(model, cutZ, (f) => vis(f) && ids.has(f.id) && f.part !== 'leaf' && fph(f) === 'demo') : [];
    let swings = '';
    for (const [gid, g] of Object.entries(model.groups)) {
      const op = g.opening;
      if (!op || op.type !== 'pintu' || !op.frame || !ids.has([...G.entitiesInTree(model, +gid)][0])) continue;
      const Mg = new THREE.Matrix4().fromArray(g.m);
      const o = V3(op.frame.o).applyMatrix4(Mg), u = V3(op.frame.u).transformDirection(Mg), d = V3(op.frame.d).transformDirection(Mg);
      const lw = op.w - 0.12;
      const hinge = o.clone().addScaledVector(u, 0.06).addScaledVector(d, op.t);
      const shut = hinge.clone().addScaledVector(u, lw), open = hinge.clone().addScaledVector(d, lw);
      const [hx, hy] = sp(hinge.x, hinge.y, cutZ), [sx, sy] = sp(shut.x, shut.y, cutZ), [ox, oy] = sp(open.x, open.y, cutZ);
      const rr = Math.hypot(sx - hx, sy - hy);
      const sweep = (sx - hx) * (oy - hy) - (sy - hy) * (ox - hx) > 0 ? 1 : 0;
      swings += `<line class="leaf" x1="${hx.toFixed(1)}" y1="${hy.toFixed(1)}" x2="${ox.toFixed(1)}" y2="${oy.toFixed(1)}"/><path class="swing" d="M${sx.toFixed(1)} ${sy.toFixed(1)} A${rr.toFixed(1)} ${rr.toFixed(1)} 0 0 ${sweep} ${ox.toFixed(1)} ${oy.toFixed(1)}"/>`;
    }
    const segLines = (arr, cls) => arr.map(([a, b]) => { const p = sp(a[0], a[1], cutZ), q = sp(b[0], b[1], cutZ); return `<line class="${cls}" x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}"/>`; }).join('');
    const lines = segLines(segsEx, 'cut cut-ex') + segLines(segsDm, 'cut cut-dm') + segLines(segs, 'cut');
    const renoLegend = renoOn ? `<div class="rleg"><b>RENOVASI</b><span><i class="ex"></i>Eksisting</span><span><i class="dm"></i>Dibongkar</span><span><i class="nw"></i>Baru</span></div>` : '';
    const ABBR = { lampu: 'L', saklar: 'S', stopkontak: 'SK', ac: 'AC', exhaust: 'EF', panel: 'P', kloset: 'WC', wastafel: 'WT', bakmandi: 'BM', kran: 'K', floordrain: 'FD', septictank: 'ST', tandon: 'TA', pompa: 'PA' };
    let mepSyms = '';
    for (const g of Object.values(model.groups)) {
      if (!g.mep || !ABBR[g.mep.kind]) continue;
      const pw = V3(g.mep.p).applyMatrix4(new THREE.Matrix4().fromArray(g.m));
      const zz = C.MEP[g.mep.kind]?.mount === 'ceiling' ? pw.z - 0.01 : pw.z; // lampu plafon milik lantai di bawahnya
      if (zz < (li === 0 ? lv.z - 1.6 : lv.z - 0.005) || zz >= lv.z + lv.h - 0.005) continue;
      const [x, y] = sp(pw.x, pw.y, lv.z);
      const lamp = g.mep.kind === 'lampu';
      mepSyms += `<g class="mep"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13"/>${lamp ? `<path d="M${x - 9} ${y - 9}L${x + 9} ${y + 9}M${x + 9} ${y - 9}L${x - 9} ${y + 9}"/>` : `<text x="${x.toFixed(1)}" y="${(y + 5).toFixed(1)}" text-anchor="middle">${ABBR[g.mep.kind]}</text>`}</g>`;
    }
    let area = 0;
    const rooms = Object.entries(model.groups).filter(([gid, g]) => g.room && Math.abs(g.room.z - lv.z) < 0.1 && vis({ group: +gid })).map(([gid, g]) => {
      area += g.room.area;
      const lab = model.labels.find((l) => l.id === g.room.label);
      const rf = !lab && model.faces.find((f) => (f.group ?? null) === +gid);
      const c = lab ? lab.p : rf ? rf.pts.reduce((a, p) => [a[0] + p[0] / rf.pts.length, a[1] + p[1] / rf.pts.length], [0, 0]) : [box.min.x, box.min.y, lv.z];
      const [x, y] = sp(c[0], c[1], lv.z);
      return `<text class="rn" x="${x}" y="${y - 30}" text-anchor="middle">${escHtml(g.room.name)}</text><text class="ra" x="${x}" y="${y - 8}" text-anchor="middle">${g.room.area.toFixed(2)} m²</text>`;
    }).join('');
    const [l, b] = sp(box.min.x, box.min.y, lv.z), [r, t] = sp(box.max.x, box.max.y, lv.z);
    const y = b + 96, x = l - 96;
    // kolom praktis (kotak hitam)
    let extra = '';
    for (const g of Object.values(model.groups)) {
      if (!g.struct?.colPts || Math.abs(g.struct.z - lv.z) > 0.1) continue;
      const hb = (g.struct.colB || 0.15) / 2;
      for (const [cx, cy, ang] of g.struct.colPts) {
        const pts4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => {
          const lx = (a * hb), ly = (c * hb);
          return sp(cx + lx * Math.cos(ang) - ly * Math.sin(ang), cy + lx * Math.sin(ang) + ly * Math.cos(ang), cutZ);
        });
        extra += `<polygon class="col" points="${pts4.map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' ')}"/>`;
      }
    }
    // kolom struktur & balok di atas lantai ini (garis putus-putus)
    for (const g of Object.values(model.groups)) {
      if (g.column && Math.abs(g.column.z - lv.z) < 0.1) {
        const c = g.column, [x1, y1] = sp(c.x - c.b / 2, c.y + c.b / 2, cutZ), [x2, y2] = sp(c.x + c.b / 2, c.y - c.b / 2, cutZ);
        extra += `<rect class="col" x="${Math.min(x1, x2).toFixed(1)}" y="${Math.min(y1, y2).toFixed(1)}" width="${Math.abs(x2 - x1).toFixed(1)}" height="${Math.abs(y2 - y1).toFixed(1)}"/>`;
      }
      if (g.beam && g.beam.z > lv.z + 0.5 && g.beam.z <= lv.z + lv.h + 0.06) {
        const bm = g.beam, [x1, y1] = sp(bm.p1[0], bm.p1[1], cutZ), [x2, y2] = sp(bm.p2[0], bm.p2[1], cutZ);
        extra += `<line class="beam" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/><text class="btag" x="${((x1 + x2) / 2).toFixed(1)}" y="${((y1 + y2) / 2 - 8).toFixed(1)}" text-anchor="middle">B ${Math.round(bm.b * 100)}/${Math.round(bm.h * 100)}</text>`;
      }
    }
    // kode kusen di dekat bukaan
    const sch = C.openingSchedule(model);
    for (const tp of sch) for (const gid of tp.gids) {
      const g = model.groups[gid];
      if (!g?.opening?.frame || !ids.has([...G.entitiesInTree(model, gid)][0])) continue;
      const Mg = new THREE.Matrix4().fromArray(g.m);
      const o = V3(g.opening.frame.o).applyMatrix4(Mg), u = V3(g.opening.frame.u).transformDirection(Mg), d = V3(g.opening.frame.d).transformDirection(Mg);
      const c = o.clone().addScaledVector(u, g.opening.w / 2).addScaledVector(d, g.opening.t + 0.4);
      const [tx, ty] = sp(c.x, c.y, cutZ);
      extra += `<g class="otag"><rect x="${(tx - 17).toFixed(1)}" y="${(ty - 11).toFixed(1)}" width="34" height="22" rx="4"/><text x="${tx.toFixed(1)}" y="${(ty + 6).toFixed(1)}" text-anchor="middle">${tp.code}</text></g>`;
    }
    // dimensi tiap segmen dinding keliling (di luar dinding)
    for (const [, g] of walls) {
      if (!g.wall.closed) continue;
      const P = g.wall.pts;
      const area2 = P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
      const sgn = area2 > 0 ? 1 : -1;
      P.forEach((a, i) => {
        const q = P[(i + 1) % P.length];
        const dx = q[0] - a[0], dy = q[1] - a[1], L = Math.hypot(dx, dy);
        if (L < 0.3) return;
        const nx = (sgn * dy) / L, ny = (-sgn * dx) / L, off = g.wall.t / 2 + 0.45;
        const A1 = sp(a[0] + nx * off, a[1] + ny * off, lv.z), B1 = sp(q[0] + nx * off, q[1] + ny * off, lv.z);
        const mx = (A1[0] + B1[0]) / 2, my = (A1[1] + B1[1]) / 2, ang = (Math.atan2(B1[1] - A1[1], B1[0] - A1[0]) * 180) / Math.PI;
        const ang2 = ang > 90 || ang < -90 ? ang + 180 : ang;
        extra += `<g class="dim"><line x1="${A1[0].toFixed(1)}" y1="${A1[1].toFixed(1)}" x2="${B1[0].toFixed(1)}" y2="${B1[1].toFixed(1)}"/>${[A1, B1].map((E) => `<line x1="${(E[0] - 6).toFixed(1)}" y1="${(E[1] + 6).toFixed(1)}" x2="${(E[0] + 6).toFixed(1)}" y2="${(E[1] - 6).toFixed(1)}"/>`).join('')}<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" dy="-7" text-anchor="middle" font-size="18" transform="rotate(${ang2.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)})">${escHtml(fmt(L))}</text></g>`;
      });
    }
    // garis potongan A-A & B-B (lantai dasar)
    if (li === 0) {
      const sec = sectionLines(box);
      const mark = (P1, P2, lab) => `<g class="secl"><line x1="${P1[0]}" y1="${P1[1]}" x2="${P2[0]}" y2="${P2[1]}"/>${[P1, P2].map((E) => `<circle cx="${E[0]}" cy="${E[1]}" r="15"/><text x="${E[0]}" y="${E[1] + 6}" text-anchor="middle">${lab}</text>`).join('')}</g>`;
      const yA = sp(box.min.x, sec.y, lv.z)[1], xB = sp(sec.x, box.min.y, lv.z)[0];
      extra += mark([l - 150, yA], [r + 110, yA], 'A');
      extra += mark([xB, t - 120], [xB, b + 150], 'B');
    }
    const kt = sch.length ? `<div class="ktab"><b>TABEL KUSEN</b><table><tr><th>Kode</th><th>Jenis</th><th>L × T</th><th>Ambang</th><th>Jml</th></tr>${sch.map((t) => `<tr><td>${t.code}</td><td>${t.type === 'pintu' ? 'Pintu' : 'Jendela'}</td><td>${fmt(t.w)} × ${fmt(t.h)}</td><td>${fmt(t.sill)}</td><td>${t.n}</td></tr>`).join('')}</table></div>` : '';
    const dims = `<g class="dim"><line x1="${l}" y1="${b + 8}" x2="${l}" y2="${y + 10}"/><line x1="${r}" y1="${b + 8}" x2="${r}" y2="${y + 10}"/><line x1="${l}" y1="${y}" x2="${r}" y2="${y}"/>
      <line x1="${l - 7}" y1="${y + 7}" x2="${l + 7}" y2="${y - 7}"/><line x1="${r - 7}" y1="${y + 7}" x2="${r + 7}" y2="${y - 7}"/>
      <text x="${(l + r) / 2}" y="${y - 10}" text-anchor="middle">${escHtml(fmt(size.x))}</text>
      <line x1="${l - 8}" y1="${t}" x2="${x - 10}" y2="${t}"/><line x1="${l - 8}" y1="${b}" x2="${x - 10}" y2="${b}"/><line x1="${x}" y1="${t}" x2="${x}" y2="${b}"/>
      <line x1="${x - 7}" y1="${t + 7}" x2="${x + 7}" y2="${t - 7}"/><line x1="${x - 7}" y1="${b + 7}" x2="${x + 7}" y2="${b - 7}"/>
      <text x="${x - 12}" y="${(t + b) / 2}" text-anchor="middle" transform="rotate(-90 ${x - 12} ${(t + b) / 2})">${escHtml(fmt(size.y))}</text></g>`;
    out.push({
      title: 'DENAH ' + lv.name.toUpperCase(), N, area: area ? area.toFixed(2) + ' m²' : '-',
      body: `<img src="${data}"><svg viewBox="0 0 ${W} ${H}">${lines}${extra}${swings}${mepSyms}${rooms}${dims}</svg>${kt}${renoLegend}`,
    });
  });
  return out;
}

// Garis potongan melewati tengah bangunan, digeser bila jatuh tepat di dinding sekat.
function sectionLines(box) {
  const c = box.getCenter(new THREE.Vector3());
  return { y: +(c.y + 0.37).toFixed(3), x: +(c.x - 0.43).toFixed(3) };
}
function levelMarks(cam, W, H, box, side = 'right') {
  const sp = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(cam); return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H]; };
  const zs = [...C.levelsOf(model).map((l) => [l.z, l.name]), [box.max.z, 'Puncak atap']];
  const seen = new Set();
  let g = '';
  const c = box.getCenter(new THREE.Vector3());
  for (const [z, nm] of zs) {
    const key = z.toFixed(2);
    if (seen.has(key)) continue;
    seen.add(key);
    const [, yy] = sp(c.x, c.y, z);
    const xs = [sp(box.min.x, box.min.y, z)[0], sp(box.max.x, box.max.y, z)[0], sp(box.min.x, box.max.y, z)[0], sp(box.max.x, box.min.y, z)[0]];
    const x1 = Math.max(...xs) + 30;
    g += `<g class="lvl"><line x1="${Math.min(...xs) - 20}" y1="${yy}" x2="${x1 + 70}" y2="${yy}"/><path d="M${x1} ${yy}l-9 -14h18z"/><text x="${x1 + 14}" y="${yy - 6}">${z >= 0 ? (z === 0 ? '±' : '+') : ''}${z.toFixed(2)}</text><text x="${x1 + 14}" y="${yy + 18}" class="nm">${escHtml(nm)}</text></g>`;
  }
  return g;
}
function elevSheets(vis, box) {
  const views = ['depan', 'belakang', 'kanan', 'kiri'];
  const W = 1400, H = 860, size = box.getSize(new THREE.Vector3());
  let px = Infinity;
  for (const k of views) { const d = VIEWDEF[k]; px = Math.min(px, (W * 0.62) / Math.max(size.getComponent(d.h), 1e-3), (H * 0.66) / Math.max(size.z, 1e-3)); }
  const nice = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000];
  const N = nice.find((n) => n >= 1000 / (px * (200 / W))) || 1000;
  px = 1000 / (N * (200 / W));
  const cells = views.map((k) => {
    const { data, cam } = renderView(k, W, H, px, box);
    return `<div class="cell"><img src="${data}"><svg viewBox="0 0 ${W} ${H}">${levelMarks(cam, W, H, box)}</svg><div class="cap">${VIEWDEF[k].label} · SKALA 1:${N}</div></div>`;
  });
  return [{ title: 'TAMPAK', N, k3: 'TINGGI BANGUNAN', area: fmt(size.z), grid: cells.join('') }];
}
function sectionSheets(vis, box) {
  if (!Object.values(model.groups).some((g) => g.wall)) return [];
  const sec = sectionLines(box);
  const W = 1400, H = 860, size = box.getSize(new THREE.Vector3());
  let px = Math.min((W * 0.62) / Math.max(size.x, size.y, 1e-3), (H * 0.66) / Math.max(size.z, 1e-3));
  const nice = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000];
  const N = nice.find((n) => n >= 1000 / (px * (200 / W))) || 1000;
  px = 1000 / (N * (200 / W));
  const defs = [
    { label: 'POTONGAN A-A', view: 'depan', n: [0, 1, 0], c: sec.y, clip: new THREE.Plane(new THREE.Vector3(0, 1, 0), -sec.y) },
    { label: 'POTONGAN B-B', view: 'kanan', n: [1, 0, 0], c: sec.x, clip: new THREE.Plane(new THREE.Vector3(-1, 0, 0), sec.x) },
  ];
  const cells = defs.map((d) => {
    const { data, cam } = renderView(d.view, W, H, px, box, [d.clip]);
    const sp = (v) => { const q = v.clone().project(cam); return [((q.x + 1) / 2) * W, ((1 - q.y) / 2) * H]; };
    const segs = C.slicePlane(model, d.n, d.c, vis);
    const cut = segs.map(([a, b]) => { const p = sp(a), q = sp(b); return `<line class="cut" x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}"/>`; }).join('');
    // tanah asli
    const [gx0, gy] = sp(new THREE.Vector3(box.min.x - 1, box.min.y - 1, 0)), [gx1] = sp(new THREE.Vector3(box.max.x + 1, box.max.y + 1, 0));
    const ground = `<line class="gnd" x1="${Math.min(gx0, gx1) - 40}" y1="${gy}" x2="${Math.max(gx0, gx1) + 40}" y2="${gy}"/>`;
    return `<div class="cell"><img src="${data}"><svg viewBox="0 0 ${W} ${H}">${ground}${cut}${levelMarks(cam, W, H, box)}</svg><div class="cap">${d.label} · SKALA 1:${N}</div></div>`;
  });
  return [{ title: 'POTONGAN', N, k3: 'GARIS POTONG', area: 'lihat denah', grid: `<div class="cell2">${cells.join('')}</div>` }];
}

// ======================= Produksi: mebel, cetak 3D, pola datar =======================
const prodOpt = () => {
  model.prod ||= {};
  const o = model.prod;
  o.sheet ||= { w: 2440, h: 1220, kerf: 3, rotate: true };
  o.prices ||= {}; // harga per lembar menurut tebal (mm)
  o.cab ||= { w: 80, h: 180, d: 40, shelves: 3, doors: 2, t: 18 };
  o.print ||= { scale: 1, material: 'PLA', infill: 20, pricePerKg: 200000, bed: [220, 220, 250] };
  o.net ||= { tab: 8 };
  return o;
};
// lingkup: benda terpilih, atau semua yang tampak
function prodSids() {
  const vis = makeVisible(model);
  const ids = selection.size ? expand(selection) : null;
  return [...new Set(model.faces.filter((f) => f.solid != null && vis(f) && (!ids || ids.has(f.id))).map((f) => f.solid))];
}
function prodCutList() {
  const sids = new Set(prodSids());
  const nameOf = (f) => f.pname || (f.group != null ? model.groups[f.group]?.name : null);
  return PR.cutList(model, (f) => sids.has(f.solid), nameOf);
}
function prodNesting(cl) {
  const o = prodOpt();
  const byT = {};
  for (const r of cl.rows) (byT[r.T] ||= []).push(r);
  return Object.entries(byT).sort((a, b) => b[0] - a[0]).map(([T, rows]) => {
    const nr = PR.nest(rows, o.sheet.w, o.sheet.h, o.sheet.kerf, o.sheet.rotate);
    const price = o.prices[T] || 0;
    return { T: +T, rows, nr, price, cost: price * nr.sheets.length };
  });
}
function hardwareSum() {
  const hw = { engsel: 0, handle: 0, sekrup: 0, dowel: 0 };
  for (const g of Object.values(model.groups)) if (g.furniture?.hardware) for (const k in hw) hw[k] += g.furniture.hardware[k] || 0;
  return hw;
}
function sheetSvg(nr, s, Wpx) {
  const sc = Wpx / nr.sheetW, H = nr.sheetH * sc;
  const cols = ['#f6d7a7', '#cfe3c8', '#c9dcf0', '#f3c9c9', '#e1d3f0', '#f0e6b8'];
  const parts = s.parts.map((p, i) => {
    const fs = Math.max(7, Math.min(13, Math.min(p.w, p.h) * sc * 0.35));
    return `<rect x="${(p.x * sc).toFixed(1)}" y="${(p.y * sc).toFixed(1)}" width="${(p.w * sc).toFixed(1)}" height="${(p.h * sc).toFixed(1)}" fill="${cols[i % cols.length]}" stroke="#555" stroke-width="0.8"/>` +
      `<text x="${((p.x + p.w / 2) * sc).toFixed(1)}" y="${((p.y + p.h / 2) * sc + fs / 3).toFixed(1)}" font-size="${fs.toFixed(1)}" text-anchor="middle" fill="#333">${p.label} ${Math.round(p.rot ? p.h : p.w)}×${Math.round(p.rot ? p.w : p.h)}</text>`;
  }).join('');
  return `<svg viewBox="-1 -1 ${Wpx + 2} ${H + 2}" width="100%" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${Wpx}" height="${H}" fill="#fff" stroke="#222" stroke-width="1.2"/>${parts}</svg>`;
}
function placeCabinet() {
  const c = prodOpt().cab;
  const o = { w: c.w / 100, h: c.h / 100, d: c.d / 100, shelves: c.shelves, doors: c.doors, t: c.t / 1000 };
  const label = `Kabinet ${c.w}×${c.h}×${c.d} cm`;
  toast(`${label}: klik lantai untuk menaruh (panah kiri/kanan memutar)`);
  startPlace({
    label,
    gen: (m, at, n, angle) => {
      const r = PR.buildCabinet(m, o);
      G.applyMatrix(m, r.ids, new THREE.Matrix4().makeRotationZ(angle).setPosition(at));
      if (m !== model) return r;
      for (const f of m.faces) if (r.ids.has(f.id)) f.group = editGroup;
      const gid = G.makeGroup(m, r.ids, label, false, editGroup);
      m.groups[gid].furniture = { kind: 'kabinet', ...c, hardware: r.hardware };
      return { ids: r.ids, gid };
    },
  });
}
function selectedSolid() {
  const s = prodSids();
  return s.length === 1 ? s[0] : null;
}
let lastNet = null;
function buildNet() {
  const sid = selectedSolid();
  if (sid == null) return toast('Pilih satu benda (mis. kotak kemasan) dulu');
  const u = PR.unfold(model, sid, { tab: prodOpt().net.tab / 1000 });
  if (!u) return toast('Benda ini tidak bisa dibuka (bidangnya berlubang)');
  lastNet = { ...PR.netLayout(u.pieces), placed: u.placed, faces: u.faces, pieces: u.pieces.length };
  renderTray();
  toast(`Pola datar: ${u.pieces.length} potongan, ${(lastNet.W * 1000).toFixed(0)} × ${(lastNet.H * 1000).toFixed(0)} mm`);
}
async function exportNet(kind) {
  if (!lastNet) buildNet();
  if (!lastNet) return;
  const name = (filePath ? filePath.split(/[\\/]/).pop().replace(/\.skc$/, '') : 'pola') + ' - pola datar';
  if (kind === 'svg') return (await window.api.exportFile('svg', PR.netSvg(lastNet, 1, { hair: true }), name + '.svg')) && toast('Pola SVG (ukuran asli, garis tipis untuk laser) disimpan');
  if (kind === 'dxf') return (await window.api.exportFile('dxf', PR.netDxf(lastNet), name + '.dxf')) && toast('Pola DXF disimpan (layer POTONG & LIPAT)');
  // PDF ukuran asli 1:1
  const wmm = lastNet.W * 1000 + 10, hmm = lastNet.H * 1000 + 10;
  const fits = (a, b) => (wmm <= a && hmm <= b) || (wmm <= b && hmm <= a);
  const page = fits(200, 287) ? 'A4' : fits(287, 410) ? 'A3' : null;
  if (!page) return toast(`Pola ${wmm.toFixed(0)}×${hmm.toFixed(0)} mm lebih besar dari A3 — pakai SVG/DXF untuk mesin`);
  const land = page === 'A4' ? wmm > 200 : wmm > 287;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${page} ${land ? 'landscape' : 'portrait'};margin:8mm}body{margin:0;font-family:Segoe UI,Arial,sans-serif;font-size:9pt}</style></head><body>${PR.netSvg(lastNet, 1)}<div>Cetak skala 100% (tanpa "fit to page"). Garis merah = potong, biru putus-putus = lipat. ${escHtml(name)}</div></body></html>`;
  const out = await window.api.savePdf(html, name + '.pdf', { pageSize: page, landscape: land, margins: true });
  out && toast('Pola PDF ukuran asli disimpan — cetak dengan skala 100%');
}
async function exportCutPdf(toFile = true) {
  const cl = prodCutList();
  if (!cl.rows.length) return toast('Tidak ada panel/papan di pilihan ini');
  const groups = prodNesting(cl), hw = hardwareSum(), o = prodOpt();
  const rp = (v) => v.toLocaleString('id-ID');
  const date = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const name = filePath ? filePath.split(/[\\/]/).pop().replace(/\.skc$/, '') : 'Proyek mebel';
  const rows = cl.rows.map((r) => `<tr><td>${r.code}</td><td>${escHtml(r.name)}</td><td class="n">${r.L}</td><td class="n">${r.W}</td><td class="n">${r.T}</td><td class="n">${r.qty}</td></tr>`).join('');
  const sheets = groups.map((g) => `<h3>Papan ${g.T} mm — ${g.nr.sheets.length} lembar ${o.sheet.w}×${o.sheet.h} mm${g.price ? ` · Rp ${rp(g.cost)}` : ''}</h3>` + g.nr.sheets.map((s2, i) => `<div class="sh"><div>Lembar ${i + 1} · terpakai ${(s2.used * 100).toFixed(0)}%</div>${sheetSvg(g.nr, s2, 640)}</div>`).join('')).join('');
  const hwRows = Object.entries({ 'Engsel sendok': hw.engsel, 'Handle / tarikan': hw.handle, 'Sekrup': hw.sekrup, 'Dowel / pin rak': hw.dowel }).filter(([, v]) => v).map(([k, v]) => `<tr><td>${k}</td><td class="n">${v}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 portrait;margin:12mm}body{font-family:"Segoe UI",Arial,sans-serif;font-size:9.5pt}h1{font-size:14pt;margin:0}table{border-collapse:collapse;width:100%;margin:3mm 0}td,th{border:.2mm solid #999;padding:1mm 1.5mm}th{background:#e9eef4}.n{text-align:right}.sh{page-break-inside:avoid;margin:2mm 0 4mm}</style></head><body>
  <h1>DAFTAR POTONG & TATA LETAK LEMBAR</h1><div>${escHtml(name)} · ${escHtml(date)} · celah gergaji ${o.sheet.kerf} mm · ${o.sheet.rotate ? 'boleh diputar' : 'arah serat dijaga'}</div>
  <table><tr><th>Kode</th><th>Nama</th><th>Panjang (mm)</th><th>Lebar (mm)</th><th>Tebal (mm)</th><th>Jml</th></tr>${rows}</table>
  ${hwRows ? `<h3>Perlengkapan (hardware)</h3><table><tr><th>Barang</th><th>Jumlah</th></tr>${hwRows}</table>` : ''}
  ${sheets}</body></html>`;
  if (!toFile) return { html, groups, cl };
  const out = await window.api.savePdf(html, name + ' - daftar potong.pdf', { pageSize: 'A4', landscape: false, margins: true });
  out && toast('Daftar potong & tata letak lembar (PDF) disimpan');
}
async function exportCutXlsx() {
  const cl = prodCutList();
  if (!cl.rows.length) return toast('Tidak ada panel/papan di pilihan ini');
  const groups = prodNesting(cl), hw = hardwareSum();
  const rows = [['DAFTAR POTONG'], [], ['Kode', 'Nama', 'Panjang (mm)', 'Lebar (mm)', 'Tebal (mm)', 'Jumlah', 'Luas (m²)'], ...cl.rows.map((r) => [r.code, r.name, r.L, r.W, r.T, r.qty, +((r.L * r.W * r.qty) / 1e6).toFixed(3)])];
  const sum = [['KEBUTUHAN LEMBAR'], [], ['Tebal (mm)', 'Jumlah lembar', 'Pemakaian rata-rata (%)', 'Harga/lembar', 'Total'], ...groups.map((g) => [g.T, g.nr.sheets.length, +(100 * g.nr.sheets.reduce((a, s2) => a + s2.used, 0) / Math.max(1, g.nr.sheets.length)).toFixed(1), g.price, g.cost]), [], ['PERLENGKAPAN'], ['Engsel', hw.engsel], ['Handle', hw.handle], ['Sekrup', hw.sekrup], ['Dowel', hw.dowel]];
  const bytes = xlsx([{ name: 'Daftar Potong', rows, bold: new Set([0, 2]), widths: [7, 20, 13, 11, 11, 9, 10] }, { name: 'Lembar & Hardware', rows: sum, bold: new Set([0, 2]), widths: [16, 15, 22, 14, 14] }]);
  const out = await window.api.exportBinary('xlsx', bytes, 'daftar potong.xlsx');
  out && toast('Daftar potong (Excel) disimpan');
}
async function exportPrint(kind) {
  const sids = prodSids();
  if (!sids.length) return toast('Tidak ada benda untuk dicetak');
  const sc = prodOpt().print.scale;
  if (kind === 'stl') return (await window.api.exportFile('stl', PR.exportSTLmm(model, sids, sc), 'model cetak.stl')) && toast('STL (mm) disimpan');
  const files = PR.export3MF(model, sids, sc);
  const bytes = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
  (await window.api.exportBinary('3mf', bytes, 'model cetak.3mf')) && toast('3MF (mm) disimpan');
}

function renderProdPane() {
  const P = $('pane-prod');
  P.replaceChildren();
  const o = prodOpt();
  const num = (obj, k, label, step = 1, min = 0, after = () => {}) => mkEl('label', {}, label, mkEl('input', { type: 'number', step, min, value: obj[k], onchange: (e) => { obj[k] = Math.max(min, +e.target.value || 0); after(); renderTray(); } }));
  const scope = selection.size ? 'benda terpilih' : 'semua benda yang tampak';
  // ---------- Mebel ----------
  P.append(mkEl('div', { className: 'ttl', textContent: 'Mebel & daftar potong' }));
  P.append(mkEl('div', { className: 'pdgrid' }, num(o.cab, 'w', 'Lebar (cm)'), num(o.cab, 'h', 'Tinggi (cm)'), num(o.cab, 'd', 'Dalam (cm)'), num(o.cab, 'shelves', 'Rak'), num(o.cab, 'doors', 'Pintu'), num(o.cab, 't', 'Tebal (mm)')));
  P.append(mkEl('div', { className: 'btnrow' }, mkEl('button', { textContent: '+ Tempatkan kabinet / lemari', onclick: placeCabinet })));
  const cl = prodCutList();
  if (!cl.rows.length) P.append(mkEl('div', { className: 'muted small', textContent: `Belum ada panel papan pada ${scope}. Buat kabinet di atas, atau gambar papan sebagai balok tipis (tebal ≤ 4 cm).` }));
  else {
    P.append(mkEl('div', { className: 'muted small', textContent: `Daftar potong dari ${scope} (${cl.rows.reduce((a, r) => a + r.qty, 0)} panel):` }));
    P.append(mkEl('table', { className: 'rab' },
      mkEl('tr', {}, ...['Kode', 'Nama', 'P × L × T (mm)', 'Jml'].map((h) => mkEl('th', { textContent: h }))),
      ...cl.rows.map((r) => mkEl('tr', {}, mkEl('td', { textContent: r.code }), mkEl('td', { textContent: r.name }), mkEl('td', { className: 'num', textContent: `${r.L}×${r.W}×${r.T}` }), mkEl('td', { className: 'num', textContent: r.qty })))));
    P.append(mkEl('div', { className: 'msec', textContent: 'Lembar papan' }));
    P.append(mkEl('div', { className: 'pdgrid' }, num(o.sheet, 'w', 'Panjang (mm)', 10), num(o.sheet, 'h', 'Lebar (mm)', 10), num(o.sheet, 'kerf', 'Celah gergaji', 0.5)));
    P.append(mkEl('label', { className: 'row' }, mkEl('input', { type: 'checkbox', checked: o.sheet.rotate, onchange: (e) => { o.sheet.rotate = e.target.checked; renderTray(); } }), ' Boleh diputar (abaikan arah serat)'));
    let tot = 0;
    for (const g of prodNesting(cl)) {
      tot += g.cost;
      P.append(mkEl('div', { className: 'small' }, mkEl('b', { textContent: `Tebal ${g.T} mm: ${g.nr.sheets.length} lembar` }), ` · terpakai ${g.nr.sheets.map((s2) => (s2.used * 100).toFixed(0) + '%').join(', ')} · harga/lembar `,
        mkEl('input', { type: 'number', step: 5000, min: 0, value: g.price, style: 'width:80px', onchange: (e) => { o.prices[g.T] = Math.max(0, +e.target.value || 0); renderTray(); } })));
      if (g.nr.tooBig.length) P.append(mkEl('div', { className: 'small', style: 'color:#c0392b', textContent: `${g.nr.tooBig.length} panel lebih besar dari lembar: ${g.nr.tooBig.map((x) => x.label).join(', ')}` }));
      P.append(mkEl('div', { className: 'kurva', innerHTML: g.nr.sheets.slice(0, 3).map((s2) => sheetSvg(g.nr, s2, 240)).join('') }));
    }
    const hw = hardwareSum();
    if (hw.engsel || hw.sekrup) P.append(mkEl('div', { className: 'small', textContent: `Perlengkapan: engsel ${hw.engsel}, handle ${hw.handle}, sekrup ±${hw.sekrup}, dowel ${hw.dowel}${tot ? ` · biaya papan Rp ${tot.toLocaleString('id-ID')}` : ''}` }));
    P.append(mkEl('div', { className: 'btnrow' },
      mkEl('button', { textContent: 'Laporan potong (PDF)', onclick: () => exportCutPdf() }),
      mkEl('button', { textContent: 'Excel', onclick: exportCutXlsx }),
      mkEl('button', { textContent: 'Pola CNC (DXF)', title: 'Satu berkas DXF per ketebalan papan', onclick: async () => { for (const g of prodNesting(cl)) if (!(await window.api.exportFile('dxf', PR.sheetsDxf(g.nr), `tata letak papan ${g.T} mm.dxf`))) return; toast('Tata letak lembar (DXF) disimpan'); } }),
    ));
  }
  // ---------- Cetak 3D ----------
  P.append(mkEl('div', { className: 'ttl', textContent: 'Cetak 3D' }));
  const pr = o.print;
  P.append(mkEl('div', { className: 'pdgrid' },
    mkEl('label', {}, 'Skala', mkEl('select', { onchange: (e) => { pr.scale = +e.target.value; renderTray(); } }, ...[[1, '1:1'], [0.1, '1:10'], [0.05, '1:20'], [0.02, '1:50'], [0.01, '1:100'], [0.005, '1:200'], [10, '10:1'], [1000, 'model dlm mm']].map(([v, t]) => mkEl('option', { value: v, textContent: t, selected: pr.scale === v })))),
    mkEl('label', {}, 'Bahan', mkEl('select', { onchange: (e) => { pr.material = e.target.value; renderTray(); } }, ...Object.keys(PR.FILAMENTS).map((k) => mkEl('option', { value: k, textContent: k, selected: pr.material === k })))),
    num(pr, 'infill', 'Isian (%)', 5), num(pr, 'pricePerKg', 'Rp / kg', 10000)));
  const sids = prodSids();
  if (sids.length) {
    const pa = PR.printAnalysis(model, sids, { ...pr, pricePerKg: pr.pricePerKg });
    const hh = Math.floor(pa.hours), mm = Math.round((pa.hours - hh) * 60);
    P.append(mkEl('div', { className: 'small' }, mkEl('b', { textContent: `${pa.size.map((x) => x.toFixed(1)).join(' × ')} mm` }), ` · volume ${pa.volume.toFixed(1)} cm³ · ±${pa.grams.toFixed(1)} g · ±${hh} j ${mm} m · Rp ${Math.round(pa.cost).toLocaleString('id-ID')}`));
    if (pa.issues.length) P.append(mkEl('ul', { className: 'issues' }, ...[...new Set(pa.issues.map((i) => i.msg))].map((t) => mkEl('li', { textContent: t }))));
    else P.append(mkEl('div', { className: 'small', style: 'color:#2f9e44', textContent: '✓ Siap dicetak: tertutup rapat, normal benar, muat di area cetak.' }));
  }
  P.append(mkEl('div', { className: 'btnrow' }, mkEl('button', { textContent: 'Ekspor STL (mm)', onclick: () => exportPrint('stl') }), mkEl('button', { textContent: 'Ekspor 3MF', onclick: () => exportPrint('3mf') })));
  // ---------- Pola datar ----------
  P.append(mkEl('div', { className: 'ttl', textContent: 'Pola datar — laser cut & kemasan' }));
  o.box ||= { L: 100, W: 60, H: 40 };
  P.append(mkEl('div', { className: 'pdgrid' }, num(o.box, 'L', 'Panjang (mm)'), num(o.box, 'W', 'Lebar (mm)'), num(o.box, 'H', 'Tinggi (mm)')));
  P.append(mkEl('div', { className: 'btnrow' },
    mkEl('button', { textContent: '+ Kotak kemasan', onclick: () => { const b = o.box; startPlace({ label: 'Kotak kemasan', gen: (m, at, n, angle) => { const start = m.nextId; PR.buildBox(m, b.L / 1000, b.W / 1000, b.H / 1000); const ids = new Set(m.faces.filter((f) => f.id >= start).map((f) => f.id)); G.applyMatrix(m, ids, new THREE.Matrix4().makeRotationZ(angle).setPosition(at)); if (m === model) for (const f of m.faces) if (ids.has(f.id)) f.group = editGroup; return { ids }; } }); } }),
    mkEl('label', { title: 'Lebar lidah lem (mm)' }, 'Lidah ', mkEl('input', { type: 'number', min: 0, step: 1, value: o.net.tab, style: 'width:46px', onchange: (e) => { o.net.tab = Math.max(0, +e.target.value || 0); lastNet = null; } }), ' mm'),
  ));
  P.append(mkEl('div', { className: 'btnrow' }, mkEl('button', { textContent: 'Buka benda terpilih jadi pola', onclick: buildNet })));
  if (lastNet) {
    P.append(mkEl('div', { className: 'kurva', innerHTML: PR.netSvg(lastNet, 1).replace(/width="[^"]+mm" height="[^"]+mm"/, 'width="100%"') }));
    P.append(mkEl('div', { className: 'muted small', textContent: `${lastNet.pieces} potongan · ${(lastNet.W * 1000).toFixed(0)} × ${(lastNet.H * 1000).toFixed(0)} mm · merah = potong, biru = lipat` }));
    P.append(mkEl('div', { className: 'btnrow' }, mkEl('button', { textContent: 'PDF 1:1', onclick: () => exportNet('pdf') }), mkEl('button', { textContent: 'SVG (laser)', onclick: () => exportNet('svg') }), mkEl('button', { textContent: 'DXF', onclick: () => exportNet('dxf') })));
  } else P.append(mkEl('div', { className: 'muted small', textContent: 'Pilih satu benda bersisi datar (kotak, prisma, kemasan), lalu buka jadi pola potong + lipat dengan lidah lem.' }));
}

// ---- RAB otomatis (format RAB_Bangunan) ----
function rabProject() {
  model.rab ||= {};
  model.rab.project ||= {};
  const p = model.rab.project;
  return { name: p.name || (filePath ? filePath.split(/[\\/]/).pop().replace(/\.skc$/, '') : 'Proyek SketchClone'), location: p.location || '-', status: p.status || 'Perencanaan' };
}
async function exportRab(toFile = true) {
  const rows = C.rabRows(model);
  if (!rows.length) return toast('Belum ada dinding / ruang / kusen / atap untuk dihitung. Gambar dengan alat Dinding, Pintu, Jendela, Ruang, dan Atap.');
  const { data, grand } = C.rabSheet(model, rows, rabProject());
  const bold = new Set([0, 6, data.length - 1]);
  data.forEach((r, i) => { if (r.length === 12 && r[1] === '' && i > 6) bold.add(i); });
  const bytes = xlsx([{ name: 'RAB', rows: data, bold, widths: [6, 22, 42, 11, 10, 8, 14, 15, 15, 13, 17, 10] }, ...rabExtraSheets(rows), { name: 'Harga AHSP', rows: [['Kode', 'Jenis Pekerjaan', 'Satuan', 'Harga Satuan', 'Material', 'Tenaga', 'Alat', 'Kategori'], ...C.AHSP.map((a) => [a.code, a.name, a.unit, (model.rab?.prices || {})[a.code] ?? a.price, a.mat, a.lab, a.eq, a.sub])] }]);
  if (!toFile) return { bytes: bytes.length, rows, grand, data };
  const out = await window.api.exportBinary('xlsx', bytes, rabProject().name + ' - RAB.xlsx');
  out && toast('RAB disimpan · total Rp ' + grand.toLocaleString('id-ID'));
}

const rabWeeks = () => (model.rab && model.rab.weeks) || 16;
// Diagram batang bobot mingguan + garis kumulatif (Kurva S)
function kurvaSvg(sc, W, H, big = false) {
  const pl = big ? 46 : 26, pr = 8, pt = 10, pb = big ? 30 : 18;
  const iw = W - pl - pr, ih = H - pt - pb, n = sc.weeks;
  const bw = iw / n, maxBar = Math.max(...sc.plan, 1);
  const fs = big ? 12 : 8;
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const y = pt + ih - (ih * k) / 4;
    g += `<line x1="${pl}" y1="${y}" x2="${W - pr}" y2="${y}" stroke="#e3e7ec"/><text x="${pl - 3}" y="${y + fs / 3}" font-size="${fs}" text-anchor="end" fill="#667">${k * 25}%</text>`;
  }
  sc.plan.forEach((v, i) => {
    const h = (v / maxBar) * ih * 0.45;
    g += `<rect x="${(pl + i * bw + bw * 0.15).toFixed(1)}" y="${(pt + ih - h).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${h.toFixed(1)}" fill="#9cc0ea"/>`;
  });
  const pts = [[pl, pt + ih], ...sc.cum.map((v, i) => [pl + (i + 1) * bw, pt + ih - (v / 100) * ih])];
  g += `<polyline points="${pts.map((p) => p.map((x) => x.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#c0392b" stroke-width="${big ? 2.5 : 1.8}"/>`;
  const step = Math.ceil(n / (big ? 26 : 8));
  for (let i = 0; i < n; i += step) g += `<text x="${(pl + (i + 0.5) * bw).toFixed(1)}" y="${H - pb + fs + 3}" font-size="${fs}" text-anchor="middle" fill="#667">${i + 1}</text>`;
  if (big) g += `<text x="${pl + iw / 2}" y="${H - 4}" font-size="12" text-anchor="middle" fill="#445">Minggu ke-</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg">${g}</svg>`;
}
function rabExtraSheets(rows) {
  const rk = C.rekap(model, rows);
  const rekapRows = [['REKAPITULASI RENCANA ANGGARAN BIAYA'], ['Nama Proyek:', rabProject().name], ['Lokasi:', rabProject().location], [],
    ['No', 'Uraian Pekerjaan', 'Jumlah Biaya (Rp)'], ...rk.cats.map((c, i) => [i + 1, c.cat, c.total]), [],
    ['', 'JUMLAH', rk.sub], ['', `Jasa kontraktor ${rk.jasaPct}%`, rk.jasa], ['', 'JUMLAH + JASA', rk.dpp], ['', `PPN ${rk.ppnPct}%`, rk.ppn],
    ['', 'TOTAL', rk.total], ['', 'DIBULATKAN', rk.bulat], ['', 'Terbilang: ' + rk.terbilang]];
  const n0 = rk.cats.length;
  const mt = C.materialTakeoff(model);
  const bahan = [['KEBUTUHAN BAHAN POKOK (perkiraan, koefisien SNI)'], [], ['No', 'Bahan', 'Jumlah', 'Satuan', 'Harga Satuan', 'Total'], ...mt.map((b, i) => [i + 1, b.name, b.qty, b.unit, b.price, b.total]), [], ['', 'TOTAL', '', '', '', mt.reduce((a, b) => a + b.total, 0)]];
  const sc = C.schedule(rows, rabWeeks());
  const wk = [...Array(sc.weeks)].map((_, i) => 'M' + (i + 1));
  const r2 = (v) => Math.round(v * 100) / 100;
  const kurva = [['JADWAL PELAKSANAAN & KURVA S'], [], ['No', 'Uraian Pekerjaan', 'Biaya (Rp)', 'Bobot (%)', ...wk],
    ...sc.cats.map((c, i) => [i + 1, c.cat, Math.round(c.cost), r2(c.weight), ...c.per.map((v) => (v ? r2(v) : ''))]), [],
    ['', 'Rencana mingguan (%)', '', 100, ...sc.plan.map(r2)], ['', 'Kumulatif (%)', '', '', ...sc.cum.map(r2)]];
  const bb = C.bbs(model);
  const besi = [['DAFTAR PEMBESIAN (BAR BENDING SCHEDULE)'], [], ['No', 'Elemen', 'Kode', 'Diameter', 'Uraian', 'Panjang Total (m)', 'Berat (kg)', 'Batang 12 m'],
    ...bb.rows.map((r, i) => [i + 1, r.el, r.kode, r.bar, r.desc, r.len, r.kg, r.batang]), [], ['', 'REKAP PER DIAMETER'],
    ...bb.perBar.map((x) => ['', x.bar, '', '', '', x.len, x.kg, x.batang]), ['', 'TOTAL', '', '', '', '', bb.totalKg, '']];
  const sch = C.openingSchedule(model);
  const kusen = [['DAFTAR KUSEN PINTU & JENDELA'], [], ['Kode', 'Jenis', 'Lebar (m)', 'Tinggi (m)', 'Tinggi ambang (m)', 'Jumlah'], ...sch.map((t) => [t.code, t.type === 'pintu' ? 'Pintu panel kayu' : 'Jendela kaca', t.w, t.h, t.sill, t.n])];
  return [
    { name: 'Pembesian', rows: besi, bold: new Set([0, 2, besi.length - 1]), widths: [5, 22, 7, 9, 34, 15, 12, 12] },
    { name: 'Kusen', rows: kusen, bold: new Set([0, 2]), widths: [8, 20, 11, 11, 16, 9] },
    { name: 'Rekapitulasi', rows: rekapRows, bold: new Set([0, 4, 7 + n0, 11 + n0, 12 + n0]), widths: [6, 46, 20] },
    { name: 'Kebutuhan Bahan', rows: bahan, bold: new Set([0, 2, bahan.length - 1]), widths: [6, 30, 12, 9, 14, 16] },
    { name: 'Kurva S', rows: kurva, bold: new Set([0, 2, kurva.length - 2, kurva.length - 1]), widths: [5, 26, 15, 10, ...wk.map(() => 7)] },
  ];
}
async function exportRabPdf(toFile = true) {
  const rows = C.rabRows(model);
  if (!rows.length) return toast('Belum ada pekerjaan untuk dihitung.');
  const pj = rabProject();
  const rk = C.rekap(model, rows);
  const mt = C.materialTakeoff(model);
  const sc = C.schedule(rows, rabWeeks());
  const rp = (v) => v.toLocaleString('id-ID');
  const date = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  let body = '', no = 1, cat = null;
  for (const r of rows) {
    if (r.cat !== cat) { cat = r.cat; body += `<tr class="cat"><td colspan="7">${escHtml(cat)}</td></tr>`; }
    body += `<tr><td class="c">${no++}</td><td>${escHtml(r.name)}</td><td class="c">${r.code}</td><td class="n">${rp(r.vol)}</td><td class="c">${escHtml(r.unit)}</td><td class="n">${rp(r.price)}</td><td class="n">${rp(r.total)}</td></tr>`;
  }
  const head = (t) => `<div class="hd"><h1>${t}</h1><div>${[pj.name, pj.location !== '-' ? pj.location : '', date].filter(Boolean).map(escHtml).join(' · ')}</div></div>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4 portrait; margin: 14mm 12mm; }
    body { font-family: "Segoe UI", Arial, sans-serif; font-size: 9.5pt; color: #111; }
    .hd { border-bottom: 0.6mm solid #111; margin-bottom: 4mm; padding-bottom: 2mm; } .hd h1 { font-size: 14pt; margin: 0 0 1mm; } .hd div { color: #444; }
    table { width: 100%; border-collapse: collapse; } th, td { border: 0.2mm solid #999; padding: 1.2mm 1.6mm; vertical-align: top; }
    th { background: #e9eef4; } tr.cat td { background: #f4f6f8; font-weight: 700; } .n { text-align: right; white-space: nowrap; } .c { text-align: center; }
    tr.tot td { font-weight: 700; border-top: 0.5mm solid #111; } .page { page-break-before: always; } .tb { margin-top: 3mm; font-style: italic; }
    .sign { margin-top: 14mm; display: flex; justify-content: flex-end; } .sign div { width: 60mm; text-align: center; } .sign .ln { margin-top: 22mm; border-top: 0.3mm solid #111; }
  </style></head><body>
  ${head('RENCANA ANGGARAN BIAYA (RAB)')}
  <table><tr><th>No</th><th>Jenis Pekerjaan</th><th>Kode</th><th>Volume</th><th>Sat.</th><th>Harga Satuan (Rp)</th><th>Jumlah (Rp)</th></tr>${body}
  <tr class="tot"><td colspan="6">JUMLAH</td><td class="n">${rp(rk.sub)}</td></tr></table>
  <div class="page">${head('REKAPITULASI')}
  <table><tr><th>No</th><th>Uraian Pekerjaan</th><th>Jumlah (Rp)</th></tr>${rk.cats.map((c, i) => `<tr><td class="c">${i + 1}</td><td>${escHtml(c.cat)}</td><td class="n">${rp(c.total)}</td></tr>`).join('')}
  <tr class="tot"><td colspan="2">JUMLAH</td><td class="n">${rp(rk.sub)}</td></tr>
  <tr><td colspan="2">Jasa kontraktor ${rk.jasaPct}%</td><td class="n">${rp(rk.jasa)}</td></tr>
  <tr><td colspan="2">PPN ${rk.ppnPct}%</td><td class="n">${rp(rk.ppn)}</td></tr>
  <tr class="tot"><td colspan="2">TOTAL (DIBULATKAN)</td><td class="n">Rp ${rp(rk.bulat)}</td></tr></table>
  <div class="tb">Terbilang: ${escHtml(rk.terbilang)}</div>
  ${mt.length ? `<h3>Kebutuhan bahan pokok (perkiraan, koefisien SNI)</h3><table><tr><th>No</th><th>Bahan</th><th>Jumlah</th><th>Harga Satuan (Rp)</th><th>Total (Rp)</th></tr>${mt.map((b, i) => `<tr><td class="c">${i + 1}</td><td>${escHtml(b.name)}</td><td class="n">${rp(b.qty)} ${escHtml(b.unit)}</td><td class="n">${rp(b.price)}</td><td class="n">${rp(b.total)}</td></tr>`).join('')}</table>` : ''}
  ${(() => { const bb = C.bbs(model); return bb.rows.length ? `<h3>Daftar pembesian</h3><table><tr><th>Elemen</th><th>Uraian</th><th>Panjang (m)</th><th>Berat (kg)</th><th>Batang 12 m</th></tr>${bb.rows.map((r) => `<tr><td>${escHtml(r.el)}</td><td>${escHtml(r.desc)}</td><td class="n">${rp(r.len)}</td><td class="n">${rp(r.kg)}</td><td class="n">${r.batang}</td></tr>`).join('')}${bb.perBar.map((x) => `<tr class="cat"><td colspan="2">Total ${x.bar}</td><td class="n">${rp(x.len)}</td><td class="n">${rp(x.kg)}</td><td class="n">${x.batang}</td></tr>`).join('')}</table>` : ''; })()}
  <div class="sign"><div>${escHtml(pj.location !== '-' ? pj.location + ', ' : '')}${escHtml(date)}<br>Dibuat oleh,<div class="ln"></div></div></div></div>
  <div class="page">${head('JADWAL PELAKSANAAN & KURVA S (' + sc.weeks + ' minggu)')}
  ${kurvaSvg(sc, 720, 330, true)}
  <table style="margin-top:4mm"><tr><th>No</th><th>Uraian Pekerjaan</th><th>Bobot (%)</th><th>Minggu</th></tr>${sc.cats.map((c, i) => `<tr><td class="c">${i + 1}</td><td>${escHtml(c.cat)}</td><td class="n">${c.weight.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td class="c">${c.w0 + 1} – ${c.w1}</td></tr>`).join('')}</table></div>
  </body></html>`;
  if (!toFile) return { html, rk, mt, sc };
  const out = await window.api.savePdf(html, pj.name + ' - Laporan RAB.pdf', { pageSize: 'A4', landscape: false, margins: true });
  out && toast('Laporan RAB (PDF) disimpan · total Rp ' + rp(rk.bulat));
}

function renderKonsPane() {
  const P = $('pane-kons');
  P.replaceChildren();
  const L = C.levelsOf(model);
  P.append(mkEl('div', { className: 'ttl', textContent: 'Lantai' }));
  L.forEach((lv, i) => {
    const tag = model.tags.find((t) => t.id === lv.tag);
    P.append(mkEl('div', { className: 'lvrow' + (i === (model.activeLevel || 0) ? ' on' : '') },
      mkEl('input', { type: 'radio', name: 'lvl', checked: i === (model.activeLevel || 0), title: 'Lantai aktif (tempat menggambar)', onchange: () => { model.activeLevel = i; renderKonsPane(); tools[toolName]?.activate?.(); } }),
      mkEl('input', { value: lv.name, className: 'lvname', onchange: (e) => { lv.name = e.target.value || lv.name; if (tag) tag.name = lv.name; changed(); } }),
      mkEl('label', { title: 'Elevasi lantai (m)' }, '±', mkEl('input', { type: 'number', step: 0.1, value: lv.z, onchange: (e) => { lv.z = +e.target.value || 0; changed(); } })),
      mkEl('label', { title: 'Tinggi lantai ke lantai (m)' }, '↕', mkEl('input', { type: 'number', step: 0.1, min: 2, value: lv.h, onchange: (e) => { lv.h = +e.target.value || 3.5; changed(); } })),
      tag ? mkEl('input', { type: 'checkbox', checked: tag.visible !== false, title: 'Tampil/sembunyi', onchange: (e) => { tag.visible = e.target.checked; snapCache = null; changed(); } }) : mkEl('span'),
    ));
  });
  P.append(mkEl('div', { className: 'btnrow' },
    mkEl('button', { textContent: '+ Tambah lantai', onclick: addLevel }),
    mkEl('button', { textContent: '+ Tangga', title: 'Tangga beton dari lantai aktif ke lantai di atasnya', onclick: () => placeStairTool() }),
    mkEl('select', { className: 'stshape', title: 'Bentuk tangga', onchange: (e) => { stairShape = e.target.value; } }, ...Object.entries(C.STAIR_SHAPES).map(([k, v]) => mkEl('option', { value: k, textContent: v, selected: stairShape === k }))),
    mkEl('button', { textContent: 'Hanya lantai aktif', disabled: L.length < 2, onclick: () => { L.forEach((lv, i) => { const t = model.tags.find((x) => x.id === lv.tag); if (t) t.visible = i === (model.activeLevel || 0); }); snapCache = null; changed(); } }),
    mkEl('button', { textContent: 'Semua', disabled: L.length < 2, onclick: () => { L.forEach((lv) => { const t = model.tags.find((x) => x.id === lv.tag); if (t) t.visible = true; }); snapCache = null; changed(); } }),
  ));
  // ---- renovasi
  P.append(mkEl('div', { className: 'ttl', textContent: 'Renovasi' }));
  const reno = C.renoActive(model);
  P.append(mkEl('div', { className: 'btnrow' },
    mkEl('button', { textContent: 'Semua yang ada = Eksisting', title: 'Tandai seluruh model sekarang sebagai bangunan lama. Yang digambar sesudahnya otomatis dihitung pekerjaan baru.', onclick: markAllExisting })));
  P.append(mkEl('div', { className: 'btnrow phbtn' }, mkEl('span', { className: 'small', textContent: 'Tandai pilihan:' }),
    mkEl('button', { className: 'ph-exist', textContent: 'Eksisting', title: 'Bangunan lama yang dipertahankan (tidak masuk RAB)', onclick: () => markPhase('exist') }),
    mkEl('button', { className: 'ph-demo', textContent: 'Dibongkar', title: 'Masuk RAB sebagai pekerjaan bongkaran + buang puing', onclick: () => markPhase('demo') }),
    mkEl('button', { className: 'ph-new', textContent: 'Baru', title: 'Pekerjaan baru (masuk RAB penuh)', onclick: () => markPhase('new') })));
  if (reno) {
    const cnt = { exist: 0, demo: 0, new: 0 };
    for (const [k, g] of Object.entries(model.groups)) if (['wall', 'opening', 'room', 'roof', 'stair', 'mep', 'slab', 'beam', 'column'].some((q) => g[q])) cnt[C.phaseOf(model, +k)]++;
    P.append(trow('Tampilan', mkEl('select', { onchange: (e) => setRenoView(e.target.value) },
      ...[['warna', 'Warna fase'], ['sebelum', 'Kondisi lama (sebelum)'], ['sesudah', 'Rencana (sesudah)'], ['normal', 'Normal']].map(([v, t]) => mkEl('option', { value: v, textContent: t, selected: (model.reno?.view || 'warna') === v })))));
    P.append(mkEl('div', { className: 'rlegend small' }, mkEl('span', { className: 'ex' }, `Eksisting ${cnt.exist}`), mkEl('span', { className: 'dm' }, `Dibongkar ${cnt.demo}`), mkEl('span', { className: 'nw' }, `Baru ${cnt.new}`)));
    P.append(mkEl('div', { className: 'muted small', textContent: 'RAB hanya menghitung pekerjaan baru + bongkaran (termasuk bobok dinding lama untuk pintu/jendela baru). Denah memakai warna standar: abu-abu = eksisting, merah putus-putus = dibongkar, hitam = baru.' }));
  } else P.append(mkEl('div', { className: 'muted small', textContent: 'Untuk renovasi: gambar dulu kondisi bangunan sekarang, klik "Semua yang ada = Eksisting", tandai bagian yang akan dibongkar, lalu gambar pekerjaan baru. RAB otomatis hanya menghitung perubahannya.' }));

  P.append(mkEl('div', { className: 'ttl', textContent: 'Struktur' }));
  const nStruct = Object.values(model.groups).filter((g) => g.struct).length;
  const structOnly = Object.values(model.groups).some((g) => g.wall && g.hidden);
  P.append(mkEl('div', { className: 'btnrow' },
    mkEl('button', { textContent: nStruct ? 'Perbarui struktur' : 'Buat struktur', title: 'Kolom praktis tiap sudut & tiap 3 m (digeser dari kusen), ring balok, sloof, pondasi batu kali', onclick: buildAllStructure }),
    mkEl('button', { textContent: structOnly ? 'Tampilkan dinding' : 'Lihat struktur saja', disabled: !nStruct, onclick: () => toggleStructView(!structOnly) }),
  ));
  {
    const bb = C.bbs(model);
    if (bb.rows.length) {
      P.append(mkEl('div', { className: 'muted small', textContent: 'Pembesian (besi 12 m): ' + bb.perBar.map((x) => `${x.bar} ${x.batang} btg (${x.kg.toLocaleString('id-ID')} kg)`).join(' · ') + ` · total ${bb.totalKg.toLocaleString('id-ID')} kg` }));
    }
  }
  {
    const num = (k, label, tip) => mkEl('label', { title: tip }, label, mkEl('input', { type: 'number', step: 1, min: 10, value: Math.round(strukDim[k] * 100), onchange: (e) => { strukDim[k] = Math.max(0.08, (+e.target.value || 0) / 100); } }));
    P.append(mkEl('div', { className: 'msec', textContent: 'Elemen beton (cm)' }));
    P.append(mkEl('div', { className: 'pdgrid g4' }, num('t', 'Tebal plat', 'Tebal plat beton'), num('bw', 'Lebar balok', 'Lebar balok'), num('bh', 'Tinggi balok', 'Tinggi total balok'), num('cb', 'Kolom', 'Sisi kolom struktur')));
    P.append(mkEl('div', { className: 'btnrow' },
      mkEl('button', { textContent: 'Plat', title: 'Pilih ruang (plat di atasnya) atau bidang persegi di ketinggian atas plat', onclick: slabFromSelection }),
      mkEl('button', { textContent: 'Balok', title: 'Pilih garis as balok, atau pilih plat untuk balok di tepi yang belum ditopang', onclick: beamsFromSelection }),
      mkEl('button', { textContent: '+ Kolom', title: 'Klik untuk menaruh kolom struktur (lantai dasar: dengan footplat)', onclick: placeColumnTool }),
      mkEl('button', { className: 'primary', textContent: 'Cek struktur', title: 'Periksa tebal plat, ukuran balok, beban kolom & pondasi', onclick: runStructCheck })));
    if (lastCheck) {
      lastCheck = S.structCheck(model);
      const n = lastCheck.n;
      const so = S.optsOf(model);
      const setO = (k) => (e) => { model.rab ||= {}; model.rab.struk = { ...(model.rab.struk || {}), [k]: Math.max(0.1, +e.target.value || 0) }; changed(); };
      P.append(mkEl('div', { className: 'pdgrid' },
        mkEl('label', { title: 'Daya dukung tanah izin (100 kN/m² ≈ 1 kg/cm², tanah sedang)' }, 'Tanah kN/m²', mkEl('input', { type: 'number', step: 10, value: so.soil, onchange: setO('soil') })),
        mkEl('label', { title: 'Beban hidup lantai/dak (rumah 2 kN/m²)' }, 'Beban hidup', mkEl('input', { type: 'number', step: 0.5, value: so.LL, onchange: setO('LL') })),
        mkEl('label', { title: 'Mutu beton fc (K-225 ≈ 18,7 MPa)' }, 'fc MPa', mkEl('input', { type: 'number', step: 0.5, value: so.fc, onchange: setO('fc') }))));
      P.append(mkEl('div', { className: 'cksum ' + (n.err ? 'err' : n.warn ? 'warn' : 'ok') }, n.err ? `${n.err} masalah serius · ${n.warn} peringatan · ${n.ok} OK` : n.warn ? `${n.warn} peringatan · ${n.ok} OK` : `Semua ${n.ok} pemeriksaan OK`));
      if (lastCheck.items.some((x) => x.fix && x.lvl !== 'ok')) P.append(mkEl('div', { className: 'btnrow' }, mkEl('button', { textContent: 'Terapkan semua saran', onclick: fixAllStruct })));
      const list = mkEl('div', { className: 'cklist' });
      for (const it of lastCheck.items) {
        list.append(mkEl('div', { className: 'ckrow ' + it.lvl },
          mkEl('span', { className: 'dot' }),
          mkEl('span', { className: 'msg', textContent: `${it.el}: ${it.msg}`, title: 'Klik untuk memilih elemen', onclick: () => { if (it.gid != null && model.groups[it.gid]) { selection = new Set(G.entitiesInTree(model, it.gid)); refresh(); } } }),
          it.fix && it.lvl !== 'ok' ? mkEl('button', { textContent: it.fix.label || 'Perbaiki', onclick: () => applyStructFix(it.fix) }) : null));
      }
      P.append(list);
      P.append(mkEl('div', { className: 'muted small', textContent: 'Cek cepat berdasarkan aturan praktis SNI 2847 & SNI 1727 untuk rumah tinggal (beban terfaktor 1,2D + 1,6L). Bukan pengganti perhitungan dan tanda tangan insinyur sipil — gunakan sebagai peringatan dini.' }));
    }
  }
  P.append(mkEl('div', { className: 'ttl', textContent: 'Listrik & Sanitasi' }));
  P.append(mkEl('div', { className: 'mepgrid' }, ...Object.entries(C.MEP).map(([k, it]) => {
    const cnt = Object.values(model.groups).filter((g) => g.mep?.kind === k).length;
    return mkEl('button', { title: `Tempatkan ${it.name}`, onclick: () => placeMepTool(k) }, mkEl('span', { className: 'ic', textContent: it.icon }), mkEl('span', { textContent: it.name + (cnt ? ` (${cnt})` : '') }));
  })));
  {
    const runs = C.mepRuns(model);
    if (runs.kabel || runs.air || runs.kotor) P.append(mkEl('div', { className: 'muted small', textContent: `Perkiraan jalur: kabel ${runs.kabel.toFixed(1)} m · pipa air bersih ${runs.air.toFixed(1)} m · pipa air kotor ${runs.kotor.toFixed(1)} m (jalur siku dari panel / tandon / septic tank, +10%)` }));
  }
  P.append(mkEl('div', { className: 'ttl', textContent: 'Ruang' }));
  const rooms = Object.entries(model.groups).filter(([, g]) => g.room);
  if (!rooms.length) P.append(mkEl('div', { className: 'muted small', textContent: 'Pakai alat Ruang lalu klik di dalam ruangan untuk menghitung luasnya.' }));
  let tot = 0;
  for (const [gid, g] of rooms) {
    const r = g.room;
    tot += r.area;
    P.append(mkEl('div', { className: 'rmrow' },
      mkEl('input', { value: r.name, onchange: (e) => {
        r.name = e.target.value || r.name;
        g.name = 'Ruang ' + r.name;
        const lab = model.labels.find((l) => l.id === r.label);
        if (lab) lab.text = `${r.name}\n${r.area.toFixed(2)} m²`;
        changed();
      } }),
      mkEl('span', { className: 'area', textContent: r.area.toFixed(2) + ' m²', title: 'Klik untuk memilih', onclick: () => { selection = new Set(G.entitiesInTree(model, +gid)); refresh(); } }),
      mkEl('select', { title: 'Penutup lantai', onchange: (e) => { r.floor = e.target.value; changed(); } },
        ...Object.entries(C.FLOOR_TYPES).map(([k, v]) => mkEl('option', { value: k, textContent: v, selected: (r.floor || '7.4.1.2') === k }))),
    ));
  }
  if (rooms.length) P.append(mkEl('div', { className: 'small', textContent: `Total luas lantai: ${tot.toFixed(2)} m²` }));
  P.append(mkEl('div', { className: 'ttl', textContent: 'RAB (Rencana Anggaran Biaya)' }));
  const pj = rabProject();
  model.rab ||= {};
  model.rab.prices ||= {};
  P.append(trow('Nama proyek', mkEl('input', { value: pj.name, onchange: (e) => { model.rab.project.name = e.target.value; changed(); } })));
  P.append(trow('Lokasi', mkEl('input', { value: pj.location === '-' ? '' : pj.location, placeholder: 'mis. Bandung', onchange: (e) => { model.rab.project.location = e.target.value; changed(); } })));
  const pd = C.pondasiOf(model);
  const pin = (k, label, tip) => mkEl('label', { title: tip }, label, mkEl('input', { type: 'number', step: 0.05, min: 0, value: pd[k], onchange: (e) => {
    model.rab.pondasi = { ...(model.rab.pondasi || {}), [k]: Math.max(0, +e.target.value || 0) };
    changed();
  } }));
  P.append(mkEl('div', { className: 'msec', textContent: 'Pondasi batu kali (m)' }));
  P.append(mkEl('div', { className: 'pdgrid' },
    pin('top', 'Lebar atas', 'Lebar atas pondasi'), pin('bot', 'Lebar bawah', 'Lebar bawah pondasi'), pin('h', 'Tinggi', 'Tinggi pondasi'),
    pin('w', 'Lebar galian', 'Lebar galian tanah'), pin('d', 'Dalam galian', 'Kedalaman galian'), pin('sand', 'Pasir', 'Tebal urugan pasir di bawah pondasi')));
  P.append(mkEl('div', { className: 'muted small', textContent: `Penampang batu kali ${pd.stone.toFixed(3)} m² · galian ${(pd.w * pd.d).toFixed(2)} m² per meter dinding` }));
  const rows = C.rabRows(model);
  if (!rows.length) {
    P.append(mkEl('div', { className: 'muted small', textContent: 'RAB dihitung otomatis dari dinding, kusen pintu/jendela, ruang, dan atap pelana yang Anda gambar.' }));
    return;
  }
  const tb = mkEl('table', { className: 'rab' }, mkEl('tr', {}, ...['Volume', 'Harga satuan (Rp)', 'Jumlah (Rp)'].map((h) => mkEl('th', { textContent: h }))));
  let cat = null, grand = 0;
  for (const r of rows) {
    if (r.cat !== cat) { cat = r.cat; tb.append(mkEl('tr', { className: 'cat' }, mkEl('td', { colSpan: 3, textContent: cat }))); }
    grand += r.total;
    tb.append(mkEl('tr', { className: 'nm' }, mkEl('td', { colSpan: 3, textContent: r.name, title: 'Kode AHSP ' + r.code })));
    tb.append(mkEl('tr', {},
      mkEl('td', { className: 'num', textContent: `${r.vol.toLocaleString('id-ID')} ${r.unit}` }),
      mkEl('td', {}, '× ', mkEl('input', { type: 'number', step: 1000, min: 0, value: r.price, title: 'Ubah harga satuan (Rp)', onchange: (e) => { model.rab.prices[r.key] = Math.max(0, +e.target.value || 0); changed(); } })),
      mkEl('td', { className: 'num', textContent: r.total.toLocaleString('id-ID') }),
    ));
  }
  tb.append(mkEl('tr', { className: 'tot' }, mkEl('td', { colSpan: 2, textContent: 'JUMLAH' }), mkEl('td', { className: 'num', textContent: 'Rp ' + grand.toLocaleString('id-ID') })));
  P.append(tb);
  // rekapitulasi
  const rk = C.rekap(model, rows);
  const setRk = (k) => (e) => { model.rab.rekap = { ...(model.rab.rekap || {}), [k]: Math.max(0, +e.target.value || 0) }; changed(); };
  const rp = (v) => 'Rp ' + v.toLocaleString('id-ID');
  P.append(mkEl('div', { className: 'msec', textContent: 'Rekapitulasi' }));
  P.append(mkEl('table', { className: 'rab rekap' },
    mkEl('tr', {}, mkEl('td', { textContent: 'Jumlah biaya pekerjaan' }), mkEl('td', { className: 'num', textContent: rp(rk.sub) })),
    mkEl('tr', {}, mkEl('td', {}, 'Jasa kontraktor ', mkEl('input', { type: 'number', min: 0, max: 50, step: 1, value: rk.jasaPct, onchange: setRk('jasa') }), ' %'), mkEl('td', { className: 'num', textContent: rp(rk.jasa) })),
    mkEl('tr', {}, mkEl('td', {}, 'PPN ', mkEl('input', { type: 'number', min: 0, max: 20, step: 1, value: rk.ppnPct, onchange: setRk('ppn') }), ' %'), mkEl('td', { className: 'num', textContent: rp(rk.ppn) })),
    mkEl('tr', { className: 'tot' }, mkEl('td', { textContent: 'TOTAL (dibulatkan)' }), mkEl('td', { className: 'num', textContent: rp(rk.bulat) })),
  ));
  P.append(mkEl('div', { className: 'small terbilang', textContent: 'Terbilang: ' + rk.terbilang }));
  // kebutuhan bahan
  const mt = C.materialTakeoff(model);
  if (mt.length) {
    model.rab.matPrices ||= {};
    P.append(mkEl('div', { className: 'msec', textContent: 'Kebutuhan bahan pokok (koefisien SNI)' }));
    P.append(mkEl('table', { className: 'rab' },
      mkEl('tr', {}, ...['Bahan', 'Jumlah', 'Harga (Rp)'].map((h) => mkEl('th', { textContent: h }))),
      ...mt.map((b) => mkEl('tr', {},
        mkEl('td', { textContent: b.name }),
        mkEl('td', { className: 'num', textContent: `${b.qty.toLocaleString('id-ID')} ${b.unit}` }),
        mkEl('td', {}, mkEl('input', { type: 'number', min: 0, step: 500, value: b.price, title: 'Harga satuan bahan', onchange: (e) => { model.rab.matPrices[b.key] = Math.max(0, +e.target.value || 0); changed(); } }))))));
    P.append(mkEl('div', { className: 'muted small', textContent: `Perkiraan belanja bahan pokok: ${rp(mt.reduce((a, b) => a + b.total, 0))}. Harga dari daftar material RAB_Bangunan.` }));
  }
  // jadwal & kurva S
  P.append(mkEl('div', { className: 'msec', textContent: 'Jadwal & Kurva S' }));
  P.append(trow('Durasi (minggu)', mkEl('input', { type: 'number', min: 2, max: 104, step: 1, value: rabWeeks(), onchange: (e) => { model.rab.weeks = Math.max(2, Math.min(104, Math.round(+e.target.value) || 16)); changed(); } })));
  P.append(mkEl('div', { className: 'kurva', innerHTML: kurvaSvg(C.schedule(rows, rabWeeks()), 250, 150) }));
  P.append(mkEl('div', { className: 'btnrow' },
    mkEl('button', { textContent: 'Laporan RAB (PDF)', onclick: () => exportRabPdf() }),
    mkEl('button', { textContent: 'Ekspor RAB (Excel)', onclick: () => exportRab() }),
    mkEl('button', { textContent: 'Harga default', title: 'Kembalikan semua harga ke AHSP', onclick: () => { model.rab.prices = {}; changed(); } }),
  ));
  P.append(mkEl('div', { className: 'muted small', textContent: 'Harga dari AHSP (repo RAB_Bangunan). Volume: bata = luas dinding dikurangi bukaan; plester & acian 2 sisi; pondasi & sloof untuk dinding lantai dasar; kolom praktis tiap sudut + tiap 3 m.' }));
  renderProposalSection(P);
}

// ======================= Proposal klien =======================
const COMPANY_KEY = 'sketchclone.company';
function companyOf() {
  try { return JSON.parse(localStorage.getItem(COMPANY_KEY) || '{}') || {}; } catch { return {}; }
}
function saveCompany(c) {
  try { localStorage.setItem(COMPANY_KEY, JSON.stringify(c)); } catch {}
}
const TERMIN_DEFAULT = '30; Uang muka saat penandatanganan kontrak\n30; Pekerjaan struktur selesai (progres ± 50%)\n30; Pekerjaan finishing (progres ± 90%)\n10; Serah terima setelah masa pemeliharaan 1 bulan';
const SYARAT_DEFAULT = 'Harga berlaku untuk lingkup pekerjaan sesuai gambar & spesifikasi pada proposal ini.\nPekerjaan tambah/kurang dihitung terpisah berdasarkan harga satuan pada RAB.\nIzin bangunan (PBG), listrik PLN & air PDAM disediakan oleh pemilik kecuali disepakati lain.\nMasa pemeliharaan 1 bulan setelah serah terima pertama.\nJadwal dapat bergeser karena cuaca ekstrem atau perubahan desain dari pemilik.';
function proposalOf() {
  model.rab ||= {};
  model.rab.proposal ||= {};
  const p = model.rab.proposal;
  return { client: '', clientAddr: '', pkg: 'standar', three: true, detail: false, valid: 30, termin: TERMIN_DEFAULT, syarat: SYARAT_DEFAULT, ...p };
}
function renderProposalSection(P) {
  const co = companyOf(), pp = proposalOf();
  const setC = (k) => (e) => { const c = companyOf(); c[k] = e.target.value; saveCompany(c); };
  const setP = (k, f = (v) => v) => (e) => { model.rab.proposal = { ...(model.rab.proposal || {}), [k]: f(e.target.type === 'checkbox' ? e.target.checked : e.target.value) }; changed(); };
  P.append(mkEl('div', { className: 'ttl', textContent: 'Proposal Klien' }));
  const det = mkEl('details', { className: 'cobox' }, mkEl('summary', { textContent: co.name ? `Perusahaan: ${co.name}` : 'Profil perusahaan (kop & tanda tangan)' }),
    trow('Nama', mkEl('input', { value: co.name || '', placeholder: 'CV / PT / nama kontraktor', onchange: setC('name') })),
    trow('Alamat', mkEl('input', { value: co.addr || '', onchange: setC('addr') })),
    trow('Telepon', mkEl('input', { value: co.phone || '', onchange: setC('phone') })),
    trow('Email/web', mkEl('input', { value: co.email || '', onchange: setC('email') })),
    trow('Penanda tangan', mkEl('input', { value: co.signer || '', onchange: setC('signer') })),
    trow('Jabatan', mkEl('input', { value: co.title || '', placeholder: 'Direktur', onchange: setC('title') })),
    trow('Rekening', mkEl('input', { value: co.bank || '', placeholder: 'Bank · no. rekening · a.n.', onchange: setC('bank') })),
    mkEl('div', { className: 'btnrow' },
      co.logo ? mkEl('img', { src: co.logo, className: 'cologo' }) : null,
      mkEl('button', { textContent: co.logo ? 'Ganti logo' : 'Pilih logo…', onclick: () => {
        const inp = mkEl('input', { type: 'file', accept: 'image/*' });
        inp.onchange = () => {
          const f = inp.files[0];
          if (!f) return;
          const rd = new FileReader();
          rd.onload = () => {
            // perkecil logo agar file tetap ringan
            const im = new Image();
            im.onload = () => {
              const k = Math.min(1, 360 / Math.max(im.width, im.height)), cv = document.createElement('canvas');
              cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
              cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
              const c = companyOf(); c.logo = cv.toDataURL('image/png'); saveCompany(c); renderKonsPane();
            };
            im.src = rd.result;
          };
          rd.readAsDataURL(f);
        };
        inp.click();
      } }),
      co.logo ? mkEl('button', { textContent: 'Hapus logo', onclick: () => { const c = companyOf(); delete c.logo; saveCompany(c); renderKonsPane(); } }) : null));
  P.append(det);
  P.append(trow('Nama klien', mkEl('input', { value: pp.client, placeholder: 'Bapak/Ibu ...', onchange: setP('client') })));
  P.append(trow('Alamat klien', mkEl('input', { value: pp.clientAddr, onchange: setP('clientAddr') })));
  P.append(trow('Paket ditawarkan', mkEl('select', { onchange: setP('pkg') }, ...Object.entries(C.PACKAGES).map(([k, v]) => mkEl('option', { value: k, textContent: v.label, selected: pp.pkg === k })))));
  P.append(mkEl('div', { className: 'btnrow' },
    mkEl('label', { className: 'small' }, mkEl('input', { type: 'checkbox', checked: pp.three, onchange: setP('three') }), ' Bandingkan 3 paket'),
    mkEl('label', { className: 'small' }, mkEl('input', { type: 'checkbox', checked: pp.detail, onchange: setP('detail') }), ' Rincian RAB lengkap')));
  P.append(trow('Berlaku (hari)', mkEl('input', { type: 'number', min: 1, value: pp.valid, onchange: setP('valid', (v) => Math.max(1, Math.round(+v) || 30)) })));
  P.append(mkEl('div', { className: 'msec', textContent: 'Termin pembayaran (persen; keterangan)' }));
  P.append(mkEl('textarea', { className: 'protext', rows: 4, value: pp.termin, onchange: setP('termin') }));
  P.append(mkEl('div', { className: 'msec', textContent: 'Syarat & ketentuan (satu per baris)' }));
  P.append(mkEl('textarea', { className: 'protext', rows: 4, value: pp.syarat, onchange: setP('syarat') }));
  const tot = Object.fromEntries(Object.keys(C.PACKAGES).map((k) => [k, C.rekap(model, C.rabRows(model, { pkg: k })).bulat]));
  if (tot.standar) P.append(mkEl('div', { className: 'small pkgsum' }, ...Object.entries(C.PACKAGES).map(([k, v]) => mkEl('span', { className: k === pp.pkg ? 'on' : '' }, `${v.label}: Rp ${(tot[k] / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`))));
  P.append(mkEl('div', { className: 'btnrow' }, mkEl('button', { className: 'primary', textContent: 'Buat Proposal (PDF)', onclick: () => exportProposal() })));
  P.append(mkEl('div', { className: 'muted small', textContent: 'Satu PDF berisi: sampul + gambar 3D (sudut pandang layar sekarang), surat penawaran, perbandingan paket, denah & tampak, RAB, jadwal & Kurva S, termin pembayaran, syarat, dan kolom tanda tangan.' }));
}
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
async function exportProposal(toFile = true) {
  const pp = proposalOf(), co = companyOf(), pj = rabProject();
  const pkg = C.PACKAGES[pp.pkg] ? pp.pkg : 'standar';
  const rows = C.rabRows(model, { pkg });
  if (!rows.length) return toast('Belum ada pekerjaan untuk ditawarkan. Gambar bangunan (dinding, ruang, kusen, atap) dulu.');
  const rk = C.rekap(model, rows);
  const rp = (v) => Math.round(v).toLocaleString('id-ID');
  const now = new Date();
  const date = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const validTo = new Date(now.getTime() + pp.valid * 864e5).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const no = `${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}/PNW/${ROMAN[now.getMonth()]}/${now.getFullYear()}`;
  const reno = C.renoActive(model);
  const area = Object.entries(model.groups).filter(([k, g]) => g.room && (!reno || C.phaseOf(model, +k) !== 'demo')).reduce((a, [, g]) => a + g.room.area, 0);
  const sc = C.schedule(rows, rabWeeks());
  // gambar 3D dari sudut pandang layar sekarang
  const savedSel = selection;
  selection = new Set();
  const hero = await exportPNG(1.5, 'url');
  selection = savedSel;
  const vis = makeVisible(model);
  const plans = planSheets(vis);
  const box = G.bboxOf(model, null, vis);
  const elev = Object.values(model.groups).some((g) => g.wall) ? elevSheets(vis, box) : [];
  refresh();
  const pkTotals = Object.fromEntries(Object.keys(C.PACKAGES).map((k) => [k, C.rekap(model, C.rabRows(model, { pkg: k }))]));
  const termin = String(pp.termin).split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const m2 = l.match(/^\s*([\d.,]+)\s*%?\s*[;:-]?\s*(.*)$/); return m2 ? { pct: parseFloat(m2[1].replace(',', '.')), label: m2[2] || '-' } : { pct: 0, label: l }; });
  const tPct = termin.reduce((a, t) => a + t.pct, 0);
  const syarat = String(pp.syarat).split(/\n/).map((l) => l.trim()).filter(Boolean);
  const head = (t) => `<div class="ph"><div class="phl">${co.logo ? `<img src="${co.logo}">` : ''}<div><b>${escHtml(co.name || 'Penawaran Pekerjaan')}</b><span>${escHtml([co.addr, co.phone, co.email].filter(Boolean).join(' · '))}</span></div></div><h2>${t}</h2></div>`;
  const specRows = Object.keys(C.PACKAGES.standar.spec).map((k) => `<tr><td>${k}</td>${Object.entries(C.PACKAGES).map(([pk, v]) => `<td class="${pk === pkg ? 'on' : ''}">${escHtml(v.spec[k])}</td>`).join('')}</tr>`).join('');
  const sumRows = rk.cats.map((c, i) => `<tr><td class="c">${i + 1}</td><td>${escHtml(c.cat)}</td><td class="n">${rp(c.total)}</td></tr>`).join('');
  let detail = '';
  if (pp.detail) {
    let cat = null, n = 1;
    for (const r of rows) {
      if (r.cat !== cat) { cat = r.cat; detail += `<tr class="cat"><td colspan="6">${escHtml(cat)}</td></tr>`; }
      detail += `<tr><td class="c">${n++}</td><td>${escHtml(r.name)}</td><td class="n">${r.vol.toLocaleString('id-ID')}</td><td class="c">${escHtml(r.unit)}</td><td class="n">${rp(r.price)}</td><td class="n">${rp(r.total)}</td></tr>`;
    }
  }
  const scope = reno ? (() => {
    const dm = rows.filter((r) => r.cat === 'Pekerjaan Bongkaran').map((r) => r.name.toLowerCase());
    return `<p>Lingkup: <b>renovasi</b> — bangunan lama dipertahankan; pekerjaan meliputi ${dm.length ? 'pembongkaran (' + escHtml(dm.slice(0, 4).join(', ')) + (dm.length > 4 ? ', dll.' : '') + ') dan ' : ''}pekerjaan baru sesuai gambar.</p>`;
  })() : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4 portrait; margin: 12mm 12mm 14mm; }
    body { font-family: "Segoe UI", Arial, sans-serif; font-size: 9.6pt; color: #1b2430; margin: 0; }
    .page { page-break-before: always; } h2 { font-size: 13pt; margin: 0; color: #1f4e8c; letter-spacing: .2mm; }
    .ph { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 0.7mm solid #1f4e8c; padding-bottom: 2mm; margin-bottom: 5mm; }
    .phl { display: flex; gap: 3mm; align-items: center; } .phl img { height: 12mm; } .phl b { display: block; font-size: 11pt; } .phl span { color: #556; font-size: 8pt; }
    table { width: 100%; border-collapse: collapse; } th, td { border: 0.2mm solid #b8c0ca; padding: 1.3mm 1.8mm; vertical-align: top; }
    th { background: #e8eef6; } .n { text-align: right; white-space: nowrap; } .c { text-align: center; } tr.cat td { background: #f3f6f9; font-weight: 700; }
    tr.tot td { font-weight: 700; border-top: 0.5mm solid #1b2430; } tr.big td { font-size: 11pt; background: #fff6d8; }
    .cover { height: 265mm; display: flex; flex-direction: column; }
    .cover .top { display: flex; justify-content: space-between; align-items: center; } .cover .top img { height: 20mm; }
    .cover .co b { font-size: 15pt; display: block; } .cover .co span { color: #556; font-size: 8.5pt; }
    .cover h1 { font-size: 26pt; margin: 14mm 0 2mm; color: #1f4e8c; letter-spacing: .5mm; } .cover .sub { font-size: 13pt; color: #333; }
    .cover .hero { margin: 8mm 0; flex: 1; border-radius: 3mm; background: #eef2f6 center / cover no-repeat; }
    .cover .meta { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3mm; } .cover .meta div { border-left: 1mm solid #1f4e8c; padding: 1mm 3mm; } .cover .meta span { display: block; color: #667; font-size: 8pt; } .cover .meta b { font-size: 10.5pt; }
    .letter p { line-height: 1.55; margin: 0 0 3mm; } .price { font-size: 16pt; font-weight: 800; color: #1f4e8c; margin: 2mm 0 1mm; } .tb { font-style: italic; color: #445; }
    .pk td.on, .pk th.on { background: #fff4cf; } .pk th.on { border-top: 1mm solid #e0a400; } .pk .tt td { font-weight: 800; font-size: 10.5pt; }
    .sheet { position: relative; width: 186mm; height: 117.4mm; border: 0.3mm solid #889; margin: 0 0 4mm; overflow: hidden; }
    .sheet .plan, .sheet .cell { position: absolute; inset: 0; } .sheet img, .sheet svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    .sheet .cap { position: absolute; left: 2mm; bottom: 1.5mm; font-size: 2.8mm; font-weight: 700; background: #fffc; padding: 0 1mm; }
    .elev { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 2mm; width: 186mm; height: 117.4mm; page-break-inside: avoid; } .elev .cell { position: relative; border: 0.25mm solid #aab; overflow: hidden; }
    .elev .cell img, .elev .cell svg { position: absolute; inset: 0; width: 100%; height: 100%; } .elev .cell .cap { position: absolute; left: 1.5mm; bottom: 1mm; font-size: 2.3mm; font-weight: 700; } .sheet { page-break-inside: avoid; }
    .plan .cut { stroke: #111; stroke-width: 5; stroke-linecap: square; } .plan .col { fill: #111; }
    .plan .otag rect { fill: #fff; stroke: #7a3e9d; stroke-width: 2; } .plan .otag text { fill: #7a3e9d; font-size: 15px; font-weight: 700; }
    .plan .secl line { stroke: #2b6cb0; stroke-width: 2; stroke-dasharray: 22 6 4 6; } .plan .secl circle { fill: #fff; stroke: #2b6cb0; stroke-width: 2.5; } .plan .secl text { fill: #2b6cb0; font-size: 18px; font-weight: 700; }
    .ktab { position: absolute; right: 1mm; top: 1mm; background: #fff; font-size: 1.9mm; border: 0.2mm solid #555; padding: 1mm 1.4mm; } .ktab table { border-collapse: collapse; margin-top: .6mm; } .ktab td, .ktab th { border: 0.15mm solid #999; padding: .3mm 1mm; text-align: center; background: #fff; }
    .plan .mep circle { fill: #fff; stroke: #1f5fa8; stroke-width: 2; } .plan .mep path { stroke: #1f5fa8; stroke-width: 2; } .plan .mep text { fill: #1f5fa8; font-size: 12px; font-weight: 700; }
    .plan .leaf { stroke: #111; stroke-width: 3; } .plan .swing { stroke: #555; stroke-width: 1.5; fill: none; stroke-dasharray: 8 5; }
    .plan .rn { font-size: 22px; font-weight: 700; fill: #1d2b3a; } .plan .ra { font-size: 19px; fill: #44515f; }
    .plan .dim line, .dim line { stroke: #c0392b; stroke-width: 2; } .plan .dim text { fill: #c0392b; font-size: 22px; font-weight: 600; }
    .lvl line { stroke: #2b6cb0; stroke-width: 1.5; stroke-dasharray: 10 6; } .lvl path { fill: #2b6cb0; } .lvl text { fill: #2b6cb0; font-size: 20px; font-weight: 700; } .lvl text.nm { font-size: 15px; font-weight: 400; }
    ${PLAN_EXTRA_CSS} .rleg { font-size: 2.2mm; padding: 1mm 1.6mm; }
    .sign { display: flex; justify-content: space-between; margin-top: 12mm; } .sign div { width: 70mm; text-align: center; } .sign .ln { margin-top: 24mm; border-top: 0.3mm solid #111; padding-top: 1mm; font-weight: 700; }
    ol { margin: 0; padding-left: 5mm; } ol li { margin: 0 0 1.6mm; line-height: 1.45; } .note { color: #556; font-size: 8.4pt; margin-top: 3mm; }
  </style></head><body>
  <div class="cover">
    <div class="top">${co.logo ? `<img src="${co.logo}">` : '<span></span>'}<div class="co" style="text-align:right"><b>${escHtml(co.name || '')}</b><span>${escHtml([co.addr, co.phone, co.email].filter(Boolean).join(' · '))}</span></div></div>
    <h1>PROPOSAL PENAWARAN</h1><div class="sub">${escHtml(pj.name)}${pj.location !== '-' ? ' — ' + escHtml(pj.location) : ''}</div>
    <div class="hero" style="background-image:url('${hero}')"></div>
    <div class="meta"><div><span>Disiapkan untuk</span><b>${escHtml(pp.client || '-')}</b></div><div><span>Nomor</span><b>${no}</b></div><div><span>Tanggal</span><b>${date}</b></div></div>
  </div>
  <div class="page letter">${head('SURAT PENAWARAN')}
    <p>Nomor: ${no}<br>Perihal: Penawaran harga pekerjaan ${escHtml(pj.name)}<br>Lampiran: gambar, RAB & jadwal</p>
    <p>Kepada Yth.<br><b>${escHtml(pp.client || 'Bapak/Ibu Pemilik')}</b>${pp.clientAddr ? '<br>' + escHtml(pp.clientAddr) : ''}<br>di tempat</p>
    <p>Dengan hormat,</p>
    <p>Bersama surat ini kami mengajukan penawaran harga untuk pekerjaan <b>${escHtml(pj.name)}</b>${pj.location !== '-' ? ' di ' + escHtml(pj.location) : ''}${area ? ` dengan luas lantai ± ${area.toLocaleString('id-ID', { maximumFractionDigits: 1 })} m²` : ''}, paket <b>${C.PACKAGES[pkg].label}</b>, sebesar:</p>
    ${scope}
    <div class="price">Rp ${rp(rk.bulat)}</div><div class="tb">(${escHtml(rk.terbilang)})</div>
    <p style="margin-top:4mm">Harga sudah termasuk bahan, upah, alat${rk.jasaPct ? `, jasa pelaksana ${rk.jasaPct}%` : ''}${rk.ppnPct ? ` dan PPN ${rk.ppnPct}%` : ''}. Waktu pelaksanaan <b>${sc.weeks} minggu</b> kalender sejak uang muka diterima. Penawaran ini berlaku sampai <b>${validTo}</b> (${pp.valid} hari).</p>
    <p>Rincian gambar, spesifikasi, anggaran, jadwal, dan cara pembayaran kami lampirkan pada halaman berikut. Besar harapan kami dapat bekerja sama dengan Bapak/Ibu.</p>
    <div class="sign"><div></div><div>Hormat kami,<br>${escHtml(co.name || '')}<div class="ln">${escHtml(co.signer || '(..............................)')}</div>${escHtml(co.title || '')}</div></div>
  </div>
  ${pp.three ? `<div class="page">${head('PILIHAN PAKET')}
    <table class="pk"><tr><th>Uraian</th>${Object.entries(C.PACKAGES).map(([k, v]) => `<th class="${k === pkg ? 'on' : ''}">${v.label}${k === pkg ? ' ★' : ''}</th>`).join('')}</tr>${specRows}
    <tr class="tt"><td>Harga total</td>${Object.keys(C.PACKAGES).map((k) => `<td class="n ${k === pkg ? 'on' : ''}">Rp ${rp(pkTotals[k].bulat)}</td>`).join('')}</tr>
    ${area ? `<tr><td>Per m² lantai</td>${Object.keys(C.PACKAGES).map((k) => `<td class="n ${k === pkg ? 'on' : ''}">Rp ${rp(pkTotals[k].bulat / area)}</td>`).join('')}</tr>` : ''}</table>
    <div class="note">Struktur, dinding, dan instalasi sama untuk semua paket; perbedaan ada pada bahan finishing. ★ = paket yang kami sarankan pada surat penawaran.</div></div>` : ''}
  ${plans.length || elev.length ? `<div class="page">${head('GAMBAR')}
    ${plans.map((pl) => `<div class="sheet"><div class="plan">${pl.body}</div><div class="cap">${escHtml(pl.title)} · luas ${escHtml(pl.area)}</div></div>`).join('')}
    ${elev.map((e) => `<div class="elev">${e.grid}</div>`).join('')}</div>` : ''}
  <div class="page">${head('RENCANA ANGGARAN BIAYA — PAKET ' + C.PACKAGES[pkg].label.toUpperCase())}
    <table><tr><th>No</th><th>Uraian Pekerjaan</th><th>Jumlah (Rp)</th></tr>${sumRows}
    <tr class="tot"><td colspan="2">Jumlah biaya pekerjaan</td><td class="n">${rp(rk.sub)}</td></tr>
    ${rk.jasaPct ? `<tr><td colspan="2">Jasa pelaksana ${rk.jasaPct}%</td><td class="n">${rp(rk.jasa)}</td></tr>` : ''}
    ${rk.ppnPct ? `<tr><td colspan="2">PPN ${rk.ppnPct}%</td><td class="n">${rp(rk.ppn)}</td></tr>` : ''}
    <tr class="tot big"><td colspan="2">TOTAL PENAWARAN (dibulatkan)</td><td class="n">Rp ${rp(rk.bulat)}</td></tr></table>
    <div class="tb" style="margin-top:2mm">Terbilang: ${escHtml(rk.terbilang)}</div>
    ${detail ? `<h3 style="margin:6mm 0 2mm">Rincian</h3><table><tr><th>No</th><th>Jenis pekerjaan</th><th>Volume</th><th>Sat.</th><th>Harga satuan</th><th>Jumlah</th></tr>${detail}</table>` : ''}</div>
  <div class="page">${head('JADWAL & PEMBAYARAN')}
    <div style="margin-bottom:2mm"><b>Jadwal pelaksanaan ${sc.weeks} minggu</b> — batang = bobot mingguan, garis merah = kumulatif (Kurva S)</div>
    ${kurvaSvg(sc, 720, 280, true)}
    <table style="margin:3mm 0 6mm"><tr><th>No</th><th>Pekerjaan</th><th>Bobot</th><th>Minggu</th></tr>${sc.cats.map((c, i) => `<tr><td class="c">${i + 1}</td><td>${escHtml(c.cat)}</td><td class="n">${c.weight.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%</td><td class="c">${c.w0 + 1} – ${c.w1}</td></tr>`).join('')}</table>
    <b>Termin pembayaran</b>
    <table style="margin-top:2mm"><tr><th>Termin</th><th>Keterangan</th><th>%</th><th>Jumlah (Rp)</th></tr>${termin.map((t, i) => `<tr><td class="c">${i + 1}</td><td>${escHtml(t.label)}</td><td class="n">${t.pct.toLocaleString('id-ID')}%</td><td class="n">${rp((rk.bulat * t.pct) / 100)}</td></tr>`).join('')}
    <tr class="tot"><td colspan="2">Total</td><td class="n">${tPct.toLocaleString('id-ID')}%</td><td class="n">${rp((rk.bulat * tPct) / 100)}</td></tr></table>
    ${co.bank ? `<div class="note">Pembayaran ke: <b>${escHtml(co.bank)}</b></div>` : ''}${Math.abs(tPct - 100) > 0.01 ? `<div class="note" style="color:#c0392b">Catatan: jumlah persen termin ${tPct}% (bukan 100%).</div>` : ''}</div>
  <div class="page">${head('SYARAT & PERSETUJUAN')}
    <ol>${syarat.map((t) => `<li>${escHtml(t)}</li>`).join('')}</ol>
    <p style="margin-top:6mm">Dengan menandatangani di bawah ini, kedua pihak menyetujui penawaran paket <b>${C.PACKAGES[pkg].label}</b> senilai <b>Rp ${rp(rk.bulat)}</b> beserta seluruh lampirannya.</p>
    <div class="sign"><div>Menyetujui,<br>Pemilik<div class="ln">${escHtml(pp.client || '(..............................)')}</div></div><div>${escHtml(pj.location !== '-' ? pj.location + ', ' : '')}${date}<br>${escHtml(co.name || 'Pelaksana')}<div class="ln">${escHtml(co.signer || '(..............................)')}</div>${escHtml(co.title || '')}</div></div>
    <div class="note">Dibuat dengan SketchClone · ${no}</div></div>
  </body></html>`;
  if (!toFile) return { html, rk, pkTotals, termin };
  const out = await window.api.savePdf(html, `${pj.name} - Proposal Penawaran.pdf`, { pageSize: 'A4', landscape: false, margins: true });
  out && toast('Proposal PDF disimpan · paket ' + C.PACKAGES[pkg].label + ' Rp ' + rp(rk.bulat));
  return { rk, pkTotals };
}

// ---- Daftar bahan (Excel .xlsx) ----
function solidVolume(faces) {
  let v = 0;
  for (const f of faces) {
    const t = trisOf(f);
    for (let i = 0; i < t.length; i += 3) {
      const a = V3(t[i]), b = V3(t[i + 1]), c = V3(t[i + 2]);
      v += a.dot(b.clone().cross(c)) / 6;
    }
  }
  return Math.abs(v);
}
function bomData() {
  const vis = makeVisible(model);
  const faces = model.faces.filter(vis);
  const U = UNITS[unitOf().u] || UNITS.m;
  const L = (x) => +(x * U.k).toFixed(3), A2 = (x) => +(x * U.k * U.k).toFixed(3), V3u = (x) => +(x * U.k * U.k * U.k).toFixed(4);
  const u = unitOf().u;
  // komponen & grup
  const byDef = new Map();
  for (const [k, g] of Object.entries(model.groups)) {
    const key = g.def ? 'K:' + g.def : 'G:' + k;
    if (!byDef.has(key)) byDef.set(key, { name: g.name, type: g.def ? 'Komponen' : 'Grup', n: 0, tag: model.tags.find((t) => t.id === g.tag)?.name || '' });
    byDef.get(key).n++;
  }
  const comps = [['Nama', 'Jenis', 'Jumlah', 'Tag'], ...[...byDef.values()].sort((a, b) => a.name.localeCompare(b.name, 'id')).map((r) => [r.name, r.type, r.n, r.tag])];
  // material
  const byMat = new Map();
  for (const f of faces) {
    const name = f.tex ? textures.get(f.tex)?.name || f.tex : 'Warna ' + f.color;
    byMat.set(name, (byMat.get(name) || 0) + G.faceArea(f));
  }
  const mats = [['Material', `Luas (${u}²)`], ...[...byMat.entries()].sort((a, b) => b[1] - a[1]).map(([n, a]) => [n, A2(a)])];
  // benda solid
  const bySolid = new Map();
  for (const f of faces) {
    if (f.solid == null) continue;
    if (!bySolid.has(f.solid)) bySolid.set(f.solid, []);
    bySolid.get(f.solid).push(f);
  }
  let vt = 0;
  const solids = [['Benda', 'Grup/Komponen', 'Material utama', `Luas permukaan (${u}²)`, `Volume (${u}³)`, `P × L × T (${u})`]];
  let i = 1;
  for (const [sid, fs] of bySolid) {
    const vol = solidVolume(fs);
    vt += vol;
    const area = fs.reduce((s2, f) => s2 + G.faceArea(f), 0);
    const mat = new Map();
    fs.forEach((f) => { const nm = f.tex ? textures.get(f.tex)?.name || f.tex : 'Warna ' + f.color; mat.set(nm, (mat.get(nm) || 0) + G.faceArea(f)); });
    const top = [...mat.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const gname = gOf(fs[0]) != null ? model.groups[gOf(fs[0])]?.name || '' : '';
    const b = new THREE.Box3();
    fs.forEach((f) => f.pts.forEach((p) => b.expandByPoint(V3(p))));
    const sz = b.getSize(new THREE.Vector3());
    solids.push([`Benda ${i++}`, gname, top, A2(area), V3u(vol), `${L(sz.x)} × ${L(sz.y)} × ${L(sz.z)}`]);
  }
  const bb = G.bboxOf(model, null, vis).getSize(new THREE.Vector3());
  const summary = [
    ['Ringkasan', ''],
    ['Proyek', filePath ? filePath.split(/[\\/]/).pop() : 'Tanpa Judul'],
    ['Tanggal', new Date().toLocaleDateString('id-ID')],
    ['Satuan', u],
    ['Jumlah bidang', faces.length],
    ['Jumlah benda solid', bySolid.size],
    ['Jumlah grup/komponen', Object.keys(model.groups).length],
    [`Luas total permukaan (${u}²)`, A2(faces.reduce((s2, f) => s2 + G.faceArea(f), 0))],
    [`Volume total benda (${u}³)`, V3u(vt)],
    [`Ukuran keseluruhan P × L × T (${u})`, `${L(bb.x)} × ${L(bb.y)} × ${L(bb.z)}`],
  ];
  return { summary, comps, mats, solids };
}
function xlsx(sheets) {
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const col = (i) => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + (i % 26));
  const sheetXml = (rows, bold = new Set([0]), widths = null) => {
    const nc = Math.max(...rows.map((r) => r.length));
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${[...Array(nc)].map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="${widths ? widths[i] || 14 : i === 0 ? 34 : 22}" customWidth="1"/>`).join('')}</cols><sheetData>${rows
      .map((r, ri) => {
        const st = bold.has(ri) ? ' s="1"' : '';
        return `<row r="${ri + 1}">${r.map((v, ci) => (typeof v === 'number' ? `<c r="${col(ci)}${ri + 1}"${st}><v>${v}</v></c>` : `<c r="${col(ci)}${ri + 1}" t="inlineStr"${st}><is><t>${esc(v)}</t></is></c>`)).join('')}</row>`;
      })
      .join('')}</sheetData></worksheet>`;
  };
  const files = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s2, i) => `<sheet name="${esc(s2.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
  };
  sheets.forEach((s2, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s2.rows, s2.bold, s2.widths))));
  return zipSync(files);
}
async function exportBom(toFile = true) {
  const d = bomData();
  const bytes = xlsx([
    { name: 'Ringkasan', rows: d.summary },
    { name: 'Komponen', rows: d.comps },
    { name: 'Material', rows: d.mats },
    { name: 'Benda', rows: d.solids },
  ]);
  if (!toFile) return { bytes: bytes.length, d };
  const base = filePath ? filePath.split(/[\\/]/).pop().replace(/\.skc$/, '') : 'model';
  const out = await window.api.exportBinary('xlsx', bytes, base + ' - daftar bahan.xlsx');
  out && toast('Daftar bahan (Excel) disimpan');
}

// ---- Ekspor DXF (AutoCAD) ----
function exportDXF() {
  const vis = makeVisible(model);
  const out = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '6', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  const layerOf = (e) => (e.tag != null ? model.tags.find((t) => t.id === e.tag)?.name : null) || (gOf(e) != null ? model.groups[gOf(e)]?.name : null) || '0';
  const clean = (s2) => String(s2).replace(/[<>/\\":;?*|=,]/g, '_').slice(0, 60) || '0';
  const n = (x) => (+x.toFixed(6)).toString();
  const seen = new Set();
  for (const f of model.faces) {
    if (!vis(f)) continue;
    const ly = clean(layerOf(f));
    const t = trisOf(f);
    for (let i = 0; i < t.length; i += 3) {
      const [a, b, c] = [t[i], t[i + 1], t[i + 2]];
      out.push('0', '3DFACE', '8', ly, '10', n(a[0]), '20', n(a[1]), '30', n(a[2]), '11', n(b[0]), '21', n(b[1]), '31', n(b[2]), '12', n(c[0]), '22', n(c[1]), '32', n(c[2]), '13', n(c[0]), '23', n(c[1]), '33', n(c[2]), '70', '15');
    }
    for (const loop of [f.pts, ...f.holes]) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length];
        const k = [G.key(a), G.key(b)].sort().join('|');
        if (seen.has(k)) continue;
        seen.add(k);
        out.push('0', 'LINE', '8', ly, '10', n(a[0]), '20', n(a[1]), '30', n(a[2]), '11', n(b[0]), '21', n(b[1]), '31', n(b[2]));
      }
    }
  }
  for (const l of model.lines) if (vis(l)) out.push('0', 'LINE', '8', clean(layerOf(l)), '10', n(l.a[0]), '20', n(l.a[1]), '30', n(l.a[2]), '11', n(l.b[0]), '21', n(l.b[1]), '31', n(l.b[2]));
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\r\n') + '\r\n';
}

// ======================= Asisten AI (Claude) =======================
let aiImage = null; // { data (base64), media_type, name }
function aiContext() {
  const vis = makeVisible(model);
  const box = G.bboxOf(model, null, vis);
  const sel = selection.size ? G.bboxOf(model, expand(selection)) : null;
  const f = (b) => (b && !b.isEmpty() ? `min (${b.min.toArray().map((x) => x.toFixed(2))}) max (${b.max.toArray().map((x) => x.toFixed(2))})` : 'kosong');
  return `Model saat ini: ${model.faces.length} bidang, ${Object.keys(model.groups).length} grup/komponen. Kotak pembatas seluruh model: ${f(box)}. ${sel ? 'Kotak pembatas pilihan: ' + f(sel) + '.' : 'Tidak ada pilihan.'} Satuan tampilan: ${unitOf().u} (kode selalu dalam meter).`;
}
function openAi() {
  $('aiDlg').hidden = false;
  window.api.aiHasKey().then((h) => ($('aiKeyRow').hidden = h));
  $('aiPrompt').focus();
}
async function runAi() {
  const prompt = $('aiPrompt').value.trim();
  if (!prompt && !aiImage) return toast('Tulis permintaan atau lampirkan gambar');
  $('aiGo').disabled = true;
  $('aiStatus').textContent = 'Mengirim ke Claude…';
  try {
    const r = await window.api.aiGenerate({ prompt, image: aiImage, context: aiContext() });
    if (r.error) {
      $('aiStatus').textContent = r.error;
      if (r.needKey) $('aiKeyRow').hidden = false;
      return;
    }
    $('conIn').value = r.code;
    conOut('— Asisten AI —');
    if (r.note) conOut(r.note);
    const before = model.faces.length;
    runScript(r.code, 'Asisten AI');
    const added = model.faces.length - before;
    $('aiStatus').textContent = `Selesai: ${added} bidang dibuat. Kode ada di Konsol Skrip (Ctrl+Shift+K) — bisa diubah & dijalankan ulang. Ctrl+Z untuk membatalkan.`;
    zoomExtents();
  } catch (e) {
    $('aiStatus').textContent = 'Gagal: ' + e.message;
  } finally {
    $('aiGo').disabled = false;
  }
}
window.api.onAiProgress((n) => ($('aiStatus').textContent = `Claude sedang menulis model… (${n} karakter)`));
$('aiGo').onclick = runAi;
$('aiClose').onclick = () => ($('aiDlg').hidden = true);
$('aiImgBtn').onclick = () => $('aiFile').click();
$('aiFile').onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    const img = new Image();
    img.onload = () => {
      // perkecil agar hemat token (sisi terpanjang 1200 px)
      const k = Math.min(1, 1200 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.9);
      aiImage = { data: url.split(',')[1], media_type: 'image/jpeg', name: file.name };
      $('aiImgName').textContent = '📎 ' + file.name;
      $('aiThumb').src = url;
      $('aiThumb').hidden = false;
    };
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
};
$('aiKeySave').onclick = async () => {
  const k = $('aiKey').value.trim();
  if (!k) return;
  await window.api.aiSetKey(k);
  $('aiKey').value = '';
  $('aiKeyRow').hidden = true;
  toast('Kunci API disimpan (terenkripsi)');
};
for (const id of ['aiPrompt', 'aiKey']) $(id).addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter' && e.ctrlKey && id === 'aiPrompt') runAi();
});

// ======================= Berbagi: web interaktif & AR =======================
function viewerHtml(title, src) {
  const t = escHtml(title);
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t}</title>
<script type="module" src="https://unpkg.com/@google/model-viewer@4.0.0/dist/model-viewer.min.js"></script>
<style>html,body{margin:0;height:100%;font-family:"Segoe UI",system-ui,sans-serif;background:linear-gradient(#dfe9f5,#f6f7f9)}
model-viewer{width:100%;height:100%;--poster-color:transparent}
.bar{position:fixed;left:0;right:0;top:0;padding:12px 16px;background:rgba(255,255,255,.85);backdrop-filter:blur(6px);display:flex;justify-content:space-between;align-items:center;font-size:15px}
.bar b{font-size:16px}.hint{color:#667;font-size:13px}
#ar{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);padding:12px 22px;border:none;border-radius:24px;background:#2f6fe4;color:#fff;font-size:16px;box-shadow:0 6px 20px rgba(0,0,0,.2)}</style></head>
<body><div class="bar"><b>${t}</b><span class="hint">Seret: putar · Cubit/gulir: zoom · Dua jari: geser</span></div>
<model-viewer src="${src}" camera-controls touch-action="pan-y" auto-rotate shadow-intensity="1" exposure="1.05" environment-image="neutral"
  ar ar-modes="webxr scene-viewer quick-look" ar-placement="floor" alt="${t}">
  <button slot="ar-button" id="ar">📱 Lihat di ruangan (AR)</button>
</model-viewer></body></html>`;
}
async function exportWebViewer(toFile = true) {
  const glb = await exportGLB('raw');
  const bytes = new Uint8Array(glb);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const name = filePath ? filePath.split(/[\\/]/).pop().replace(/\.skc$/, '') : 'Model SketchClone';
  const html = viewerHtml(name, 'data:model/gltf-binary;base64,' + btoa(bin));
  if (!toFile) return html.length;
  const out = await window.api.exportFile('html', html, name + ' - 3D.html');
  out && toast('Halaman web interaktif disimpan. Buka di browser; unggah ke hosting (mis. Netlify) untuk AR di HP.');
}
async function shareToPhone() {
  const glb = await exportGLB('raw');
  const name = filePath ? filePath.split(/[\\/]/).pop().replace(/\.skc$/, '') : 'Model SketchClone';
  const r = await window.api.shareStart(viewerHtml(name, 'model.glb'), new Uint8Array(glb));
  if (!r || !r.url) return toast('Tidak bisa memulai server berbagi: ' + ((r && r.error) || ''));
  $('shareUrl').textContent = r.url;
  $('shareQr').src = await QRCode.toDataURL(r.url, { width: 260, margin: 1 });
  $('shareDlg').hidden = false;
  return r.url;
}

const handleMenu = async (cmd, arg) => {
  switch (cmd) {
    case 'new':
      if (await confirmDiscard()) $('tplDlg').hidden = false;
      break;
    case 'versions': await openVersions(); break;
    case 'keys': openKeys(); break;
    case 'open': await openProject(); break;
    case 'openRecent': await openProject(arg); break;
    case 'exportPng': await exportPNG(); break;
    case 'exportPdf': await exportDrawing(); break;
    case 'exportWeb': await exportWebViewer(); break;
    case 'updateInfo': toast(arg); break;
    case 'sharePhone': await shareToPhone(); break;
    case 'exportBom': await exportBom(); break;
    case 'exportRab': await exportRab(); break;
    case 'exportRabPdf': await exportRabPdf(); break;
    case 'proposal': showTray('kons'); await exportProposal(); break;
    case 'structCheck': runStructCheck(); break;
    case 'kons': showTray('kons'); break;
    case 'exportDxf': {
      const base = filePath ? filePath.split(/[\\/]/).pop().replace(/\.skc$/, '') : 'model';
      const p2 = await window.api.exportFile('dxf', exportDXF(), base + '.dxf');
      p2 && toast('Ekspor DXF selesai');
      break;
    }
    case 'save': await saveProject(false); break;
    case 'saveAs': await saveProject(true); break;
    case 'exportObj': {
      const base = (filePath ? filePath.split(/[\\/]/).pop().replace(/\.skc$/, '') : 'model');
      const p = await window.api.exportFile('obj', G.exportOBJ(model), base + '.obj');
      p && toast('Ekspor OBJ selesai');
      break;
    }
    case 'exportDae': {
      const base = (filePath ? filePath.split(/[\\/]/).pop().replace(/\.skc$/, '') : 'model');
      const p = await window.api.exportFile('dae', exportDAE(), base + '.dae');
      p && toast('Ekspor Collada selesai — buka di SketchUp lewat File → Import');
      break;
    }
    case 'exportStl': {
      const base = (filePath ? filePath.split(/[\\/]/).pop().replace(/\.skc$/, '') : 'model');
      const p = await window.api.exportFile('stl', G.exportSTL(model), base + '.stl');
      p && toast('Ekspor STL selesai');
      break;
    }
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'selectAll':
      selection = new Set([...model.faces.map((f) => f.id), ...model.lines.map((l) => l.id)]);
      refresh();
      updateInfo();
      break;
    case 'delete':
      if (selection.size) {
        G.deleteIds(model, selection);
        selection = new Set();
        changed();
      }
      break;
    case 'group': groupCmd(false); break;
    case 'component': groupCmd(true); break;
    case 'explode': explodeCmd(); break;
    case 'duplicate': duplicateCmd(); break;
    case 'clearGuides':
      model.guides = [];
      changed();
      break;
    case 'tray': toggleTray(); break;
    case 'import': await importMesh(); break;
    case 'exportGlb': await exportGLB(); break;
    case 'fov': persp.fov = arg; updateCamera(); toast(`Bidang pandang ${arg}°`); break;
    case 'hide': hideSelection(); break;
    case 'unhideAll': unhideAll(); break;
    case 'addScene': addScene(); break;
    case 'playScenes': playScenes(); break;
    case 'union': solidOp('union'); break;
    case 'subtract': solidOp('subtract'); break;
    case 'intersect': solidOp('intersect'); break;
    case 'sectionToggle':
      if (!model.section) return toast('Belum ada bidang potong (alat Bidang Potong, tombol N)');
      model.section.on = !model.section.on;
      changed();
      break;
    case 'sectionClear':
      model.section = null;
      changed();
      break;
    case 'ai': openAi(); break;
    case 'console':
      $('console').hidden = !$('console').hidden;
      if (!$('console').hidden) $('conIn').focus();
      break;
    case 'plugin': {
      const c = pluginCommands[arg];
      if (c) runGuarded(c.fn, c.name);
      break;
    }
    case 'reloadPlugins': await loadPlugins(); toast('Plugin dimuat ulang'); break;
    case 'edges': setStyle({ edges: arg }); break;
    case 'xray': setStyle({ face: arg ? 'xray' : 'shaded' }); break;
    case 'grid': gridWanted = arg; applyBackground(styleOf(model)); requestRender(); break;
    case 'axes': axesGroup.visible = arg; requestRender(); break;
    case 'ortho': setOrtho(arg); break;
    case 'view': setStdView(arg); break;
    case 'zoomExtents': zoomExtents(); break;
    case 'zoomSelection': zoomSelection(); break;
    case 'reverse': reverseSel(); break;
    case 'fillet': filletSel('round'); break;
    case 'chamfer': filletSel('chamfer'); break;
    case 'intersect2': intersectSel(); break;
    case 'roof': roofSel(); break;
    case 'roundAll': roundAllSel(); break;
    case 'subdivide': subdivideSel(); break;
    case 'mirror': mirrorSel(arg); break;
    case 'mirrorLinked': mirrorLinked(arg); break;
    case 'deform': openDeform(); break;
    case 'tessellate': tessellateSel(); break;
    case 'refImage': $('refFile').click(); break;
    case 'help': $('help').innerHTML = HELP; $('help').hidden = !$('help').hidden; break;
  }
};
window.api.onMenu(handleMenu);

document.querySelectorAll('#viewbtns button').forEach((b) => {
  b.onclick = () => {
    const v = b.dataset.view;
    if (v === 'fit') zoomExtents();
    else if (v === 'ortho') setOrtho(!view.ortho);
    else if (v === 'tray') toggleTray();
    else setStdView(v);
  };
});

// Matahari & bayangan
const hourLabel = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
$('shadowOn').onchange = (e) => {
  setShadows(e.target.checked);
  e.target.blur();
};
$('hour').oninput = (e) => {
  const h = +e.target.value;
  $('hourLbl').textContent = hourLabel(h);
  setShadows(sunState.shadows, h);
};
$('hour').onchange = (e) => e.target.blur();

$('dfKind').onchange = () => {
  const k = $('dfKind').value;
  $('dfAmount').value = k === 'taper' ? '0.5' : k === 'twist' ? '90' : '45';
  updateDeformUi();
  previewDeform();
};
for (const id of ['dfAxis', 'dfAmount', 'dfDir', 'dfSlices']) $(id).addEventListener('input', previewDeform);
$('dfOk').onclick = applyDeform;
$('dfCancel').onclick = closeDeform;
$('deform').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') applyDeform();
  if (e.key === 'Escape') closeDeform();
});
$('refFile').onchange = (e) => {
  const f = e.target.files[0];
  if (f) importReference(f);
  e.target.value = '';
};
// template awal
const TEMPLATES = {
  arsitektur: { units: { u: 'm', prec: 2 }, style: { bg: 'sky', edges: true, smooth: 20 } },
  interior: { units: { u: 'cm', prec: 0 }, style: { bg: 'studio', edges: true, smooth: 20, ao: true } },
  mebel: { units: { u: 'mm', prec: 0 }, style: { bg: 'studio', edges: true, smooth: 25 } },
  lanskap: { units: { u: 'm', prec: 1 }, style: { bg: 'realsky', edges: false, smooth: 30 } },
  karakter: { units: { u: 'cm', prec: 1 }, style: { bg: 'studio', edges: false, smooth: 30, ao: true } },
};
// ======================= Template rumah siap pakai =======================
// Denah dibagi zona sepanjang Y (depan -> belakang); tiap zona dibelah sekat x = W/2 menjadi kiri & kanan.
const HOUSES = {
  t36: { label: 'Rumah Tipe 36', W: 6, zones: [3, 3], left: ['Ruang Tamu', 'Dapur'], right: ['Kamar Tidur 1', 'Kamar Tidur 2'], km: true },
  t45: { label: 'Rumah Tipe 45', W: 6, zones: [3, 3, 1.5], left: ['Ruang Tamu', 'Ruang Keluarga', 'Dapur'], right: ['Kamar Tidur 1', 'Kamar Tidur 2', 'Kamar Mandi'], kmRight: true },
  t54: { label: 'Rumah Tipe 54', W: 6, zones: [3, 3, 3], left: ['Ruang Tamu', 'Ruang Keluarga', 'Dapur'], right: ['Kamar Tidur 1', 'Kamar Tidur 2', 'Kamar Tidur 3'], km: true },
  lt2: {
    label: 'Rumah 2 Lantai', W: 6, zones: [3, 3.5, 1.5], left: ['Ruang Tamu', 'Ruang Keluarga', 'Dapur'], right: ['Kamar Tidur 1', 'Ruang Makan', 'Kamar Mandi'], kmRight: true,
    stair: { x: 0.65, y: 3.2, shape: 'U' },
    up: { zones: [3, 5], left: ['Ruang Kerja', 'Ruang Santai'], right: ['Kamar Tidur 2', 'Kamar Tidur 3'] },
  },
};
function buildHouse(key) {
  const S = HOUSES[key];
  newFromTemplate('arsitektur');
  const sk = sketch, H = 2.8, t = 0.15, W = S.W, D = S.zones.reduce((a, b) => a + b, 0), xm = W / 2, e = t / 2;
  model.rab = { project: { name: S.label } };
  C.levelsOf(model)[0].h = H;
  const face = (x, y, z) => sk.wallFaceAt(x, y, z + 1);
  const door = (x, y, z, w = 0.8, h = 2.1) => { const f = face(x, y, z); if (f) try { sk.door(f.id, f.point, w, h); } catch {} };
  const win = (x, y, z, w = 1.2, h = 1.2, sill = 0.9) => { const f = face(x, y, z); if (f) try { sk.window(f.id, f.point, w, h, sill); } catch {} };
  const mep = (k, x, y, z, n) => { try { sk.mep(k, x, y, z, n); } catch {} };
  const floorPlan = (zones, left, right, z, opt = {}) => {
    sk.wall([[0, 0, z], [W, 0, z], [W, D, z], [0, D, z]], t, H, true);
    sk.wall([[xm, e, z], [xm, D - e, z]], t, H, false);
    const ys = [0];
    zones.forEach((d) => ys.push(ys[ys.length - 1] + d));
    for (let i = 1; i < zones.length; i++) sk.wall([[e, ys[i], z], [W - e, ys[i], z]], t, H, false);
    const kmCorner = opt.km;
    const yk = D - 1.5;
    if (kmCorner) {
      sk.wall([[1.5, yk, z], [1.5, D - e, z]], t, H, false);
      sk.wall([[e, yk, z], [1.5, yk, z]], t, H, false);
    }
    // pintu & jendela
    if (opt.ground) door(0.9, 0, z, 0.9, 2.1);
    if (!opt.ground) win(1.5, 0, z);
    win(opt.ground ? 2.25 : 1.5, 0, z, opt.ground ? 0.9 : 1.2);
    for (let i = 0; i < zones.length; i++) {
      const yc = (ys[i] + ys[i + 1]) / 2;
      const rightIsKm = /Mandi/.test(right[i]);
      door(xm, Math.min(ys[i + 1] - 0.6, yc + 0.4), z, rightIsKm ? 0.7 : 0.8, 2.1);
      if (i > 0) door(opt.doorX ?? 1.0, ys[i], z, 0.9, 2.1);
      if (rightIsKm) win(W, yc, z, 0.5, 0.5, 1.6);
      else win(W, yc, z);
      if (i > 0 && !(kmCorner && i === zones.length - 1)) win(0, yc, z);
    }
    if (kmCorner) { door(0.75, yk, z, 0.7, 2.1); win(0.75, D, z, 0.5, 0.5, 1.6); }
    win(kmCorner ? 2.25 : 1.5, D, z, kmCorner ? 0.9 : 1.2);
    if (!/Mandi/.test(right[right.length - 1])) win(xm + 1.5, D, z);
    // ruang
    for (let i = 0; i < zones.length; i++) {
      const y0 = ys[i], y1 = ys[i + 1];
      try { sk.room(1.0, kmCorner && i === zones.length - 1 ? y0 + 0.5 : (y0 + y1) / 2 - 0.35, left[i]); } catch {}
      try { sk.room(xm + 1.5, (y0 + y1) / 2 - 0.35, right[i]); } catch {}
      mep('lampu', 1.5, (y0 + y1) / 2, z);
      mep('lampu', xm + 1.5, (y0 + y1) / 2, z);
      mep('stopkontak', xm - e, y0 + 0.5, z, [-1, 0, 0]);
      if (!/Mandi/.test(right[i])) mep('stopkontak', xm + e, y0 + 0.5, z, [1, 0, 0]);
    }
    if (kmCorner) {
      try { sk.room(0.75, D - 0.75, 'Kamar Mandi'); } catch {}
      mep('lampu', 0.75, D - 0.75, z);
      mep('kloset', 0.55, D - e, z, [0, -1, 0]);
      mep('kran', 1.2, D - e, z, [0, -1, 0]);
      mep('floordrain', 1.05, D - 1.0, z);
    }
    if (/Mandi/.test(right[right.length - 1])) {
      mep('kloset', xm + 0.5, D - e, z, [0, -1, 0]);
      mep('kran', xm + 1.2, D - e, z, [0, -1, 0]);
      mep('wastafel', W - 0.6, ys[ys.length - 2] + e, z, [0, 1, 0]);
      mep('floordrain', xm + 1.6, D - 0.6, z);
    }
    return ys;
  };
  floorPlan(S.zones, S.left, S.right, 0, { ground: true, km: S.km, doorX: S.stair ? 2.4 : 1.0 });
  // rumah 2 lantai: lantai atas & tangga
  if (S.up) {
    sk.level('Lantai 2', H, H);
    model.activeLevel = 1;
    floorPlan(S.up.zones, S.up.left, S.up.right, H, {});
    model.activeLevel = 0;
    sk.stairs(S.stair.x, S.stair.y, 0, 0.9, S.stair.shape);
  }
  // dapur, panel, utilitas luar
  mep('wastafel', S.km ? 2.3 : 1.2, D - e, 0, [0, -1, 0]);
  mep('panel', 2.5, e, 0, [0, 1, 0]);
  mep('septictank', 1.5, D + 1.0, 0);
  mep('tandon', W - 1.0, D + 0.8, 0);
  // atap di atas dinding lantai teratas
  const topZ = S.up ? H : 0;
  const sids = [...new Set(model.faces.filter((f) => { const g = model.groups[f.group]; return g?.wall && Math.abs(g.wall.pts[0][2] - topZ) < 0.1; }).map((f) => f.solid))];
  sk.roof(sids, 30, 0.6);
  buildAllStructure();
  model.activeLevel = 0;
  setStdView('iso');
  zoomExtents();
  changed();
  const rk = C.rekap(model, C.rabRows(model));
  showTray('kons');
  toast(`${S.label} (${W}×${D} m) siap · RAB ± Rp ${rk.bulat.toLocaleString('id-ID')} — ubah sesuka hati, RAB ikut menyesuaikan`);
  return rk;
}
document.querySelectorAll('#tplDlg [data-house]').forEach((b) => (b.onclick = () => buildHouse(b.dataset.house)));

function newFromTemplate(name) {
  const t = TEMPLATES[name] || TEMPLATES.arsitektur;
  const m = G.newModel();
  m.units = { ...t.units };
  m.style = { ...DEF_STYLE, ...t.style };
  filePath = null;
  loadModel(m);
  window.api.autosaveClear();
  $('tplDlg').hidden = true;
  setStdView('iso');
  toast(`Model baru: ${name} (${t.units.u})`);
}
document.querySelectorAll('#tplDlg [data-tpl]').forEach((b) => (b.onclick = () => newFromTemplate(b.dataset.tpl)));
$('tplCancel').onclick = () => ($('tplDlg').hidden = true);
$('verClose').onclick = () => ($('verDlg').hidden = true);
$('keySave').onclick = saveKeys;
$('keyReset').onclick = () => {
  try {
    localStorage.removeItem('sketchclone.keys');
  } catch {}
  loadKeys();
  openKeys();
  toast('Pintasan dikembalikan ke bawaan');
};
$('keyClose').onclick = () => ($('keyDlg').hidden = true);
$('shareStop').onclick = async () => {
  await window.api.shareStop();
  $('shareDlg').hidden = true;
  toast('Berbagi dihentikan');
};
$('t3dOk').onclick = confirmText3D;
$('t3dCancel').onclick = () => {
  $('t3d').hidden = true;
  setTool('select');
};
$('t3d').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape') $('t3dCancel').onclick();
  if (e.key === 'Enter' && e.ctrlKey) confirmText3D();
});

// ======================= Mulai =======================
loadPlugins();
checkRecovery();
showTray('info');
setTool('select');
updateCamera();
refresh();
updateTitle();
updateInfo();

// Akses untuk pengujian otomatis.
window.__sk = {
  solidBoolean: (a, b, op) => booleanSolids(model, a, b, op),
  G,
  project(x, y, z) {
    const s = toScreen(new THREE.Vector3(x, y, z));
    if (!s) return null;
    const r = canvas.getBoundingClientRect();
    return { clientX: r.left + s.x, clientY: r.top + s.y };
  },
  setTool, view, updateCamera, zoomExtents, setStdView,
  getModel: () => model,
  getSelection: () => [...selection],
  setSelection: (ids) => { selection = new Set(ids); refresh(); updateInfo(); },
  type: (t) => { vcbText = t; tool.onVCB && tool.onVCB(vcbText); vcbText = ''; renderVCB(); },
  key: (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k })),
  undo, redo, loadModel, setShadows, solidOp, runScript, sketch, textures, setMat, getCurMat: () => curMat, pluginCommands, applyArray, getLastArray: () => lastArray, C, PR, S, markPhase, markAllExisting, setRenoView, slabFromSelection, beamsFromSelection, placeColumnTool, runStructCheck, applyStructFix, fixAllStruct, getLastCheck: () => lastCheck, exportProposal, companyOf, saveCompany, strukDim, renderProdPane, placeCabinet, prodCutList, prodNesting, buildNet, exportNet, exportCutPdf, exportPrint, getLastNet: () => lastNet, buildHouse, HOUSES, buildAllStructure, toggleStructView, elevSheets, sectionSheets, exportRabPdf, kurvaSvg, rabExtraSheets, placeStairTool, placeMepTool, setStairShape: (v) => (stairShape = v), exportRab, renderKonsPane, addLevel, curLevel, planSheets, roomSliceZ, loadOnlineLib, placeOnline, insertModelAsComponent, exportSelectionComponent, getOnlineLib: () => onlineLib, exportWebViewer, shareToPhone, viewerHtml, runAi, openAi, aiContext, openVersions, newFromTemplate, openKeys, saveKeys, keyTools, recordVideo, sky, exportDrawing, bomData, exportBom, exportDXF, intersectSel, roofSel, showGrips, gripState: () => gripState, fastIds: () => fastIds, openDeform, applyDeform, tessellateSel, mirrorLinked, splinePoints, subdivideSel, roundAllSel, mirrorSel, importReference, filletSel, fitTexture, texMapper, editTexture, exportPNG, serializeProject, applyProjectData, startPlace, LIBRARY, insertLibrary, getFont, textShapes, buildText3D, confirmText3D, getPlaceGen: () => placeGen, boxSelect, openCtx, zoomSelection, fmt, parseNums, eyePos, walkBy, turnView, importMesh, importSkp, exportDAE, exportGLB, addScene, goScene, showTray, hideSelection, unhideAll, cmd: handleMenu, enterEdit, exitEdit, editGroup: () => editGroup, sunState, styleOf, setStyle, refresh,
  mouse(type, x, y, z, extra = {}) {
    const p = this.project(x, y, z);
    if (!p) return;
    canvas.dispatchEvent(new PointerEvent(type, { clientX: p.clientX, clientY: p.clientY, button: 0, bubbles: true, pointerId: 1, ...extra }));
  },
  click(x, y, z, extra) { this.mouse('pointermove', x, y, z, extra); this.mouse('pointerdown', x, y, z, extra); this.mouse('pointerup', x, y, z, extra); },
  hover(x, y, z, extra) { this.mouse('pointermove', x, y, z, extra); },
};
