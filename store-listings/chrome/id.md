# Chrome Web Store listing — Bahasa Indonesia (id)

## Short description (132 chars max)

Terjemahkan manga & komik di browser Anda. Membaca Jepang, Inggris, Tionghoa Sederhana & Tradisional; menerjemahkan ke 114 bahasa.

(Count: 130)

## Detailed description

**Baca manga dalam bahasamu — langsung di browser.**

comic-translate-4-free menerjemahkan halaman komik dan manga secara otomatis saat Anda menjelajah. Buka sebuah halaman, dan versi terjemahannya menggantikan gambar aslinya di tempatnya — gelembung percakapan terisi dengan bahasa Anda, tanpa perlu mengeklik apa pun.

**Cara kerjanya**

1. Ekstensi menemukan setiap gambar di halaman dan menangkapnya.
2. Detektor AI di perangkat menemukan setiap gelembung percakapan dan blok teks.
3. OCR yang dilatih manga membaca teksnya (Jepang, Inggris, Tionghoa Sederhana dan Tradisional — dengan deteksi bahasa otomatis).
4. Teks aslinya dihapus dengan bersih melalui inpainting AI.
5. Mesin terjemahan pilihan Anda menampilkan hasilnya kembali ke dalam gelembung, dengan ukuran yang pas.

**Privasi diutamakan: AI berjalan di komputer Anda**

Deteksi gelembung dan OCR berjalan secara lokal di browser Anda melalui WebAssembly, dan inpainting berjalan di GPU Anda (dengan fallback WebAssembly) — halaman Anda tidak pernah meninggalkan perangkat Anda. Hanya teks yang diekstrak yang dikirim ke layanan terjemahan yang Anda pilih.

**Fitur**

- Terjemahan otomatis saat halaman dimuat — tanpa perlu menekan tombol
- Menerjemahkan setiap gambar di halaman (hingga 50 per proses), bukan hanya gambar utama
- Klik kanan pada gambar apa pun → "Kirim ke comic-translate-4-free" untuk menerjemahkannya langsung
- 114 bahasa target melalui Google Translate, Azure Translator, atau server LM Studio lokal Anda sendiri
- Deteksi otomatis bahasa sumber
- Dukungan strip panjang / webtoon
- Berfungsi di situs yang memblokir unduhan otomatis (melalui fallback tab latar belakang)
- Popup dan pengaturan bertema gelap, kontrol akses per situs
- Mode debug menampilkan setiap tahap pipeline untuk pemecahan masalah

**Gratis untuk penggunaan nonkomersial**

Berdilisensi di bawah PolyForm Noncommercial License 1.0.0. Tanpa akun, tanpa langganan, tanpa pelacakan.
https://github.com/jameslee0623/comic-translate-4-free
