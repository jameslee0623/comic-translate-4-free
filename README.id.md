# comic-translate-4-free

**Language:** [English](README.md) · [हिन्दी](README.hi.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · [العربية](README.ar.md) · [Français](README.fr.md) · [Bahasa Indonesia](README.id.md)

Terjemahkan halaman manga/komik langsung di browser. Seluruh pipeline berjalan secara lokal:
deteksi gelembung/teks (RT-DETR-v2), OCR (Baberu untuk Jepang/Inggris/Tionghoa),
penghapusan teks
via inpainting LaMa, penerjemahan (Google / Azure / LLM lokal), dan
rendering ulang teks terjemahan ke dalam gelembung percakapan aslinya.

UI ekstensi mengikuti pengaturan bahasa browser Anda (Inggris, Jepang,
Korea, Tionghoa Sederhana/Tradisional, Hindi, Spanyol, Arab, Prancis, Bahasa Indonesia).

Proyek ini terinspirasi dari [ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate).

## Unduh (tanpa perlu build)

**Chrome / Edge / Brave — instal dari Chrome Web Store:**

[**Instal comic-translate-4-free dari Chrome Web Store**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj)

Atau ambil rilis terbaru dari halaman
[**Releases**](https://github.com/jameslee0623/comic-translate-4-free/releases)
— setiap rilis dibangun otomatis oleh CI. Unduh zip sesuai browser Anda:

- `comic-translate-4-free-v<version>-<build>-chrome.zip` → Chrome / Edge / Brave
- `comic-translate-4-free-v<version>-<build>-firefox.zip` → Firefox

(Ada juga gabungan `comic-translate-4-free-v<version>-<build>.zip`
berisi `chrome/` dan `firefox/` berdampingan, jika Anda ingin keduanya sekaligus.)
Anda tidak perlu meng-clone repo atau menjalankan `build.sh` sendiri.

## Instal

**Chrome (disarankan):** instal dari
[**Chrome Web Store**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj)
— sekali klik, pembaruan otomatis.

**Instal manual (Chrome):** unduh zip dari Releases di atas lalu ekstrak,
kemudian `chrome://extensions` → aktifkan **Developer mode** →
**Load unpacked** → pilih folder hasil ekstraksi.

**Firefox:** `about:debugging#/runtime/this-firefox` → **Load Temporary
Add-on** → buka folder hasil ekstraksi dan pilih `manifest.json`. (Add-on
sementara hanya bertahan sampai Firefox di-restart. Untuk instal permanen,
build harus ditandatangani di addons.mozilla.org. Sedang mengupayakan ekstensi
bertanda tangan untuk Firefox edisi standar.)

Lalu unduh model sekali saja dari halaman Settings — satu tombol
**Download all models** mengambil semuanya (detektor, model OCR,
inpainter, total ~350 MB). Model disimpan di browser (IndexedDB) dan tidak
perlu diunduh ulang. Ukuran byte setiap file diverifikasi setelah unduhan; file
yang terpotong atau salah ditandai dengan ⚠ dan bisa diunduh ulang.

![Mengunduh model dari halaman Settings](docs/images/options-models.png)

## Penggunaan

1. **Izinkan situsnya dulu** — penerjemahan hanya berjalan di situs yang Anda
   izinkan secara eksplisit. Klik ikon ekstensi lalu tekan **Allow this site**
   (atau tambahkan hostname di Settings, atau aktifkan **ALLOW ALL SITES** untuk
   melewati langkah ini
   di semua situs). Ini gerbang yang tegas: pipeline menolak
   berjalan di tempat lain.

   ![Popup ekstensi](docs/images/popup.png)

2. Buka halaman manga di situs yang diizinkan — penerjemahan dimulai
   otomatis begitu halaman selesai dimuat, tanpa perlu klik tombol
   (bisa dimatikan di Settings pada "Auto-translate on page load").
   Pada pemakaian pertama per situs, Chrome meminta izin satu kali agar
   ekstensi bisa mengunduh gambar halaman dalam resolusi penuh.
3. Sebuah pill status di pojok kanan atas halaman menampilkan progres live
   (Capturing → Detecting → OCR → …). Setelah selesai, gambar halaman
   diganti langsung dengan versi terjemahannya — teks asli di-inpaint,
   terjemahan dirender kembali ke dalam gelembung.

Untuk menerjemahkan satu gambar tertentu alih-alih gambar utama halaman,
klik kanan gambar itu lalu pilih **Send to comic-translate-4-free**. Ini mengirim
gambar tersebut langsung ke pipeline — bahkan jika lebih kecil dari
ukuran gambar minimum — dan tetap menggantinya di tempat. Item menu ini hanya
muncul di situs yang sudah Anda izinkan.

Jika server gambar menolak unduhan (HTTP 403, mis. proteksi bot Cloudflare),
ekstensi otomatis membuka gambar di tab latar —
di sana gambar bersifat same-origin sehingga bisa dibaca langsung tanpa
unduhan — menerjemahkannya, menutup tab, dan mengganti gambar di halaman Anda
di tempat.

   ![Menu klik kanan](docs/images/right-click.png)

Input pipeline adalah gambar terbesar di halaman, dibatasi oleh pengaturan ukuran
gambar minimum (bawaan 500px): gambar yang lebih kecil dilewati dengan pesan
error yang jelas. Ekstensi membaca gambar halaman itu sendiri secara langsung — tidak
pernah mengambil screenshot halaman web.

**Cache halaman:** halaman yang Anda kunjungi kembali dalam sesi browser yang sama
dimuat instan
dari cache disk sementara (menerjemahkan 10~40 gambar dalam satu sesi bisa
membuat browser crash sehingga semua gambar di cache hilang. Ingatlah untuk menghapus
cache secara manual). Cache dihapus otomatis saat browser ditutup,
dan tidak pernah dipakai di jendela incognito.

**Settings** (klik ikon → Settings): akses situs, terjemahkan otomatis saat
halaman dimuat, bahasa sumber (termasuk **Auto-detect**, yang mengenali
Jepang / Inggris / Tionghoa Sederhana / Tradisional dari teks hasil OCR)
dan bahasa target, mesin penerjemah (Google gratis / Azure
Translator / LM Studio), tombol uji koneksi untuk Azure dan LM Studio,
ambang deteksi, ukuran gambar minimum (bawaan 500px — hasil tangkapan yang lebih kecil
dilewati), ukuran font, mode debug, dan kontrol cache halaman terjemahan.

![Halaman Settings](docs/images/options.png)

## Dukung proyek ini

Jika ekstensi ini berguna bagi Anda, pertimbangkan untuk mendukung pengembangannya:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S5X627XJQW)

### Mendaftar akun Microsoft Azure

1. Buat/masuk ke akun Microsoft/hotmail/Azure
2. Buat langganan Azure
3. Buat resource Azure Translator
4. Pilih tingkat harga F0 (Gratis)
5. Resource Management → Keys and Endpoint → salin **KEY 1** dan **Location/Region**

Microsoft saat ini menyatakan tingkat gratis Translator F0 adalah 2 juta karakter/bulan dan tidak kedaluwarsa.

### LM Studio

Jalankan LM Studio dengan server lokalnya diaktifkan (bawaan
`http://127.0.0.1:1234`). Pilih **LM Studio (local server)** sebagai mesin
penerjemah di Settings, atur URL server dan flavour API — **LM Studio REST API v1**
(post ke `/api/v1/chat`) atau **OpenAI-compatible** (post ke
`/v1/chat/completions`) — lalu tekan **Check LM Studio connection** untuk
verifikasi. Model yang dimuat terdeteksi otomatis dan diingat, sehingga tidak
ada kolom nama model yang perlu diisi.

## Build dari source

Tanpa bundler, tanpa npm install — source-nya adalah ekstensi itu sendiri. Kebutuhan:
`bash`, `python3`, `rsync`, `zip`, dan `node` (hanya dipakai untuk syntax check).

```bash
git clone https://github.com/jameslee0623/comic-translate-4-free.git
cd comic-translate-4-free
./build.sh
```

Ini menulis tiga zip ke `dist/` (plus salinan zip gabungan untuk
kenyamanan):

- `comic-translate-4-free-v<version>-<build>.zip` — gabungan, `chrome/` dan
  `firefox/` berdampingan, siap dimuat unpacked (Chrome) atau sebagai temporary
  add-on (Firefox) sesuai "Instal" di atas
- `comic-translate-4-free-v<version>-<build>-chrome.zip` — build Chrome saja,
  dalam layout pengajuan store
- `comic-translate-4-free-v<version>-<build>-firefox.zip` — build Firefox saja,
  dalam layout pengajuan store

Stempel `<build>` berasal dari konstanta `BUILD` di `src/shared/version.js`
(tampil di footer popup dan halaman settings, dipakai sebagai kunci page-cache).
Naikkan sebelum build jika Anda ingin stempel unik di nama file dan footer UI
— jika tidak, build Anda tak bisa dibedakan dari rilis resmi
dengan stempel yang sama.

Per halaman ekstensi mengirim satu request batch:

```
POST {server}/chat/completions
{
  "messages": [
    { "role": "user",
      "content": "Translate the following 9 text(s) from Japanese to Chinese (Traditional):\n[\"…\",\"…\"]" }
  ],
  "temperature": 0,
  "texts": ["…", "…"],
  "target": "zh-TW",
  "source": "ja"
}
```

Model diharapkan membalas dengan array JSON berisi string terjemahan —
satu per teks input, dalam urutan yang sama. Sebuah `[...]` polos di dalam balasan
yang lebih panjang diterima; satu terjemahan per baris adalah fallback terakhir.

## Mode debug

Aktifkan **Debug mode** di Settings dan output setiap tahap pipeline muncul di
panel inspektur samping: gambar hasil tangkapan, kotak deteksi, blok teks, crop OCR
+ hasil baca, mask inpaint, halaman hasil inpaint, dan terjemahan.

## Arsitektur

```
popup / settings (src/ui)
      │ chrome.runtime messages
      ▼
background — orkestrasi, capture, blocks, mask, API penerjemah,
             emisi debug
  ├─ Chrome: service worker + offscreen document (src/offscreen) yang menampung
  │  SEMUA sesi onnxruntime-web (unduhan berjalan di sana agar fetch 197 MB
  │  selamat dari shutdown SW)
  └─ Firefox: background page (src/background/background.html) yang menampung
     sesi yang sama secara in-process (Firefox tidak punya offscreen documents)
└── content script (src/content) — canvas overlay + renderer teks + panel debug
```

Model (Hugging Face, diunduh sesuai kebutuhan):
- `ogkalu/comic-text-and-bubble-detector` → `detector-v4-s_int8.onnx`
- `genshiai-daichi/baberu-ocr` → `vision_int4.onnx`, `decoder_prefill_int8.onnx`,
  `decoder_step_int8.onnx` (Jepang, Inggris, Tionghoa Sederhana/Tradisional)
- `ogkalu/lama-manga-onnx-dynamic` → `lama-manga-dynamic.onnx`

Tahap pipeline: capture → detect → blocks → OCR → mask → inpaint →
translate → render. Deteksi berjalan pada 640×640; capture diskalakan berdasarkan luas
(anggaran 6.5 MP) sehingga strip panjang tetap beresolusi penuh, dan halaman dengan
rasio aspek lebih ekstrem
dari 4:1 diproses dalam segmen 2:1 yang tumpang tindih.

**Pipeline Chrome vs Firefox:** kedua build menjalankan translate paralel dengan
mask/inpaint setelah OCR. Chrome melakukannya via Promise.all — sesi ML
berada di offscreen document pada thread-nya sendiri, sehingga tahap-tahapnya benar-benar
tumpang tindih. Firefox menjalankan penerjemahan di Web Worker (thread sendiri) sementara
mask → inpaint berjalan di main thread — I/O jaringan worker tidak
terblokir saat inpaint WASM menyita main thread.

## Keterbatasan yang diketahui

- Belum ada OCR Korea yang bagus — bahasa sumber terbatas pada Jepang,
  Inggris, dan Tionghoa Sederhana/Tradisional.
- Auto-translate menangani satu gambar per halaman (gambar utama halaman).
  Untuk menerjemahkan gambar lain di halaman, klik kanan gambar itu lalu pilih
  **Send to comic-translate-4-free**.
- Beberapa host gambar memblokir unduhan otomatis (HTTP 403, mis. proteksi bot
  Cloudflare) walau halamannya sendiri memuat gambar dengan baik.
  Klik kanan **Send to comic-translate-4-free** mengakali ini via
  tab latar; auto-translate di situs semacam itu bisa gagal dengan error 403.
  Pemblokiran ini bisa bersifat intermiten.
- Firefox: model AI berjalan di dalam background page browser (Firefox tidak
  punya offscreen documents), berbagi memori dengan yang lain. Pada halaman yang sangat
  besar atau sesi yang lama, engine bisa kehabisan memori dan melaporkan
  "no available backend found". Me-restart browser membebaskan memori; Chrome
  tidak terpengaruh karena menjalankan model di proses terpisah.
- Chrome: menerjemahkan puluhan gambar dalam satu sesi bisa membuat browser
  crash (teramati sekitar 35 gambar dalam cache).
- Page cache bersifat per-sesi: dihapus saat browser dimulai, sehingga
  setelah restart (termasuk setelah crash) gambar yang dikirim ulang menjalankan
  pipeline penuh lagi alih-alih kena cache.
- Mesin penerjemah Google memakai endpoint tidak resmi `translate.googleapis.com`
  dan bisa kena rate-limit.
- Teks vertikal dirender untuk blok CJK yang tinggi; SFX / teks di luar gelembung
  memakai kotak teksnya sendiri.

## Pemberitahuan pihak ketiga

Library yang dibundel, kode hasil port, dan model yang diunduh saat runtime dicantumkan beserta
lisensinya di [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
