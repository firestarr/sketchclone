# SketchClone

Aplikasi desktop pemodelan 3D untuk Windows, terinspirasi SketchUp. Dibuat dengan Electron + Three.js.

![SpongeBob dibuat di SketchClone](docs/spongebob-preview.png)

## Unduh

Ambil installer terbaru di halaman **[Releases](https://github.com/firestarr/sketchclone/releases/latest)**:

- `SketchClone-Setup-x.y.z.exe` — installer (disarankan; aplikasi akan **memperbarui dirinya sendiri** setiap ada versi baru)
- `SketchClone-x.y.z.exe` — versi portable (tanpa instalasi, tanpa pembaruan otomatis)

Installer belum ditandatangani digital, jadi Windows SmartScreen bisa menampilkan peringatan: klik **More info → Run anyway**.

## Fitur

**Menggambar & mengubah** — Garis, Busur, Kurva halus, Gambar bebas, Persegi (biasa & sudut bulat), Lingkaran, Poligon, Dinding dari denah, Bola, Kerucut, Kapsul, Torus, Dorong/Tarik, Offset, Follow Me, Pindah (regangkan titik/tepi/bidang; Ctrl = salin; ketik `5x` / `/5` untuk larik), Putar, Skala (pegangan di layar, per sumbu, cermin), Penghapus, Cat.

**Bentuk lanjutan** — Bulatkan sudut / semua rusuk, Chamfer, Haluskan permukaan (subdivisi), Lentur / Runcing / Puntir, Pahat (Smoove), Potong bersilangan (Intersect), Solid Tools (gabung, kurangi, irisan), Atap pelana otomatis, Teks 3D, Medan (Sandbox).

**Pengorganisasian** — Grup & Komponen bertaut (bisa bersarang), Salinan cermin bertaut, Tag, Outliner, Adegan + animasi, Sembunyikan/tampilkan, Bidang potong.

**Tampilan & render** — Gaya (Standar, Sketsa, Arsitek, Monokrom, Kawat, X-Ray, Kartun, Render), bayangan matahari dengan slider jam, bayangan lembut (AO), langit realistis, lampu & mode malam, material bertekstur / mengkilap / logam / kaca, posisi tekstur.

**Dokumen & berkas** — Gambar kerja PDF (tampak + dimensi + kop), daftar bahan Excel, ekspor DXF / OBJ / STL / glTF / PNG / video, impor OBJ / STL, gambar referensi, simpan otomatis + pemulihan, riwayat versi, template.

**AI & berbagi** — Asisten AI (buat model dari teks atau gambar, memakai Claude API dengan kunci Anda sendiri), halaman web 3D interaktif dengan AR, lihat di HP lewat Wi-Fi (kode QR), pustaka komponen online, plugin JavaScript + konsol skrip.

Tekan **F1** di aplikasi untuk daftar pintasan keyboard.

## Pustaka komponen online

Komponen di folder [`library/`](library) bisa dijelajahi dan ditempatkan langsung dari aplikasi (panel kanan → **Pustaka** → **Muat pustaka online**).

Untuk menambahkan komponen: pilih benda di aplikasi → **Bagikan ke pustaka online** → seret berkas `.skc` yang tersimpan ke halaman GitHub yang terbuka → **Commit changes** (atau ajukan *pull request*).

## Plugin

Taruh berkas `.js` di folder plugin (menu **Ekstensi → Buka Folder Plugin**):

```js
sketch.addCommand('Kotak 1 m', () => sketch.box(0, 0, 0, 1, 1, 1, '#d9b27c'));
```

API `sketch` juga dipakai Asisten AI: `box`, `roundBox`, `cylinder`, `sphere`, `ellipsoid`, `cone`, `capsule`, `torus`, `face`, `pushPull`, `wall`, `roof`, `library`, `paint`, `finish`, `move`, `rotate`, `scaleIds`, `subtract`, `union`, `roundEdges`, `smooth`, `group`, `light`, `style`, `text`, `log`, `toast`, `addCommand`.

## Mengembangkan

```bash
npm install
npm start            # jalankan dari kode sumber
npm run dist         # buat installer di dist/
npm run release          # buat installer & unggah ke draf GitHub Release (butuh GH_TOKEN)
npm run release:publish  # terbitkan draf -> aplikasi terpasang akan memperbarui diri
node test/csg.test.js   # tes geometri (juga: groups, shapes, deform, arch, boolean2, boolean3)
```

## Contoh hasil

- [Perbandingan SpongeBob dengan gambar referensi](docs/spongebob-perbandingan.png)
- [Contoh gambar kerja PDF](docs/contoh-gambar-kerja.pdf)
