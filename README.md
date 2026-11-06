# WBS Universitas Jember

Whistleblowing System berbentuk **npm workspaces monorepo**, berdasarkan [PRD](docs/PRD.md), [spesifikasi teknis](docs/technical-spec.md), dan [flowchart](docs/flowcharts.md). Implementasi lokal untuk pengembangan dan UAT dengan data sintetis; belum merupakan rilis operasional penuh.

## Struktur

```text
apps/api               NestJS modules/controllers/services, PrismaService, akses perkara
apps/web               Nuxt 4 + Vue, portal pelapor dan ruang kerja internal
apps/worker            Outbox email/notifikasi dan pemindaian ClamAV
packages/contracts     Tipe publik dan label status bersama
packages/domain        Aturan transisi serta validasi pengiriman
database/prisma        Schema Prisma dan empat migrasi PostgreSQL berversi
prisma.config.ts       Konfigurasi Prisma CLI, datasource, migrasi dan seed
deploy                 Docker Compose, Dockerfile dan reverse proxy
tests                  Integrasi PostgreSQL tertanam dan pengujian browser
artifacts              Screenshot desktop/mobile hasil uji browser
```

## Menjalankan di Windows

Untuk **MinIO native tanpa Docker**, gunakan [installer Windows/local](docs/windows-native.md): `npm.cmd run native:install`, kemudian `npm.cmd run native:start`. Script opsional pemasangan prasyarat native juga tersedia di panduan tersebut.

Prasyarat: Node.js 24.15+ dan Docker Desktop dengan Linux containers berjalan. Gunakan `npm.cmd` bila PowerShell memblokir `npm.ps1`.

```powershell
Copy-Item .env.example .env
npm.cmd ci
npm.cmd run db:generate
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

Storage menggunakan **MinIO**. Pengaturan `MINIO_*`, inisialisasi bucket privat, dan panduan memakai server MinIO sendiri ada di [docs/minio.md](docs/minio.md). Untuk menjalankan hanya storage: `docker compose --env-file .env -f deploy/compose.yml up -d minio storage-init`, lalu `npm.cmd run storage:check`.

ClamAV perlu mengunduh basis definisi saat startup pertama; berkas tetap terkunci sampai scan berhasil. Seluruh port infrastruktur Compose dibatasi ke loopback. Kredensial `.env.example` hanya untuk pengembangan lokal.

Database yang sebelumnya sudah dibuat memakai runner SQL lama harus mengikuti [panduan baseline Prisma](docs/prisma.md#database-lama-dari-runner-sql), bukan menjalankan migrasi awal lagi atau reset database.

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

`CHROME_PATH` dapat diatur jika lokasi Chrome berbeda; konfigurasi default mengikuti instalasi Windows. Tes workflow menggunakan Prisma Client + adapter PostgreSQL melalui socket PGlite agar bisa berjalan tanpa Docker. Tes juga menjalankan CLI `prisma migrate deploy`, pemeriksaan drift schema dan baseline database lama. Ini tidak menggantikan pengujian konkurensi PostgreSQL/Redis nyata. Tes form mobile menggunakan API fixture secara eksplisit, sedangkan halaman publik diuji melalui aplikasi yang berjalan.

## Prisma ORM dan migrasi

CRUD API, seed dan worker memakai Prisma Client. `PrismaService` dikelola lifecycle NestJS, dan transaksi memakai `$transaction`. SQL khusus hanya dipakai melalui tagged `$queryRaw` untuk row lock, sequence nomor, healthcheck dan `SKIP LOCKED`. Constraint, partial index dan trigger immutable tetap berada dalam Prisma migrations.

```powershell
npm.cmd run db:validate
npm.cmd run db:generate
npm.cmd run db:migrate                 # Terapkan migrasi yang sudah disimpan
npm.cmd run db:migrate:dev -- --name nama_perubahan
npm.cmd run db:status
npm.cmd run db:studio
```

Setelah mengubah schema/membuat migrasi, jalankan `db:generate`. Perintah dev, test, typecheck, seed dan build menyiapkan client secara otomatis. Generated client tidak disimpan di Git. Panduan lengkap dan transisi database lama: [docs/prisma.md](docs/prisma.md).

Hasil pemeriksaan, batas implementasi dan kebutuhan operasional tercatat di [status implementasi](docs/implementation-status.md). Kontrak command ada di [API](docs/api.md) dan petunjuk operasi di [runbook](docs/runbook.md).

## Prinsip UI

Notifikasi mendukung **WebSocket realtime**: lonceng/badge diperbarui otomatis, koneksi dipulihkan dengan sinkronisasi riwayat, dan sesi divalidasi sebelum pengiriman. Redis yang sama dipakai API/worker; detail endpoint dan konfigurasi ada di [notifikasi realtime](docs/realtime-notifications.md).

Dashboard hijau, sidebar desktop dan drawer mobile, formulir empat langkah, daftar berbentuk kartu pada mobile, fokus keyboard, dialog akun, feedback error/sukses, serta tata letak tanpa tabel lebar. Ukuran 320, 390, 768 dan 1440 px diuji tanpa overflow horizontal. Font disajikan dari aplikasi sendiri; isi laporan tidak disimpan ke localStorage dan tidak dikirim ke analytics.

Pratinjau hasil pengujian: [desktop](artifacts/portal-1440.png) · [mobile](artifacts/portal-390.png).
