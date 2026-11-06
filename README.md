# WBS Universitas Jember

Whistleblowing System berbentuk **npm workspaces monorepo**, berdasarkan [PRD](docs/PRD.md), [spesifikasi teknis](docs/technical-spec.md), dan [flowchart](docs/flowcharts.md). Implementasi lokal untuk pengembangan dan UAT dengan data sintetis; belum merupakan rilis operasional penuh.

## Struktur

```text
apps/api               NestJS HTTP API, sesi, akses perkara, command transaksi
apps/web               Nuxt 4 + Vue, portal pelapor dan ruang kerja internal
apps/worker            Outbox email/notifikasi dan pemindaian ClamAV
packages/contracts     Tipe publik dan label status bersama
packages/domain        Aturan transisi serta validasi pengiriman
database/migrations    Empat migrasi PostgreSQL berversi
deploy                 Docker Compose, Dockerfile dan reverse proxy
tests                  Integrasi PostgreSQL tertanam dan pengujian browser
artifacts              Screenshot desktop/mobile hasil uji browser
```

## Menjalankan di Windows

Prasyarat: Node.js 24.15+ dan Docker Desktop dengan Linux containers berjalan. Gunakan `npm.cmd` bila PowerShell memblokir `npm.ps1`.

```powershell
Copy-Item .env.example .env
npm.cmd ci
docker compose -f deploy/compose.yml up -d
npm.cmd run db:migrate

# Tentukan kata sandi akun sintetis sendiri, minimal 12 karakter.
$env:SEED_PASSWORD = 'Ganti-Dengan-Sandi-Uji-Anda'
npm.cmd run db:seed
Remove-Item Env:SEED_PASSWORD

npm.cmd run dev
```

Pada terminal kedua, jalankan worker:

```powershell
npm.cmd run worker
```

- Aplikasi: http://localhost:3000
- API liveness: http://localhost:3001/api/v1/health
- API readiness PostgreSQL/Redis: http://localhost:3001/api/v1/ready
- Kotak email pengembangan Mailpit: http://localhost:8025
- Konsol storage pengembangan: http://localhost:9001

ClamAV perlu mengunduh basis definisi saat startup pertama; berkas tetap terkunci sampai scan berhasil. Seluruh port infrastruktur Compose dibatasi ke loopback. Kredensial `.env.example` hanya untuk pengembangan lokal.

Registrasi publik selalu membuat role pelapor. Verifikasi email melalui tautan di Mailpit, lalu masuk. Worker harus berjalan untuk mengirim email dan memindai bukti. Isi formulir dapat disimpan sebagai draf sebelum akun terverifikasi.

### Akun UAT sintetis

Semua memakai kata sandi `SEED_PASSWORD` yang ditentukan saat seed. Seed tidak mengganti kata sandi akun yang sudah ada dan ditolak pada `NODE_ENV=production`.

| Email | Peran |
| --- | --- |
| `pelapor@example.test` | Pelapor |
| `pengelola@example.test` | Pengelola penerimaan |
| `pejabat@example.test` | Pejabat dengan mandat demo 30 hari |
| `pemeriksa@example.test` | Tim pemeriksa |
| `pelaksana@example.test` | Pelaksana tindak lanjut |

Pengelola demo terdaftar sebagai penerima intake. Akun internal lain tidak otomatis memiliki akses perkara. Tidak ada pemilih role di frontend atau header yang dapat digunakan untuk menyamar sebagai pengguna lain.

### Uji alur utama

1. Pelapor membuat draf, mengisi 5W+1H, sumber bukti dan pilihan kerahasiaan; pratinjau dan konfirmasi kirim.
2. Pengelola melihat laporan masuk, mulai verifikasi, meminta klarifikasi bila perlu, lalu mengusulkan pemeriksa dengan ringkasan tersamarkan.
3. Pejabat melihat proposal dan menyetujui atau mengembalikan dengan alasan; mandat dan pemisahan pengusul diperiksa backend.
4. Pemeriksa menyerahkan hasil. Pengelola dapat mengembalikan hasil atau mengusulkan tindak lanjut; pejabat memutus.
5. Pelaksana mengunggah bukti, menunggu scan lolos, lalu menyerahkan pelaksanaan dengan referensi bukti.
6. Pengelola memverifikasi pelaksanaan dan mengusulkan penutupan beserta jawaban resmi aman. Pejabat menyetujui.
7. Pelapor melihat jawaban resmi dan dapat mengajukan pembukaan kembali dengan informasi baru. Status akhir baru berubah setelah keputusan pejabat.

Penutupan dini tersedia dari verifikasi awal. Penundaan menyimpan tahap asal, penanggung jawab, jadwal evaluasi dan syarat lanjut. Pernyataan konflik mencabut akses pelaku dan penugasan aktifnya; penyelesaian/pengalihan konflik secara institusional masih perlu dilengkapi sebelum operasional.

### Seluruh aplikasi dalam container

```powershell
docker compose -f deploy/compose.app.yml up --build -d
# Buat akun sintetis dalam environment container, dengan kata sandi dari shell.
$env:SEED_PASSWORD = 'Ganti-Dengan-Sandi-Uji-Anda'
docker compose -f deploy/compose.app.yml exec -e SEED_PASSWORD api npm run db:seed
Remove-Item Env:SEED_PASSWORD
```

Buka http://localhost:8080. Compose ini khusus integrasi lokal, menggunakan cookie development pada HTTP dan kredensial contoh. Image dibangun sekali, dipakai API, worker, web, serta proses migrasi. Jangan mengganti `POSTGRES_PASSWORD` saja tanpa menyesuaikan `DATABASE_URL` semua service.

## Perintah pemeriksaan

```powershell
npm.cmd run test
npm.cmd run typecheck
npm.cmd run build
# Dengan aplikasi pada localhost:3000 dan Chrome terpasang:
npm.cmd run test:browser
```

`CHROME_PATH` dapat diatur jika lokasi Chrome berbeda; konfigurasi default mengikuti instalasi Windows. Tes workflow menggunakan PGlite (PostgreSQL tertanam) agar bisa berjalan tanpa Docker. Ini tidak menggantikan pengujian konkurensi terhadap PostgreSQL/Redis nyata. Tes form mobile menggunakan API fixture secara eksplisit, sedangkan halaman publik diuji melalui aplikasi yang berjalan.

Hasil pemeriksaan, batas implementasi dan kebutuhan operasional tercatat di [status implementasi](docs/implementation-status.md). Kontrak command ada di [API](docs/api.md) dan petunjuk operasi di [runbook](docs/runbook.md).

## Prinsip UI

Dashboard hijau, sidebar desktop dan drawer mobile, formulir empat langkah, daftar berbentuk kartu pada mobile, fokus keyboard, dialog akun, feedback error/sukses, serta tata letak tanpa tabel lebar. Ukuran 320, 390, 768 dan 1440 px diuji tanpa overflow horizontal. Font disajikan dari aplikasi sendiri; isi laporan tidak disimpan ke localStorage dan tidak dikirim ke analytics.

Pratinjau hasil pengujian: [desktop](artifacts/portal-1440.png) · [mobile](artifacts/portal-390.png).
