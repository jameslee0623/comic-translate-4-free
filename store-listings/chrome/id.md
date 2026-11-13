# Chrome Web Store listing — Bahasa Indonesia (id)

## Short description (132 chars max)

Terjemahkan manga & komik di browser Anda. Membaca Jepang, Inggris, Tionghoa Sederhana & Tradisional; menerjemahkan ke 114 bahasa.

(Count: 130)

## Detailed description

📖 Baca manga dalam bahasamu!

comic-translate-4-free menerjemahkan manga dan komik otomatis saat menjelajah. Membaca Jepang, Inggris, Tionghoa Sederhana/Tradisional (deteksi otomatis), dan menerjemahkan ke 114 bahasa, mengganti gambar di tempatnya.

✨ Fitur
- Terjemahan otomatis — buka halaman manga di situs yang diizinkan dan versi terjemahannya akan muncul di tempatnya, tanpa perlu mengeklik tombol.
- Setiap gambar di halaman — terjemahan otomatis menangani semua gambar di sebuah halaman (hingga 50 per proses), bukan hanya gambar utama.
- Klik kanan pada gambar apa pun — pilih "Kirim ke comic-translate-4-free" untuk menerjemahkan gambar tertentu, bahkan yang lebih kecil dari ukuran minimum.
- 114 bahasa target melalui Google Translate, Azure Translator, atau server LM Studio lokal Anda sendiri.
- Deteksi otomatis bahasa sumber — bahasa Jepang, Inggris, Tionghoa Sederhana/Tradisional dikenali secara otomatis dari teks hasil OCR.
- Dukungan strip panjang / webtoon — halaman tinggi diproses dalam segmen yang tumpang tindih sehingga teks tetap tajam.
- 17 bahasa UI — antarmuka ekstensi mengikuti pengaturan bahasa browser Anda.

🔒 Privasi
- AI berjalan di komputer Anda. Deteksi gelembung, OCR, dan inpainting semuanya berjalan secara lokal di browser Anda. Deteksi dan OCR berjalan melalui WebAssembly. Inpainting berjalan di GPU di Chrome (dengan fallback WebAssembly), dan melalui WebAssembly di Firefox. Halaman Anda tidak pernah meninggalkan perangkat Anda.
- Hanya teks terjemahan yang dikirim keluar — hanya string yang diekstrak yang dikirim ke layanan terjemahan yang Anda pilih (Google / Azure / LM Studio lokal Anda).
- Tanpa akun, tanpa pelacakan, tanpa telemetri. Semua pengaturan dan model yang di-cache tetap berada di penyimpanan lokal browser Anda.

💡 Cara Menggunakan
- Izinkan situsnya terlebih dahulu — klik ikon ekstensi dan tekan Izinkan situs ini (atau aktifkan Izinkan semua situs). Terjemahan hanya berjalan di tempat Anda memberikan izin.

- Muat ulang halaman manga — terjemahan dimulai secara otomatis saat halaman dimuat. Sebuah pil di kanan atas menunjukkan progres langsung (Capturing → Detecting → OCR → …).
- Selesai — gambar-gambar halaman diganti di tempatnya dengan versi terjemahan.

Tips:
- Klik kanan pada gambar apa pun → Kirim ke comic-translate-4-free untuk menerjemahkan hanya gambar itu.

- Jika sebuah situs memblokir unduhan (HTTP 403), ekstensi akan otomatis mencoba lagi melalui tab latar belakang.
- Pilih mesin terjemahan Anda di Pengaturan: Google (gratis, tanpa kunci), Azure Translator (ajukan kunci di bawah — 2 jt karakter/bulan gratis), atau LM Studio (server lokal).
- Aktifkan Mode debug (pemeriksa tahap) di Pengaturan untuk memeriksa setiap tahap pipeline.

⚠️ Masalah yang Diketahui
- Belum ada OCR Korea — bahasa sumbernya adalah Jepang, Inggris, dan Tionghoa Sederhana/Tradisional. (Bahasa Korea tetap tersedia sebagai bahasa target terjemahan.)
- Sesi besar — menerjemahkan puluhan gambar dalam satu sesi dapat memulai ulang ekstensi di latar belakang. Jika itu terjadi, proses akan dilanjutkan secara otomatis dari tempat terakhir berhenti.
- Firefox — model berjalan di halaman latar belakang (tanpa dokumen offscreen), berbagi memori dengan yang lain. Restart browser jika Anda melihat "no available backend found".
- Firefox lebih lambat daripada Chrome — ekstensi Firefox tidak dapat menggunakan memori bersama untuk multi-threading (SharedArrayBuffer), jadi model berjalan pada satu thread CPU. Ini adalah batasan platform Firefox, bukan bug ekstensi. (Bug Mozilla 1673477).
- Google Translate menggunakan endpoint gratis tidak resmi dan mungkin dibatasi kecepatannya.

📄 Pemberitahuan pihak ketiga
Proyek ini terinspirasi oleh ogkalu2/comic-translate — detektor gelembung/teks dan inpainter LaMa yang dilatih manga adalah ekspor ONNX-nya, dan logika inferensinya diporting darinya. (OCR menggunakan Baberu oleh genshiai-daichi.)

Pustaka yang dibundel, kode yang diporting, dan model yang diunduh saat runtime dicantumkan beserta lisensinya di THIRD-PARTY-NOTICES.md.

PolyForm Noncommercial License 1.0.0 — lihat LICENSE.
https://github.com/jameslee0623/comic-translate-4-free
