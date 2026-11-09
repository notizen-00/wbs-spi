# Prisma ORM dan Prisma Migrate

Perubahan ini mengganti `pg.Pool`/`PoolClient` dan runner migrasi manual dengan Prisma ORM 7.10.1 serta Prisma Migrate. `pg` tetap menjadi driver di bawah `@prisma/adapter-pg`, bukan API query aplikasi.

## Struktur backend

```text
prisma.config.ts                    Konfigurasi CLI dari root monorepo
database/prisma/schema.prisma       Schema terpusat beserta relasi
database/prisma/migrations/         Empat migrasi SQL melalui Prisma Migrate
apps/api/src/prisma/                Global PrismaModule, PrismaService, access policy
apps/api/src/auth/                  Controller, service, session guard
apps/api/src/reports/               Controller, service, repository, workflow, serializer
apps/api/src/evidence/              Controller dan service bukti
apps/api/src/health/                Controller dan service health/readiness
apps/api/src/generated/prisma/      Generated client, tidak di-commit
apps/worker/src/                    Nest context, OutboxService, ScannerService
```

Field Prisma menggunakan camelCase dengan `@map`/`@@map` ke tabel dan kolom lama. Primary key, foreign key, JSONB, default, sequence nomor perkara, check constraint, unique partial index dan trigger immutable dipertahankan. Tabel `schema_migrations` dipetakan sebagai `LegacyMigration` hanya untuk mempertahankan riwayat runner lama; Prisma sendiri memakai `_prisma_migrations`.

API tetap kompatibel dengan frontend yang ada; serializer mempertahankan field respons publik. Controller menerima request dan meneruskan ke service, tanpa query CRUD. Repository memeriksa scope dengan relation filter Prisma, termasuk penolakan draf pengguna lain, konflik, dan admin teknis.

`PrismaService` dibuat sekali per proses melalui Nest DI, connect pada initialization dan disconnect pada shutdown. API dan worker memiliki proses/pool masing-masing. Transaksi command mencakup lock perkara, akses, versi, perubahan domain, keputusan, snapshot, audit, idempotensi dan outbox. Worker mengunci satu item lewat `FOR UPDATE SKIP LOCKED`, kemudian memakai ORM untuk membaca/memperbarui datanya.

SQL mentah terbatas pada tagged `$queryRaw`: row lock perkara, sequence nomor, healthcheck dan pengambilan antrean. Tidak ada `$queryRawUnsafe`, interpolasi input ke string SQL, atau compatibility wrapper yang menerjemahkan CRUD SQL lama.

## Database baru

Jalankan dari root monorepo; `DATABASE_URL` dapat diambil dari `.env` atau environment proses. Environment proses menang atas nilai `.env`.

```powershell
npm.cmd ci
npm.cmd run db:generate
npm.cmd run db:validate
npm.cmd run db:migrate
npm.cmd run db:status
```

Isi `SEED_PASSWORD` di `.env` dengan password minimal 12 karakter, lalu jalankan `npm.cmd run db:seed` tanpa mengatur password di terminal. Seed ditolak pada production. Perintah ini memanggil `prisma db seed` yang dikonfigurasi di `prisma.config.ts`; seed memakai Prisma dan dapat diulang tanpa mengganti kata sandi akun yang sudah ada.

## Mengubah schema

1. Edit `database/prisma/schema.prisma`.
2. Pada database development, jalankan `npm.cmd run db:migrate:dev -- --name nama_perubahan`.
3. Periksa SQL yang dihasilkan. Tambahkan SQL khusus bila perubahan melibatkan trigger, check constraint atau partial index.
4. Jalankan `npm.cmd run db:generate`, `npm.cmd run test`, `npm.cmd run typecheck` dan `npm.cmd run build`.
5. Commit schema dan folder migrasi. Pada environment tujuan gunakan `npm.cmd run db:migrate`, bukan `migrate dev`.

`SHADOW_DATABASE_URL` opsional untuk development jika user tidak memiliki izin membuat database. Gunakan database shadow terpisah yang boleh dikosongkan; jangan arahkan ke database aplikasi. Jangan gunakan `db push` sebagai pengganti riwayat migrasi proyek ini.

## Database lama dari runner SQL

Baseline berikut **hanya untuk database yang sudah menerapkan keempat migrasi SQL versi sebelumnya**. Database baru mengikuti langkah biasa di atas. Tidak ada reset otomatis atau perubahan pada database lokal pengguna selama refactor ini.

1. Buat dan uji backup database serta bukti, lalu periksa riwayat lama:

   ```sql
   SELECT name FROM schema_migrations ORDER BY name;
   ```

   Harus memuat `001_initial.sql`, `002_workflow.sql`, `003_evidence.sql`, `004_intake_and_sessions.sql`.

2. Periksa schema secara read-only; hasil harus tanpa perbedaan:

   ```powershell
   npx.cmd prisma migrate diff --from-config-datasource --to-schema database/prisma/schema.prisma --exit-code
   ```

   Kode 0 berarti sesuai, 2 berarti ada perbedaan. Jika ada perbedaan atau migrasi lama baru sebagian diterapkan, rekonsiliasi lebih dulu; jangan menandai semua migrasi sebagai applied.

3. Catat bahwa migrasi sudah diterapkan, tanpa menjalankan ulang CREATE TABLE:

   ```powershell
   npx.cmd prisma migrate resolve --applied 20261106000100_initial
   npx.cmd prisma migrate resolve --applied 20261106000200_workflow
   npx.cmd prisma migrate resolve --applied 20261106000300_evidence
   npx.cmd prisma migrate resolve --applied 20261106000400_intake_and_sessions
   npm.cmd run db:status
   npm.cmd run db:migrate
   ```

4. Jalankan smoke test dan pastikan data, nomor perkara, keputusan, snapshot, relasi bukti dan audit tetap ada. Tabel riwayat lama tidak dihapus. Jangan menjalankan `migrate reset` untuk menyelesaikan pesan database tidak kosong.

## Verifikasi

Tes menggunakan PostgreSQL tertanam PGlite dengan socket protocol PostgreSQL, Prisma Client asli dan adapter `PrismaPg`. Prisma CLI menerapkan migrasi ke database uji sementara dan `migrate diff --exit-code` memeriksa kesesuaian schema. Tes baseline menyimulasikan riwayat SQL lama, menandai migrasi, lalu memeriksa laporan dan snapshot tetap ada.

Lingkungan ini belum menjalankan integrasi Docker PostgreSQL/Redis/S3/ClamAV nyata. Pengujian PGlite tidak menggantikan uji konkurensi dan deployment database produksi.

Referensi implementasi: [NestJS Prisma](https://docs.nestjs.com/data/prisma), [Prisma Config](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference).
