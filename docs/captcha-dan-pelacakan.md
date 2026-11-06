# Kode pelacakan laporan dan Google reCAPTCHA

## Konfigurasi reCAPTCHA

Gunakan **Google reCAPTCHA v2 — checkbox “I'm not a robot”**. Daftarkan hostname website melalui [konsol reCAPTCHA](https://www.google.com/recaptcha/admin/create); untuk development sertakan `localhost` dan/atau `127.0.0.1` sesuai alamat yang digunakan.

Isi `.env` di root proyek:

```dotenv
NUXT_PUBLIC_RECAPTCHA_SITE_KEY=site_key_anda
RECAPTCHA_SECRET_KEY=secret_key_anda
# Opsional; tanpa ini server memakai hostname APP_ORIGIN.
RECAPTCHA_ALLOWED_HOSTNAMES=localhost,127.0.0.1
```

Restart API setelah mengisi/mengubah konfigurasi, lalu reload browser. `GET /api/v1/public/captcha` menyediakan site key, status konfigurasi, dan flag `required`; secret key tetap di server. Tidak perlu menaruh secret pada konfigurasi publik Nuxt. Compose aplikasi meneruskan ketiga variabel dari environment/root `.env`.

Saat `NODE_ENV=development`, CAPTCHA dilewati oleh server dan widget tidak ditampilkan atau memuat script Google. Formulir tetap dapat digunakan tanpa site key/secret key. Rate limit, autentikasi, dan pemeriksaan akses tetap berlaku.

Saat `NODE_ENV=production` (atau nilai lain selain `development`), CAPTCHA wajib. Tanpa secret/key yang lengkap, formulir menunjukkan verifikasi belum tersedia dan backend menolak permintaan. Token penanda development tidak diterima sebagai bypass di production. Pengaturan ditentukan API, bukan parameter dari browser.

Pada production, reCAPTCHA dipakai pada login, pendaftaran, permintaan reset sandi/kirim ulang verifikasi, penyimpanan kata sandi baru, pengiriman laporan (`SUBMIT`), dan pengecekan status publik. Penyimpanan draf, pembacaan dashboard, upload oleh pengguna terautentikasi, dan tindakan internal tetap memakai sesi, otorisasi, dan rate limit yang sudah ada. Tautan verifikasi email sekali pakai tidak ditambah tantangan interaktif.

Frontend mengirim `captchaToken` dalam body JSON. API mengirim token ke endpoint Google `siteverify`, memeriksa keberhasilan serta hostname, dan menolak kegagalan atau layanan yang tidak tersedia. Token bersifat sekali pakai dan berlaku dua menit menurut Google; widget di-reset setelah percobaan, sehingga pengguna perlu melakukan verifikasi ulang ketika mengirim lagi. Isi laporan dan kredensial akun tidak dikirim bersama permintaan `siteverify`.

Widget Google memuat layanan eksternal untuk verifikasi. Berlaku [Kebijakan Privasi Google](https://policies.google.com/privacy) dan [Persyaratan Layanan Google](https://policies.google.com/terms). Referensi implementasi: [menampilkan reCAPTCHA v2](https://developers.google.com/recaptcha/docs/display) dan [verifikasi token di server](https://developers.google.com/recaptcha/docs/verify).

## Kode pelacakan

Migrasi `20261106100000_report_tracking_code` menambahkan kode acak unik untuk seluruh laporan yang sudah ada dan laporan baru. Nomor penerimaan seperti `WBS/2026/00003` tetap digunakan sebagai referensi administrasi. Kode pelacakan terpisah berformat `WBS-` diikuti 32 karakter heksadesimal acak dari UUID, dan bukan nomor urut yang mudah ditebak.

```powershell
npm.cmd run db:generate
npm.cmd run db:migrate
```

Pelapor dapat melihat dan menyalin kode di detail laporan setelah pengiriman. Kode hanya dikirim pada respons milik pemilik laporan, tidak pada respons petugas. Simpan kode ini dan jangan membagikannya kepada pihak lain. Kode tidak dikirim lewat URL, email, atau notifikasi umum.

Buka **Cek status** pada landing page (`/tracking`), masukkan kode, selesaikan CAPTCHA, lalu tekan Cek status. Sistem hanya mengembalikan tahap, label tahap, lifecycle, dan waktu pembaruan. Tidak ada judul, nomor perkara, identitas, kronologi, bukti, pertanyaan klarifikasi, alasan keputusan, atau jawaban resmi dalam hasil publik. Untuk informasi tersebut, masuk ke akun.

Endpoint `POST /api/v1/public/reports/status` menerima `{code,captchaToken}`. Rate limit adalah 10 percobaan per IP per 15 menit dan CAPTCHA diverifikasi sebelum pencarian kecuali pada mode development. Huruf kecil/besar pada kode dinormalisasi. Kode salah, kode tidak ditemukan, dan kode draf menghasilkan pesan tidak ditemukan yang sama. Draf tidak dapat dilacak secara publik.

Seeder kasus lengkap otomatis mendapat kode dari default database. Menjalankan seed ulang pada kasus yang sudah selesai tidak mengganti kode. Pelacakan tidak membuka perkara atau mengubah status laporan.
