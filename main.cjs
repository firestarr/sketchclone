const { app, BrowserWindow, Menu, dialog, ipcMain, shell, safeStorage } = require('electron');
const Anthropic = require('@anthropic-ai/sdk').default;
const { autoUpdater } = require('electron-updater');
const REPO = 'firestarr/sketchclone';
const fs = require('fs');
const path = require('path');

let win;
let dirty = false;
const knownPaths = new Set(); // hanya path yang dipilih lewat dialog yang boleh ditulis ulang

const send = (cmd, arg) => win && win.webContents.send('menu', cmd, arg);

let pluginNames = [];

// ---- berkas terakhir ----
const recentFile = () => path.join(app.getPath('userData'), 'recent.json');
function readRecent() {
  try {
    return JSON.parse(fs.readFileSync(recentFile(), 'utf8')).filter((p) => typeof p === 'string' && fs.existsSync(p));
  } catch {
    return [];
  }
}
function pushRecent(p) {
  const list = [p, ...readRecent().filter((x) => x !== p)].slice(0, 8);
  try {
    fs.writeFileSync(recentFile(), JSON.stringify(list), 'utf8');
  } catch {}
  buildMenu();
}
const autosaveFile = () => path.join(app.getPath('userData'), 'autosave.skc');
function clearAutosave() {
  try {
    fs.unlinkSync(autosaveFile());
  } catch {}
}
function buildMenu() {
  const t = [
    {
      label: 'Berkas',
      submenu: [
        { label: 'Baru', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
        { label: 'Buka...', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        {
          label: 'Buka Terakhir',
          submenu: readRecent().length
            ? readRecent().map((p) => ({ label: p, click: () => send('openRecent', p) }))
            : [{ label: '(kosong)', enabled: false }],
        },
        { label: 'Simpan', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Riwayat Versi...', click: () => send('versions') },
        { label: 'Simpan Sebagai...', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('saveAs') },
        { type: 'separator' },
        { label: 'Impor SketchUp/OBJ/STL...', accelerator: 'CmdOrCtrl+I', click: () => send('import') },
        { label: 'Impor Gambar Referensi...', click: () => send('refImage') },
        { label: 'Ekspor ke SketchUp (.dae)...', click: () => send('exportDae') },
        { label: 'Ekspor OBJ...', click: () => send('exportObj') },
        { label: 'Ekspor glTF (.glb)...', click: () => send('exportGlb') },
        { label: 'Ekspor Gambar PNG...', accelerator: 'CmdOrCtrl+Alt+P', click: () => send('exportPng') },
        { type: 'separator' },
        { label: 'Ekspor Halaman Web 3D (HTML + AR)...', click: () => send('exportWeb') },
        { label: 'Lihat di HP (Wi-Fi)...', click: () => send('sharePhone') },
        { type: 'separator' },
        { label: 'Ekspor Gambar Kerja (PDF)...', accelerator: 'CmdOrCtrl+P', click: () => send('exportPdf') },
        { label: 'Laporan Daftar Bahan (Excel)...', click: () => send('exportBom') },
        { label: 'RAB Otomatis (Excel)...', click: () => send('exportRab') },
        { label: 'Laporan RAB (PDF)...', click: () => send('exportRabPdf') },
        { label: 'Proposal Klien (PDF)...', click: () => send('proposal') },
        { label: 'Cek Struktur', click: () => send('structCheck') },
        { label: 'Ekspor DXF (AutoCAD)...', click: () => send('exportDxf') },
        { label: 'Ekspor STL...', click: () => send('exportStl') },
        { type: 'separator' },
        { label: 'Keluar', role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Urungkan', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: 'Ulangi', accelerator: 'CmdOrCtrl+Y', click: () => send('redo') },
        { type: 'separator' },
        { label: 'Pilih Semua', accelerator: 'CmdOrCtrl+A', click: () => send('selectAll') },
        { label: 'Hapus', click: () => send('delete') },
        { label: 'Sembunyikan', accelerator: 'CmdOrCtrl+H', click: () => send('hide') },
        { label: 'Tampilkan Semua', accelerator: 'CmdOrCtrl+Shift+H', click: () => send('unhideAll') },
        { type: 'separator' },
        { label: 'Duplikat', accelerator: 'CmdOrCtrl+D', click: () => send('duplicate') },
        { label: 'Buat Grup', accelerator: 'CmdOrCtrl+G', click: () => send('group') },
        { label: 'Buat Komponen', accelerator: 'CmdOrCtrl+Shift+G', click: () => send('component') },
        { label: 'Urai Grup/Komponen', accelerator: 'CmdOrCtrl+Shift+E', click: () => send('explode') },
        { type: 'separator' },
        { label: 'Bulatkan Sudut...', accelerator: 'CmdOrCtrl+Shift+R', click: () => send('fillet') },
        { label: 'Bulatkan Semua Rusuk...', accelerator: 'CmdOrCtrl+Shift+B', click: () => send('roundAll') },
        { label: 'Potong Sudut (Chamfer)...', click: () => send('chamfer') },
        { label: 'Potong Bersilangan (Intersect)', accelerator: 'CmdOrCtrl+Shift+I', click: () => send('intersect2') },
        { label: 'Buat Atap Pelana...', click: () => send('roof') },
        { label: 'Haluskan Permukaan...', accelerator: 'CmdOrCtrl+Shift+U', click: () => send('subdivide') },
        { label: 'Lentur / Runcing / Puntir...', accelerator: 'CmdOrCtrl+Shift+D', click: () => send('deform') },
        { label: 'Perbanyak Bidang...', click: () => send('tessellate') },
        {
          label: 'Salinan Cermin Bertaut',
          submenu: [
            { label: 'Seberang Sumbu Merah (X = 0)', accelerator: 'CmdOrCtrl+Shift+M', click: () => send('mirrorLinked', 0) },
            { label: 'Seberang Sumbu Hijau (Y = 0)', click: () => send('mirrorLinked', 1) },
          ],
        },
        {
          label: 'Cermin',
          submenu: [
            { label: 'Sumbu Merah (X)', click: () => send('mirror', 0) },
            { label: 'Sumbu Hijau (Y)', click: () => send('mirror', 1) },
            { label: 'Sumbu Biru (Z)', click: () => send('mirror', 2) },
          ],
        },
        { label: 'Balik Arah Bidang', click: () => send('reverse') },
        { label: 'Hapus Semua Garis Bantu', click: () => send('clearGuides') },
        { type: 'separator' },
        {
          label: 'Solid',
          submenu: [
            { label: 'Gabung (Union)', click: () => send('union') },
            { label: 'Kurangi (Subtract)', click: () => send('subtract') },
            { label: 'Irisan (Intersect)', click: () => send('intersect') },
          ],
        },
      ],
    },
    {
      label: 'Tampilan',
      submenu: [
        { label: 'Grid', type: 'checkbox', checked: true, click: (i) => send('grid', i.checked) },
        { label: 'Sumbu', type: 'checkbox', checked: true, click: (i) => send('axes', i.checked) },
        { label: 'Panel Kanan', accelerator: 'CmdOrCtrl+Shift+P', click: () => send('tray') },
        { label: 'Tambah Adegan', accelerator: 'CmdOrCtrl+Shift+N', click: () => send('addScene') },
        { label: 'Putar/Hentikan Animasi Adegan', click: () => send('playScenes') },
        { type: 'separator' },
        { label: 'Potongan Nyala/Mati', accelerator: 'CmdOrCtrl+Shift+X', click: () => send('sectionToggle') },
        { label: 'Hapus Bidang Potong', click: () => send('sectionClear') },
        { type: 'separator' },
        { label: 'Garis Tepi', type: 'checkbox', checked: true, click: (i) => send('edges', i.checked) },
        { label: 'X-Ray', type: 'checkbox', checked: false, click: (i) => send('xray', i.checked) },
        { label: 'Proyeksi Paralel', type: 'checkbox', checked: false, click: (i) => send('ortho', i.checked) },
        { type: 'separator' },
        { label: 'Isometrik', click: () => send('view', 'iso') },
        { label: 'Atas', click: () => send('view', 'top') },
        { label: 'Depan', click: () => send('view', 'front') },
        { label: 'Kanan', click: () => send('view', 'right') },
        { label: 'Belakang', click: () => send('view', 'back') },
        { label: 'Kiri', click: () => send('view', 'left') },
        {
          label: 'Bidang Pandang',
          submenu: [35, 50, 70, 90].map((v) => ({ label: v + '°', type: 'radio', checked: v === 35, click: () => send('fov', v) })),
        },
        { label: 'Zoom Semua', accelerator: 'Shift+Z', click: () => send('zoomExtents') },
        { label: 'Zoom ke Pilihan', click: () => send('zoomSelection') },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Ekstensi',
      submenu: [
        { label: 'Asisten AI (teks/gambar → model)...', accelerator: 'CmdOrCtrl+Shift+J', click: () => send('ai') },
        { label: 'Konsol Skrip', accelerator: 'CmdOrCtrl+Shift+K', click: () => send('console') },
        { label: 'Buka Folder Plugin', click: () => shell.openPath(pluginDir()) },
        { label: 'Muat Ulang Plugin', click: () => send('reloadPlugins') },
        ...(pluginNames.length ? [{ type: 'separator' }] : []),
        ...pluginNames.map((n, i) => ({ label: n, click: () => send('plugin', i) })),
      ],
    },
    {
      label: 'Bantuan',
      submenu: [
        { label: 'Daftar Pintasan', accelerator: 'F1', click: () => send('help') },
        { label: 'Periksa Pembaruan...', click: () => checkUpdates(true) },
        { label: 'Halaman Proyek di GitHub', click: () => shell.openExternal(`https://github.com/${REPO}`) },
        { label: 'Ubah Pintasan Keyboard...', click: () => send('keys') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#dfe6ee',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  buildMenu();
  win.loadFile('index.html');
  win.on('close', (e) => {
    if (!dirty) return;
    const r = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Batal', 'Tutup tanpa menyimpan'],
      defaultId: 0,
      cancelId: 0,
      message: 'Ada perubahan yang belum disimpan.',
    });
    if (r === 0) e.preventDefault();
    else clearAutosave();
  });

  // Mode uji otomatis: SK_TEST=<skrip.js> SK_OUT=<gambar.png>
  if (process.env.SK_TEST) {
    win.webContents.on('did-finish-load', async () => {
      try {
        await new Promise((r) => setTimeout(r, 800));
        const code = fs.readFileSync(process.env.SK_TEST, 'utf8');
        const result = await win.webContents.executeJavaScript(code);
        await new Promise((r) => setTimeout(r, 300));
        const img = await win.webContents.capturePage();
        fs.writeFileSync(process.env.SK_OUT, img.toPNG());
        console.log('TEST_RESULT', JSON.stringify(result));
      } catch (err) {
        console.log('TEST_ERROR', err && err.stack ? err.stack : err);
      }
      dirty = false;
      app.quit();
    });
  }
}

const EXAMPLE_PLUGIN = `// Contoh plugin SketchClone.
// Taruh berkas .js di folder ini. Semua fungsi tersedia lewat objek \`sketch\`
// (box, cylinder, face, line, pushPull, move, rotate, scale, paint, group, boolean, text, log, toast, addCommand).
sketch.addCommand('Buat Tangga', () => {
  for (let i = 0; i < 12; i++) sketch.box(0, i * 0.28, 0, 1.2, 0.28, (i + 1) * 0.17, '#c8b49a');
  sketch.toast('Tangga dibuat');
});
sketch.addCommand('Buat Rumah Sederhana', () => {
  sketch.box(0, 0, 0, 6, 4, 3, '#f1ead8');
  const atap = sketch.face([[0, 0, 3], [6, 0, 3], [3, 0, 4.5]], '#a33b2b');
  if (atap) sketch.pushPull(atap.id, 4 / atap.n[1]);
  sketch.toast('Rumah dibuat');
});
`;

function pluginDir() {
  const dir = path.join(app.getPath('userData'), 'plugins');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'contoh.js'), EXAMPLE_PLUGIN, 'utf8');
  }
  return dir;
}

ipcMain.handle('plugins:list', () => {
  const dir = pluginDir();
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.js'))
    .sort()
    .map((f) => ({ name: f, code: fs.readFileSync(path.join(dir, f), 'utf8') }));
});

ipcMain.on('plugins:menu', (_e, names) => {
  pluginNames = Array.isArray(names) ? names.map(String) : [];
  buildMenu();
});

ipcMain.on('state', (_e, d) => {
  dirty = !!d;
});

ipcMain.handle('file:save', async (_e, data, p, forceDialog) => {
  let target = p;
  if (!target || forceDialog || !knownPaths.has(target)) {
    const r = await dialog.showSaveDialog(win, {
      defaultPath: p || 'model.skc',
      filters: [{ name: 'Proyek SketchClone', extensions: ['skc'] }],
    });
    if (r.canceled) return null;
    target = r.filePath;
  }
  fs.writeFileSync(target, data, 'utf8');
  knownPaths.add(target);
  pushRecent(target);
  return target;
});

ipcMain.handle('file:open', async () => {
  const r = await dialog.showOpenDialog(win, {
    filters: [{ name: 'Proyek SketchClone', extensions: ['skc'] }],
    properties: ['openFile'],
  });
  if (r.canceled) return null;
  const p = r.filePaths[0];
  knownPaths.add(p);
  pushRecent(p);
  return { path: p, data: fs.readFileSync(p, 'utf8') };
});

ipcMain.handle('file:openPath', (_e, p) => {
  // hanya berkas yang ada di daftar 'terakhir dibuka'
  if (!readRecent().includes(p)) return null;
  knownPaths.add(p);
  pushRecent(p);
  return { path: p, data: fs.readFileSync(p, 'utf8') };
});

ipcMain.on('autosave:write', (_e, data) => {
  try {
    fs.writeFileSync(autosaveFile(), String(data), 'utf8');
  } catch {}
});
ipcMain.on('autosave:clear', () => clearAutosave());
ipcMain.handle('autosave:read', () => {
  if (process.env.SK_TEST && !process.env.SK_ALLOW_RECOVERY) return null;
  try {
    const st = fs.statSync(autosaveFile());
    return { data: fs.readFileSync(autosaveFile(), 'utf8'), mtime: st.mtimeMs };
  } catch {
    return null;
  }
});

// ---- riwayat versi: userData/versions/<nama-aman>/<waktu>.skc (maks 30 per berkas) ----
const crypto = require('crypto');
const verDir = (key) => {
  const safe = path.basename(String(key)).replace(/[^\w.-]+/g, '_').slice(0, 40) + '-' + crypto.createHash('sha1').update(String(key)).digest('hex').slice(0, 8);
  const d = path.join(app.getPath('userData'), 'versions', safe);
  fs.mkdirSync(d, { recursive: true });
  return d;
};
ipcMain.on('version:add', (_e, key, data) => {
  try {
    const d = verDir(key);
    fs.writeFileSync(path.join(d, Date.now() + '.skc'), String(data), 'utf8');
    const files = fs.readdirSync(d).filter((f) => f.endsWith('.skc')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - 30))) fs.unlinkSync(path.join(d, f));
  } catch {}
});
ipcMain.handle('version:list', (_e, key) => {
  try {
    const d = verDir(key);
    return fs.readdirSync(d).filter((f) => f.endsWith('.skc')).sort().reverse().map((f) => ({ name: f, time: +f.replace('.skc', ''), size: fs.statSync(path.join(d, f)).size }));
  } catch {
    return [];
  }
});
ipcMain.handle('version:read', (_e, key, name) => {
  if (!/^\d+\.skc$/.test(String(name))) return null;
  try {
    return fs.readFileSync(path.join(verDir(key), name), 'utf8');
  } catch {
    return null;
  }
});

// ---- Asisten AI: Claude API (kunci disimpan terenkripsi di userData/ai.json) ----
const aiFile = () => path.join(app.getPath('userData'), 'ai.json');
function readKey() {
  try {
    const j = JSON.parse(fs.readFileSync(aiFile(), 'utf8'));
    if (j.enc && safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(j.enc, 'base64'));
    return j.plain || null;
  } catch {
    return null;
  }
}
ipcMain.handle('ai:hasKey', () => !!readKey() || !!process.env.ANTHROPIC_API_KEY);
ipcMain.handle('ai:setKey', (_e, key) => {
  const k = String(key).trim();
  const data = safeStorage.isEncryptionAvailable() ? { enc: safeStorage.encryptString(k).toString('base64') } : { plain: k };
  fs.writeFileSync(aiFile(), JSON.stringify(data), 'utf8');
  return true;
});

const AI_SYSTEM = `Anda adalah pemodel 3D di dalam aplikasi SketchClone (mirip SketchUp). Tugas Anda: menulis kode JavaScript yang membangun model 3D sesuai permintaan pengguna (teks dan/atau gambar referensi), memakai objek \`sketch\`.

Aturan dunia: satuan METER, sumbu Z ke atas, X = merah (kanan), Y = hijau (ke belakang). Benda menghadap ke -Y (depan). Lantai di z = 0. Warna berupa string hex '#rrggbb'.

API \`sketch\` (semua fungsi pembuat benda mengembalikan id solid, kecuali disebut lain):
- box(x, y, z, w, d, h, color) — balok dari pojok (x,y,z) berukuran w (X) × d (Y) × h (Z)
- roundBox(x, y, z, w, d, h, r, color) — balok dengan semua rusuk dibulatkan radius r
- cylinder(cx, cy, z, r, h, seg=32, color) — silinder tegak
- sphere(cx, cy, z, r, color) — bola yang DUDUK di atas titik (cx,cy,z) (pusat di z + r)
- ellipsoid(cx, cy, cz, rx, ry, rz, color) — elipsoid berpusat di (cx,cy,cz)
- cone(cx, cy, z, r, h, color), capsule(cx, cy, z, r, h, color), torus(cx, cy, z, R, r, color)
- face(points, color) — bidang datar dari titik-titik [[x,y,z],...]; mengembalikan objek bidang f (f.id, f.n normal)
- pushPull(faceId, d) — tarik bidang sejauh d sepanjang normalnya (bidang lepas menjadi solid tertutup)
- wall(points, thickness=0.15, height=2.8, closed=false, color) — dinding dari titik denah [[x,y,0],...]
- roof(solidIds, pitchDeg=30, overhang=0.4) — atap pelana bergenteng di atas solid-solid tersebut
- wallFaceAt(x, y, z=1) — cari bidang dinding terdekat; mengembalikan {id, point} untuk door/window
- door(faceId, point, w=0.9, h=2.1) / window(faceId, point, w=1.2, h=1.2, sill=0.9) — kusen pintu/jendela yang otomatis melubangi dinding (contoh: const f = sketch.wallFaceAt(2, -0.075, 1); sketch.door(f.id, f.point))
- room(x, y, name) — ruang di titik dalam dinding tertutup (lantai + label nama & luas m², masuk RAB)
- mep(kind, x, y, z, wallNormal=null, angleDeg=0) — utilitas: lampu (plafon), saklar, stopkontak, ac, exhaust, panel (dinding; beri wallNormal mis. [0,1,0] = menghadap +Y), kloset, wastafel, bakmandi, kran, floordrain, septictank, tandon, pompa; masuk RAB beserta perkiraan kabel & pipa
- stairs(x, y, angleDeg=0, w=0.9, shape='lurus'|'L'|'Lkiri'|'U'|'Ukiri', tread=0.28, riser=0.175) — tangga beton + reling dari lantai aktif ke lantai di atasnya (naik ke arah +Y diputar angleDeg); lantai ruang atas otomatis dilubangi
- pondasi({top, bot, h, w, d}) — ukuran pondasi batu kali & galian untuk RAB
- slab([[x,y],...], zTop, t=0.12) — plat beton (outline 2D, elevasi atas plat). beam([x,y],[x,y], zTop, b=0.15, h=0.3) — balok. column(x, y, b=0.2, H?, footplat?) — kolom struktur di lantai aktif (lantai dasar otomatis berfootplat)
- Renovasi: existingAll() menandai seluruh model sekarang sebagai bangunan lama; phase(gids, 'exist'|'demo'|'new') menandai grup; yang digambar sesudahnya = pekerjaan baru. RAB hanya menghitung baru + bongkaran
- structCheck() — daftar masalah/peringatan struktur (plat, balok, kolom, pondasi); fixStructure() menerapkan semua saran
- level(name, z, h=3.5) — buat/aktifkan lantai bertingkat; dinding & ruang berikutnya dibuat di elevasi lantai tersebut (titik dinding pakai z lantai)
- library(name, x, y, z=0, angleDeg=0) — sisipkan komponen pustaka: meja, kursi, sofa, ranjang, lemari, pintu, jendela, pohon, manusia, mobil, tangga (mengembalikan id grup)
- solidFaces(solidId) — daftar id bidang milik solid
- paint(faceIds, color, tex=null, texScale=1) — tekstur bawaan: 'b:kayu','b:bata','b:beton','b:ubin','b:rumput','b:batu','b:atap','b:air' (pakai color '#ffffff' bila bertekstur)
- finish(faceIds, kind) — 'glossy' (mengkilap), 'metal' (logam), 'glass' (kaca bening)
- move(ids, dx, dy, dz), rotate(ids, deg, cx, cy, cz) (putar terhadap sumbu Z), scaleIds(ids, sx, sy, sz, cx, cy, cz)
- subtract(solidA, solidB) / union(solidA, solidB) — boolean; mengembalikan id solid hasil atau null
- roundEdges(solidId, r) — bulatkan semua rusuk solid prisma; mengembalikan id solid baru
- smooth(faceIds, level=2) — haluskan permukaan (subdivisi); mengembalikan id bidang baru
- group(ids, name, component=false) — kelompokkan bidang
- light(x, y, z, power=20, spotDown=false) — lampu
- style({ bg: 'sky'|'studio'|'realsky', edges: true|false, ao: true|false }) — gaya tampilan
- text(point, teks) — label teks; log(...) — tulis ke konsol

Pedoman:
- Tulis kode lengkap yang langsung jalan (tanpa import, tanpa async, tanpa akses DOM/jaringan/berkas). Variabel \`sketch\` dan \`THREE\` sudah tersedia.
- Bangun benda sebagai solid-solid terpisah yang tidak saling menempel di bidang yang sama kecuali memang disengaja; letakkan benda tepat di atas lantai.
- Gunakan ukuran yang realistis. Kelompokkan bagian-bagian yang menyatu (mis. satu perabot) dengan group(..., true) bila ada beberapa salinan.
- Bila ada gambar referensi, perkirakan proporsi dari gambar dan tiru bentuk serta warnanya sedekat mungkin dengan primitif yang tersedia.
- Bila model saat ini tidak kosong, letakkan benda baru di samping model yang ada kecuali pengguna meminta lain.

Format jawaban: satu kalimat singkat tentang apa yang dibuat, lalu SATU blok kode \`\`\`javascript berisi seluruh kode.`;

ipcMain.handle('ai:generate', async (e, req) => {
  // mode uji tanpa jaringan
  if (process.env.SK_TEST && process.env.SK_AI_MOCK) {
    const t = fs.readFileSync(process.env.SK_AI_MOCK, 'utf8');
    e.sender.send('ai:progress', t.length);
    const mm = t.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
    return { code: mm ? mm[1] : t, note: t.split('```')[0].trim() };
  }
  const key = readKey();
  if (!key && !process.env.ANTHROPIC_API_KEY) return { error: 'Belum ada kunci Claude API. Masukkan kunci Anda di bawah.', needKey: true };
  const content = [];
  if (req.image) content.push({ type: 'image', source: { type: 'base64', media_type: req.image.media_type, data: req.image.data } });
  content.push({ type: 'text', text: `${req.context}\n\nPermintaan: ${req.prompt || 'Buat model 3D yang semirip mungkin dengan gambar ini.'}` });
  try {
    const client = key ? new Anthropic({ apiKey: key }) : new Anthropic();
    const stream = client.beta.messages.stream({
      model: 'claude-opus-5-5',
      max_tokens: 64000,
      output_config: { effort: 'high' },
      // bila permintaan ditolak filter keamanan, server mencoba model cadangan secara otomatis
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      cache_control: { type: 'ephemeral' },
      system: AI_SYSTEM,
      messages: [{ role: 'user', content }],
    });
    let n = 0;
    stream.on('text', (delta) => {
      n += delta.length;
      e.sender.send('ai:progress', n);
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') return { error: 'Permintaan ditolak oleh filter keamanan Claude. Coba ubah kalimatnya.' };
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const mm = text.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
    if (!mm) return { error: 'Claude tidak mengembalikan kode. Coba perjelas permintaan.' };
    if (msg.stop_reason === 'max_tokens') return { error: 'Jawaban terpotong (terlalu panjang). Coba permintaan yang lebih sederhana.' };
    return { code: mm[1], note: text.split('```')[0].trim() };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { error: 'Kunci API tidak valid. Masukkan kunci yang benar.', needKey: true };
    if (err instanceof Anthropic.PermissionDeniedError) return { error: 'Kunci API tidak punya izin untuk model ini.', needKey: true };
    if (err instanceof Anthropic.RateLimitError) return { error: 'Terlalu banyak permintaan / kuota habis. Coba lagi sebentar lagi.' };
    if (err instanceof Anthropic.APIConnectionError) return { error: 'Tidak bisa terhubung ke Claude API. Periksa koneksi internet.' };
    if (err instanceof Anthropic.APIError) return { error: `Kesalahan Claude API (${err.status}): ${err.message}` };
    if (!key && /api key|apiKey|authentication|credentials/i.test(String(err && err.message))) return { error: 'Belum ada kunci Claude API.', needKey: true };
    return { error: 'Gagal: ' + (err && err.message ? err.message : String(err)) };
  }
});

// ---- berbagi ke HP lewat jaringan lokal ----
const http = require('http');
const os = require('os');
let shareServer = null;
ipcMain.handle('share:start', async (_e, html, glb) => {
  if (shareServer) shareServer.close();
  const body = Buffer.from(String(html), 'utf8');
  const model = Buffer.from(glb);
  shareServer = http.createServer((req, res) => {
    if (req.url === '/model.glb') {
      res.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Content-Length': model.length, 'Access-Control-Allow-Origin': '*' });
      return res.end(model);
    }
    if (req.url === '/' || req.url.startsWith('/?')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(body);
    }
    res.writeHead(404);
    res.end();
  });
  const port = await new Promise((resolve, reject) => {
    shareServer.once('error', reject);
    shareServer.listen(0, '0.0.0.0', () => resolve(shareServer.address().port));
  }).catch((err) => ({ err }));
  if (port && port.err) return { error: port.err.message };
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  const ip = ips.find((a) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a)) || ips[0] || '127.0.0.1';
  if (process.env.SK_TEST) console.log('SHARE_URL', `http://${ip}:${port}/`);
  return { url: `http://${ip}:${port}/` };
});
ipcMain.handle('share:stop', () => {
  if (shareServer) shareServer.close();
  shareServer = null;
  return true;
});
app.on('before-quit', () => shareServer && shareServer.close());

const FONT_OK = /^[a-z0-9_-]+\.ttf$/i;
ipcMain.handle('fonts:read', (_e, file) => {
  if (!FONT_OK.test(String(file))) return null;
  const p = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', file);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
});

ipcMain.handle('file:import', async () => {
  const r = await dialog.showOpenDialog(win, {
    filters: [{ name: 'Model 3D (SketchUp, OBJ, STL)', extensions: ['skp', 'obj', 'stl'] }],
    properties: ['openFile'],
  });
  if (r.canceled) return null;
  const p = r.filePaths[0];
  return { name: path.basename(p), ext: path.extname(p).slice(1).toLowerCase(), data: fs.readFileSync(p) };
});

ipcMain.handle('file:exportBinary', async (_e, ext, data, name) => {
  if (process.env.SK_TEST && process.env.SK_FILE_OUT) {
    fs.writeFileSync(process.env.SK_FILE_OUT + '.' + ext, Buffer.from(data));
    return process.env.SK_FILE_OUT + '.' + ext;
  }
  const r = await dialog.showSaveDialog(win, {
    defaultPath: name,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (r.canceled) return null;
  fs.writeFileSync(r.filePath, Buffer.from(data));
  return r.filePath;
});

ipcMain.handle('pdf:save', async (_e, html, name, opts = {}) => {
  // mode uji: tulis langsung tanpa dialog
  const r = process.env.SK_TEST && process.env.SK_PDF_OUT
    ? { canceled: false, filePath: process.env.SK_PDF_OUT }
    : await dialog.showSaveDialog(win, { defaultPath: name, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled) return null;
  const tmp = path.join(app.getPath('temp'), 'sketchclone-print-' + Date.now() + '.html');
  fs.writeFileSync(tmp, String(html), 'utf8');
  const pw = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
  try {
    await pw.loadFile(tmp);
    const pdf = await pw.webContents.printToPDF({ pageSize: opts.pageSize || 'A3', landscape: opts.landscape ?? true, printBackground: true, margins: { marginType: opts.margins ? 'default' : 'none' }, preferCSSPageSize: !!opts.margins });
    fs.writeFileSync(r.filePath, pdf);
    return r.filePath;
  } finally {
    pw.destroy();
    try { fs.unlinkSync(tmp); } catch {}
  }
});

ipcMain.handle('file:export', async (_e, ext, data, name) => {
  if (process.env.SK_TEST && process.env.SK_FILE_OUT) {
    fs.writeFileSync(process.env.SK_FILE_OUT + '.' + ext, data, 'utf8');
    return process.env.SK_FILE_OUT + '.' + ext;
  }
  const r = await dialog.showSaveDialog(win, {
    defaultPath: name,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (r.canceled) return null;
  fs.writeFileSync(r.filePath, data, 'utf8');
  return r.filePath;
});

// ---- pembaruan otomatis dari GitHub Releases (versi installer, bukan portable) ----
let updateManual = false;
function checkUpdates(manual) {
  updateManual = manual;
  const portable = !!process.env.PORTABLE_EXECUTABLE_DIR;
  if (!app.isPackaged || portable) {
    if (manual)
      dialog.showMessageBox(win, {
        type: 'info',
        message: portable ? 'Versi portable tidak bisa memperbarui sendiri.' : 'Pembaruan otomatis hanya aktif di aplikasi yang terpasang.',
        detail: `Unduh versi terbaru di https://github.com/${REPO}/releases`,
      });
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.checkForUpdates().catch((err) => {
    if (updateManual) dialog.showMessageBox(win, { type: 'warning', message: 'Gagal memeriksa pembaruan.', detail: String(err && err.message ? err.message : err) });
  });
}
autoUpdater.on('update-available', (info) => win && win.webContents.send('menu', 'updateInfo', `Versi ${info.version} tersedia, sedang diunduh…`));
autoUpdater.on('update-not-available', () => {
  if (updateManual) dialog.showMessageBox(win, { type: 'info', message: `Anda sudah memakai versi terbaru (${app.getVersion()}).` });
});
autoUpdater.on('update-downloaded', async (info) => {
  const r = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['Pasang & mulai ulang', 'Nanti'],
    defaultId: 0,
    cancelId: 1,
    message: `Versi ${info.version} siap dipasang.`,
    detail: 'Simpan pekerjaan Anda dulu. Bila memilih "Nanti", pembaruan dipasang saat aplikasi ditutup.',
  });
  if (r.response === 0) {
    dirty = false;
    autoUpdater.quitAndInstall();
  }
});

// ---- pustaka komponen online (folder library/ di repositori GitHub) ----
ipcMain.handle('lib:list', async () => {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/library`, { headers: { 'User-Agent': 'SketchClone', Accept: 'application/vnd.github+json' } });
  if (!r.ok) return { error: r.status === 404 ? 'Pustaka online belum ada isinya.' : `GitHub menjawab ${r.status}` };
  const items = await r.json();
  return {
    items: items.filter((it) => it.type === 'file' && /\.skc$/i.test(it.name)).map((it) => ({ name: it.name.replace(/\.skc$/i, ''), size: it.size, url: it.download_url })),
  };
});
ipcMain.handle('lib:get', async (_e, url) => {
  if (!String(url).startsWith(`https://raw.githubusercontent.com/${REPO}/`)) return null;
  const r = await fetch(url, { headers: { 'User-Agent': 'SketchClone' } });
  return r.ok ? await r.text() : null;
});
ipcMain.handle('open:upload', () => shell.openExternal(`https://github.com/${REPO}/upload/main/library`));

app.whenReady().then(() => {
  createWindow();
  if (!process.env.SK_TEST) setTimeout(() => checkUpdates(false), 4000);
});
app.on('window-all-closed', () => {
  if (!dirty) clearAutosave();
  app.quit();
});
