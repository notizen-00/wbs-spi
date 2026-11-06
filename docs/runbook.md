# Runbook pengembangan WBS

## Penerimaan dan mandat

Seed membuat intake pengelola serta mandat pejabat **khusus sintetis**. Tanpa intake aktif, pengiriman ditolak dan draf tetap tersimpan. Akun teknis tidak memiliki akses kasus secara otomatis.

Untuk deployment institusi, provisioning harus melalui prosedur yang disetujui. Struktur tabel pendukung: `intake_members`, `authority_mandates`, `case_access`, `assignments`, `conflicts`. Jangan memberi akses global hanya melalui role. Akses kasus dan penugasan harus aktif, bebas konflik; keputusan juga membutuhkan mandat yang belum kedaluwarsa dan aktor berbeda dari pengusul.

## Pemeriksaan awal

1. `docker compose -f deploy/compose.yml ps`: PostgreSQL/Redis/MinIO/Mailpit/scanner berjalan.
2. `npm.cmd run db:migrate`: semua migrasi diterapkan sekali; seluruh batch dijalankan dalam transaksi dengan advisory lock.
3. `/api/v1/health` hanya memeriksa proses; `/api/v1/ready` memeriksa PostgreSQL dan Redis.
4. Worker berjalan, Mailpit menerima verifikasi, bucket `wbs-private` bersifat privat.
5. Uji upload PDF sintetis, amati pending lalu READY, unduh sebagai pemilik dan pastikan pengguna lain ditolak.

## Gangguan

- Redis mati: sesi/mutasi autentikasi gagal tertutup; keputusan PostgreSQL tidak hilang. Redis tidak menjadi sumber kebenaran status.
- SMTP mati: outbox tetap pending, attempts naik hingga 10. Periksa konektivitas/SMTP credential sebelum menjadwalkan ulang event.
- Scanner/S3 mati: bukti tetap PENDING atau ERROR, tidak dapat diunduh. Lima kali percobaan memerlukan pemeriksaan operator; jangan menandai READY secara manual.
- Worker berhenti: outbox dan bukti tetap durable. Nyalakan kembali setelah dependensi sehat.
- Storage upload berhasil tetapi transaksi DB gagal: mungkin ada orphan object. Jangan purge otomatis tanpa kebijakan retensi dan rekonsiliasi metadata.
- Respons command hilang: ulangi command dengan key dan payload sama; server memeriksa akses terkini. Konflik versi 409 harus memuat data terbaru sebelum membuat tindakan baru.
- Konflik kepentingan: akses aktor dan assignment dicabut. Penyelesaian/pengalihan penuh belum tersedia; perkara tersebut tidak boleh diproses operasional melalui workaround DB tanpa mandat dan audit.

Query operator berikut tidak membaca isi laporan/bukti:

```sql
SELECT kind,count(*) FROM outbox_events WHERE processed_at IS NULL GROUP BY kind;
SELECT scan_status,count(*) FROM evidence GROUP BY scan_status;
SELECT count(*) FROM outbox_events WHERE processed_at IS NULL AND attempts>=10;
SELECT count(*) FROM evidence WHERE scan_status='ERROR' AND attempts>=5;
```

Informasi observability/alert harus menggunakan ID dan status, tanpa kronologi, token, isi berkas atau kredensial. Kegagalan tersembunyi perlu sistem alert produksi; versi awal baru menyediakan status/query ini.

## Backup/restore sebelum operasional

Compose volumes merupakan persistensi lokal, bukan backup. Prosedur produksi belum diuji: hentikan mutasi/worker untuk memperoleh titik konsistensi, ambil PostgreSQL dump dan salinan object storage privat serta konfigurasi/kunci terkait, enkripsi backup, simpan terpisah. Lakukan restore ke lingkungan terisolasi; validasi checksum, relasi bukti, akun/sesi, keputusan dan audit. Catat waktu pemulihan serta kehilangan data dan bandingkan target RPO/RTO institusi.

Jangan memulihkan database saja tanpa objek dan kunci yang sesuai. Kehilangan Redis mengharuskan login ulang; pekerjaan dapat dipulihkan dari PostgreSQL/outbox. Retensi/purge/hold belum diimplementasikan, sehingga tidak ada perintah hard delete laporan pada aplikasi.

## Rilis

Lakukan review seluruh batas pada `implementation-status.md`, tetapkan kebijakan, lengkapi MFA dan izin identitas, atur runtime DB role serta secrets terpisah, audit dependency, jalankan seluruh UAT PRD pada database/infrastruktur nyata, buktikan backup/restore dan uji beban. Pasang reverse proxy HTTPS, `APP_ORIGIN` yang tepat dan `NODE_ENV=production`; jangan gunakan konfigurasi lokal sebagai konfigurasi produksi.
