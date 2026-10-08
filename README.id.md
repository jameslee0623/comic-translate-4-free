# comic-translate-4-free

**Language:** [English](README.md) · [हिन्दी](README.hi.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · [العربية](README.ar.md) · [Français](README.fr.md) · [বাংলা](README.bn.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [Bahasa Indonesia](README.id.md) · [اردو](README.ur.md) · [Deutsch](README.de.md)

Baca manga dalam bahasa Anda — langsung di browser.

comic-translate-4-free menerjemahkan halaman manga dan komik secara otomatis saat Anda menjelajah. Ia membaca bahasa Jepang, Inggris, Tionghoa Sederhana dan Tradisional (dengan auto-detect), dan menerjemahkannya ke 114 bahasa. Buka sebuah halaman, dan versi terjemahannya menggantikan gambar asli di tempat — balon percakapan terisi dengan bahasa Anda.

### 📸 Sebelum & Sesudah

| Sebelum (Jepang) | Sesudah (Indonesia) |
| --- | --- |
| ![Halaman manga Jepang asli](docs/images/wikipe-tan-original.jpg) | ![Diterjemahkan ke Bahasa Indonesia](docs/images/wikipe-tan-id.jpg) |

<details>
<summary>Lihat terjemahan dalam 14 bahasa lainnya</summary>

| Hindi | Korea | Tionghoa Sederhana |
| --- | --- | --- |
| ![Hindi](docs/images/wikipe-tan-hi.jpg) | ![Korea](docs/images/wikipe-tan-ko.jpg) | ![Tionghoa Sederhana](docs/images/wikipe-tan-zh-CN.jpg) |

| Tionghoa Tradisional | Spanyol | Arab |
| --- | --- | --- |
| ![Tionghoa Tradisional](docs/images/wikipe-tan-zh-TW.jpg) | ![Spanyol](docs/images/wikipe-tan-es.jpg) | ![Arab](docs/images/wikipe-tan-ar.jpg) |

| Prancis | Bengali | Portugis |
| --- | --- | --- |
| ![Prancis](docs/images/wikipe-tan-fr.jpg) | ![Bengali](docs/images/wikipe-tan-bn.jpg) | ![Portugis](docs/images/wikipe-tan-pt.jpg) |

| Rusia | Vietnam | Indonesia |
| --- | --- | --- |
| ![Rusia](docs/images/wikipe-tan-ru.jpg) | ![Vietnam](docs/images/wikipe-tan-vi.jpg) | ![Indonesia](docs/images/wikipe-tan-id.jpg) |

| Urdu | Jerman |
| --- | --- |
| ![Urdu](docs/images/wikipe-tan-ur.jpg) | ![Jerman](docs/images/wikipe-tan-de.jpg) |

</details>

*Gambar asli: [Wikipedia](https://en.wikipedia.org/wiki/Manga) via Wikimedia Commons.*

---

## ✨ Fitur

- **Penerjemahan otomatis** — buka halaman manga di situs yang diizinkan dan versi terjemahannya muncul di tempat, tanpa perlu mengeklik tombol.
- **Klik kanan gambar apa pun** — pilih "Send to comic-translate-4-free" untuk menerjemahkan gambar tertentu, bahkan yang lebih kecil dari ukuran minimum.
- **114 bahasa target** via Google Translate, Azure Translator, atau server LM Studio lokal Anda sendiri.
- **Auto-detect bahasa sumber** — bahasa Jepang, Inggris, Tionghoa Sederhana/Tradisional dikenali secara otomatis dari teks hasil OCR.
- **Dukungan strip panjang / webtoon** — halaman yang tinggi diproses dalam segmen yang tumpang tindih agar teks tetap tajam.
- **16 bahasa UI** — antarmuka ekstensi mengikuti pengaturan bahasa browser Anda.

### 🔒 Privasi

- **AI-nya berjalan di mesin Anda.** Deteksi balon, OCR, dan inpainting semuanya dijalankan secara lokal di browser Anda via WebAssembly. Halaman Anda tidak pernah meninggalkan perangkat Anda.
- **Hanya teks terjemahan yang dikirim keluar** — hanya string yang diekstrak yang dikirim ke layanan penerjemahan yang Anda pilih (Google / Azure / LM Studio lokal Anda).
- **Tanpa akun, tanpa pelacakan, tanpa telemetri.** Semua pengaturan dan model yang di-cache tetap berada di penyimpanan lokal browser Anda.

---

## 🚀 Instalasi

**Chrome / Edge / Brave:**

[**Instal dari Chrome Web Store**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj) — sekali klik, pembaruan otomatis.

**Firefox:** unduh zip Firefox dari [Releases](https://github.com/jameslee0623/comic-translate-4-free/releases), lalu buka `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pilih `manifest.json`. (Add-on sementara akan hilang saat restart; listing AMO yang ditandatangani sedang dalam proses.)

Setelah instalasi, buka halaman Settings dan klik **Download all models** sekali (~350 MB: detektor, OCR, inpainter). Semuanya disimpan di cache browser dan diverifikasi berdasarkan ukuran byte.

![Mengunduh model dari halaman Settings](docs/images/options-models.png)

---

## 💡 Cara Penggunaan

1. **Izinkan situsnya dulu** — klik ikon ekstensi dan tekan **Allow this site** (atau aktifkan **ALLOW ALL SITES**). Penerjemahan hanya berjalan di situs yang telah Anda izinkan.

   ![Izinkan situs dari popup](docs/images/popup.png)

2. **Muat ulang halaman manga** — penerjemahan dimulai otomatis saat halaman dimuat. Sebuah pill di kanan atas menunjukkan progres langsung (Capturing → Detecting → OCR → …).
3. **Selesai** — gambar halaman diganti di tempat dengan versi terjemahannya.

**Tips:**
- Klik kanan gambar apa pun → **Send to comic-translate-4-free** untuk menerjemahkan hanya gambar tersebut.

  ![Klik kanan untuk mengirim gambar](docs/images/right-click.png)

- Jika sebuah situs memblokir unduhan (HTTP 403), ekstensi otomatis mencoba ulang via tab latar.
- Pilih mesin penerjemah di Settings: Google (gratis, tanpa key), Azure Translator (daftar key di bawah — 2 juta karakter/bulan gratis), atau LM Studio (server lokal).
- Aktifkan **Debug mode** di Settings untuk memeriksa setiap tahap pipeline.

---

## 🔑 Mendaftar akun Microsoft Azure

Untuk menggunakan Azure Translator sebagai mesin penerjemah:

1. Buat/masuk ke akun Microsoft/hotmail/Azure
2. Buat langganan Azure
3. Buat resource Azure Translator
4. Pilih tingkat harga F0 (Gratis) — 2 juta karakter/bulan, tidak kedaluwarsa
5. Resource Management → Keys and Endpoint → salin **KEY 1** dan **Location/Region**
6. Tempelkan ke halaman Settings ekstensi

---

## ❤️ Dukung proyek ini

Jika ekstensi ini berguna bagi Anda, pertimbangkan untuk mendukung pengembangannya:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S5X627XJQW)

---

## ⚠️ Masalah yang Diketahui

- **Belum ada OCR Korea** — bahasa sumber adalah Jepang, Inggris, dan Tionghoa Sederhana/Tradisional. (Bahasa Korea tetap tersedia sebagai bahasa target.)
- **Satu gambar per halaman** untuk auto-translate (gambar utama halaman). Gunakan klik kanan → Send untuk menerjemahkan gambar lainnya.
- **Sesi besar** — menerjemahkan puluhan gambar dalam satu sesi dapat membuat browser crash. Hapus page cache di Settings jika ini terjadi.
- **Firefox** — model berjalan di background page (tanpa offscreen documents), berbagi memori dengan yang lain. Restart browser jika Anda melihat "no available backend found".
- Google Translate memakai endpoint gratis tidak resmi dan mungkin kena rate-limit.

---

## 📄 Pemberitahuan pihak ketiga

Proyek ini terinspirasi dari [ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate) — detektor balon/teks dan inpainter LaMa yang di-finetune untuk manga adalah ekspor ONNX-nya, dan logika inference-nya di-port dari sana. (OCR menggunakan [Baberu](https://huggingface.co/genshiai-daichi/baberu-ocr) karya genshiai-daichi.)

Library yang dibundel, kode hasil port, dan model yang diunduh saat runtime dicantumkan beserta lisensinya di [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

MIT License — lihat [LICENSE](LICENSE).
