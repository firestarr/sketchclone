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

**Konstruksi bangunan** — Kusen pintu & jendela yang otomatis melubangi dinding (ikut bergerak bersama dindingnya), alat Ruang (nama + luas m² tampil di model dan denah), lantai bertingkat (elevasi, tampil/sembunyi per lantai), tangga beton + reling antar-lantai bentuk lurus / L / U dengan bordes (lantai atas otomatis berlubang), utilitas listrik & sanitasi (lampu, saklar, stop kontak, AC, exhaust, panel, kloset, wastafel, bak mandi, kran, floor drain, septic tank, tandon, pompa) lengkap dengan simbol di denah dan perkiraan panjang kabel & pipa, denah per lantai di PDF (lengkap dengan busur bukaan pintu), dan **RAB otomatis** dari model: galian, pondasi, sloof, kolom praktis, ring balok, pasangan bata (dikurangi bukaan), plester, acian, cat, keramik, plafon, kusen, daun pintu/jendela, cor dak, rangka & genteng atap, beton & reling tangga, titik listrik, sanitari, kabel & pipa — ukuran pondasi dan harga AHSP bisa diubah, rekapitulasi + jasa kontraktor + PPN + terbilang, kebutuhan bahan pokok (semen, pasir, kerikil, bata, besi, keramik, cat — koefisien SNI, harga material RAB_Bangunan), jadwal & Kurva S, ekspor Excel format RAB_Bangunan dan **Laporan RAB PDF** siap cetak (panel kanan → **Konstruksi**, atau Berkas → RAB Otomatis).

**Rumah siap pakai & dokumen proyek** — Template Rumah Tipe 36, 45, 54, dan 2 Lantai (lengkap dengan kusen, ruang, utilitas, atap, struktur, dan RAB). Struktur otomatis: kolom praktis (digeser dari kusen), ring balok, sloof, pondasi batu kali, dengan **daftar pembesian** per diameter (batang 12 m). Gambar kerja PDF: denah per lantai (kolom, kode kusen + tabel kusen, dimensi tiap dinding, garis potong A-A / B-B), **tampak 4 sisi** dan **potongan A-A / B-B** dengan level ±0,00.

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

API `sketch` juga dipakai Asisten AI: `box`, `roundBox`, `cylinder`, `sphere`, `ellipsoid`, `cone`, `capsule`, `torus`, `face`, `pushPull`, `wall`, `roof`, `library`, `door`, `window`, `wallFaceAt`, `room`, `level`, `stairs`, `mep`, `pondasi`, `rab`, `paint`, `finish`, `move`, `rotate`, `scaleIds`, `subtract`, `union`, `roundEdges`, `smooth`, `group`, `light`, `style`, `text`, `log`, `toast`, `addCommand`.

## Mengembangkan

```bash
npm install
npm start            # jalankan dari kode sumber
npm run dist         # buat installer di dist/
npm run release          # buat installer & unggah ke draf GitHub Release (butuh GH_TOKEN)
npm run release:publish  # terbitkan draf -> aplikasi terpasang akan memperbarui diri
node test/csg.test.js   # tes geometri (juga: groups, shapes, deform, arch, boolean2, boolean3, construct)
```

## Contoh hasil

- [Perbandingan SpongeBob dengan gambar referensi](docs/spongebob-perbandingan.png)
- [Contoh gambar kerja PDF](docs/contoh-gambar-kerja.pdf)
