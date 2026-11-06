# Status implementasi — 6 November 2026

Status: **versi pengembangan/UAT dengan data sintetis**. Dokumen PRD dan spesifikasi asli tetap menjadi acuan. Tidak ada klaim bahwa seluruh 23 kebutuhan rilis operasional telah selesai.

## Tersedia

- Monorepo npm, NestJS, Nuxt/Vue, PostgreSQL, Redis, worker, kontrak/domain bersama, Prisma ORM 7 dan Prisma Migrate serta Compose lokal.
- Backend terpisah menjadi Auth, Reports, Evidence, Health dan Prisma module; controller tipis, service bisnis dan repository akses. Worker memakai Nest application context dengan PrismaService yang sama.
- Registrasi, login/logout, email verification sekali pakai, kirim ulang verifikasi, pemulihan sandi dan pencabutan sesi lama.
- Draf privat/versioning, form 5W+1H empat langkah, pilihan kerahasiaan, sumber bukti, pratinjau, konfirmasi pengiriman, nomor penerimaan dan idempotensi backend.
- Scope perkara melalui Prisma relation filters; draf tidak dapat dibaca petugas. Admin teknis tidak otomatis mendapatkan isi perkara. Payload pejabat/pelaksana dibatasi; pelaksana hanya mendapatkan tugasnya sendiri di workspace.
- Storage MinIO privat melalui service NestJS, konfigurasi `MINIO_*` dengan fallback `S3_*`, inisialisasi bucket/user aplikasi, checksum, karantina, ClamAV fail closed, audit unduhan dan penguncian bukti pending/gagal.
- Klarifikasi dengan tahap asal, proposal dan keputusan bermandat, penugasan pemeriksa, versi hasil, revisi hasil, tindak lanjut dengan bukti READY dan review terpisah.
- Penutupan normal/dini dengan jawaban resmi, penundaan/evaluasi, request dan keputusan pembukaan kembali, pencabutan akses setelah konflik.
- Row lock, expected version, snapshot, event, idempotensi dan outbox dalam satu transaksi command. Trigger mencegah perubahan event/snapshot/keputusan dari jalur SQL biasa.
- Notifikasi email umum, worker retry terbatas, UI loading/error/empty, panduan dan bantuan, font lokal, layar responsif.

## Belum memenuhi gerbang operasional PRD

| Area | Pekerjaan tersisa |
| --- | --- |
| FR-07/09/11 | Form verifikasi terstruktur/risk assessment, resolusi konflik dan pengalihan resmi yang membekukan keputusan berikutnya, jurnal/rencana/progres pemeriksaan |
| FR-08/20/22 | Tenggat konkret, kalender kerja, SLA, reminder, pause/resume timer, policy version dan UI konfigurasi |
| FR-18 | Identitas terenkripsi terpisah, permintaan/grant identitas, cakupan dan kedaluwarsa izin; endpoint pembukaan identitas sengaja belum tersedia |
| FR-19/23 | DB runtime role dengan least privilege terpisah dari migrator, replika audit terpisah, observability dan alert operator |
| Auth internal | MFA, recovery institusi, administrasi akun dan mandat dengan audit penuh |
| Storage | Streaming upload, metadata tipe struktural lanjutan, validasi/pemindaian ulang, cleanup orphan sesuai retensi, versi scanner/signature aktual, snapshot bukti pada setiap submission |
| Frontend | Router/deep link per perkara, pagination UI dan statistik agregat seluruh halaman (dashboard sekarang menghitung maksimal 50 laporan yang dimuat), ekspor aman/unduhan jawaban resmi |
| Deploy/operasi | HTTPS/secrets institusi, image digest pinning, backup/restore konsisten DB + objek + kunci, uji beban, uji konkurensi database nyata dan UAT lintas peran penuh |
| Arsitektur | OpenAPI final dan generated frontend API client; pemecahan modul domain lebih lanjut sesuai pertumbuhan fitur |

Keputusan institusi yang belum disahkan tetap seperti PRD: mandat, kategori kerahasiaan, retensi, SLA, kewenangan penundaan dan akses identitas. Jangan menerima laporan nyata sebelum kendali wajib dan UAT lengkap siap.

## Pemeriksaan yang telah dijalankan

| Pemeriksaan | Hasil |
| --- | --- |
| Unit/domain dan integrasi Prisma/PGlite | 24 tes lolos melalui Prisma Client dan Prisma Migrate pada socket PostgreSQL: migrasi ulang, schema diff, draf/submit/idempotensi, mandat, workflow, immutable audit, scope, lifecycle Nest, worker, seed, dan baseline legacy |
| Client MinIO | 2 tes lolos: prioritas/fallback konfigurasi, signature S3, path-style request, roundtrip data biner dan error objek hilang pada server sintetis |
| TypeScript API/worker dan Nuxt | Lolos |
| Build NestJS + Nuxt | Lolos |
| API hasil kompilasi | Berhasil start; `/health` mengembalikan `ok` |
| Browser Chrome desktop/mobile | 2 tes lolos; lebar 320/390/768/1440 tanpa overflow, alur form mobile dengan API fixture |
| Docker Compose config | Valid |
| MinIO native Windows | Binary berhasil dibangun; install ulang, start/stop/start, HEAD bucket, upload/download biner dan penolakan baca anonim terverifikasi pada layanan lokal nyata |
| PostgreSQL/Redis/ClamAV/SMTP integrasi penuh | Belum diuji sebagai satu alur operasional; listener PostgreSQL/Redis terdeteksi, SMTP/ClamAV belum tersedia |
| Audit dependency | Tidak ada high/critical setelah override multer 2.5; masih 12 temuan low/moderate pada dependency transitif build Nuxt. Perlu review sebelum rilis; tidak memaksakan downgrade framework |

Screenshot browser tersedia di `artifacts/portal-1440.png` dan `artifacts/portal-390.png`. Tes browser fixture tidak membuktikan integrasi backend nyata; tes PGlite tidak membuktikan race/lock di deployment PostgreSQL sebenarnya.
