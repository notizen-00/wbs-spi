# Installer native Windows / local

MinIO dapat dipasang dan dijalankan **tanpa Docker atau WSL**. Installer proyek membangun `minio.exe` dan `mc.exe` dari tag source resmi yang dikunci. Instalasi berada di `.local/windows` dalam proyek; tidak mengubah PATH sistem, firewall, registry, startup Windows atau database.

## Pasang MinIO

Prasyarat: Node.js proyek, `npm.cmd ci`, dan Go 1.24+ pada PATH. Go hanya dibutuhkan untuk membangun executable; proses MinIO sesudahnya merupakan aplikasi Windows native.

```powershell
npm.cmd run native:install
npm.cmd run native:start
npm.cmd run storage:check
npm.cmd run native:status
```

Installer pertama mengunduh dependency Go dan melakukan kompilasi sehingga dapat memerlukan beberapa menit serta ruang disk untuk cache. Jalankan ulang untuk melanjutkan jika jaringan terputus; binary yang sudah terpasang tidak ditimpa. `binaries.json` mencatat source tag dan checksum SHA-256 binary lokal. Source MinIO memakai lisensi AGPLv3; konfigurasi ini ditujukan untuk development lokal.

Perintah npm menggunakan `powershell.exe -NoProfile -ExecutionPolicy Bypass` hanya untuk proses script tersebut, tanpa mengubah execution policy mesin. Alternatif langsung:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File deploy/windows/Install-Native.ps1 -Start
```

`native:start` membaca `.env`, menjalankan MinIO di background dengan jendela tersembunyi, menunggu healthcheck, lalu membuat bucket privat dan akses aplikasi. Launcher hanya menerima endpoint HTTP loopback (`localhost`/`127.0.0.1`); default API `9000`, console `9001`. Jika port telah digunakan proses lain, launcher berhenti tanpa mematikan proses tersebut.

Menjalankan `native:start` kembali menerapkan konfigurasi aplikasi/bucket. Bila root credential atau endpoint berubah, launcher memuat ulang proses proyek secara otomatis. Restart API juga diperlukan jika prosesnya masih menyimpan konfigurasi `.env` yang lama.

- API: http://localhost:9000
- Console: http://localhost:9001
- Kredensial console: `MINIO_ROOT_USER` dan `MINIO_ROOT_PASSWORD` pada `.env`.
- Bukti: `.local/windows/minio-data`.
- Log: `.local/windows/logs`.

Konfigurasi `MINIO_*` mengikuti [panduan MinIO](minio.md), dengan fallback `S3_*` lama. Jangan mengubah bucket bila metadata database masih menunjuk bukti di bucket sebelumnya. Data volume Docker tidak otomatis disalin ke folder native.

Untuk menghentikan:

```powershell
npm.cmd run native:stop
```

Stop memeriksa executable dan waktu mulai proses sebelum menghentikan PID, sehingga tidak menghentikan proses lain akibat PID dipakai ulang. Bukti tetap tersimpan. Launcher menggunakan background process milik pengguna, bukan Windows Service dengan autostart. Setelah restart Windows jalankan `native:start` kembali.

Verifikasi pada mesin proyek: build kedua executable berhasil, installer aman diulang, start/stop/start berhasil, `storage:check` lolos, data biner berhasil ditulis/dibaca dan request anonim ditolak. Objek uji sintetis dibersihkan setelah pengujian.

## Prasyarat WBS lainnya

MinIO adalah storage, sedangkan seluruh aplikasi masih memerlukan PostgreSQL, Redis-compatible server, SMTP dan ClamAV. Gunakan instalasi yang sudah ada bila tersedia. Script opsional berikut membuka installer vendor melalui winget; sebagian memerlukan Administrator dan dialog konfigurasi:

```powershell
# Pilih hanya komponen yang belum terpasang.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File deploy/windows/Install-Prerequisites.ps1 -Component Go
# Jalankan satu komponen per perintah bila memakai powershell.exe -File:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File deploy/windows/Install-Prerequisites.ps1 -Component PostgreSQL
powershell.exe -NoProfile -ExecutionPolicy Bypass -File deploy/windows/Install-Prerequisites.ps1 -Component Redis
powershell.exe -NoProfile -ExecutionPolicy Bypass -File deploy/windows/Install-Prerequisites.ps1 -Component Mailpit
```

- PostgreSQL: tetapkan password saat instalasi dan buat database `wbs`, lalu sesuaikan `DATABASE_URL`. Ikuti [panduan Prisma](prisma.md) untuk membedakan database baru dan baseline database lama.
- Redis native Windows memakai **Memurai Developer**; edisi Developer untuk development/test, bukan produksi. Atur `REDIS_URL` ke listener lokalnya, default 6379. Service vendor dikelola installer/Services Windows.
- Mailpit native: setelah terpasang, jalankan `mailpit --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025` pada terminal sendiri. Isi `SMTP_HOST=localhost`, `SMTP_PORT=1025`; inbox di http://localhost:8025.
- ClamAV: gunakan paket Windows resmi, konfigurasikan `clamd.conf` dengan `TCPAddr 127.0.0.1`, `TCPSocket 3310`, `DatabaseDirectory` dan `StreamMaxLength 25M`. Siapkan `freshclam.conf`, jalankan `freshclam` untuk mengambil definisi, lalu `clamd --config-file=<path>` pada terminal sendiri. Ini tidak diinstal atau dipalsukan oleh installer MinIO; jika scanner belum siap, bukti tetap terkunci.

`native:status` menunjukkan listener default yang tersedia; hasil port terbuka bukan bukti bahwa autentikasi atau protokol sudah benar. Setelah prasyarat siap:

```powershell
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run dev
# Terminal terpisah:
npm.cmd run worker
```

Referensi: [MinIO build dari source](https://github.com/minio/minio/tree/RELEASE.2025-09-07T16-13-09Z#install-from-source), [Redis native Windows/Memurai](https://redis.io/tutorials/howtos/how-to-run-redis-on-windows-natively-with-memurai/), [ClamAV Windows](https://docs.clamav.net/manual/Installing.html), [Mailpit](https://mailpit.axllent.org/docs/install/).
