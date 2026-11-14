# Storage MinIO

Aplikasi menyimpan bukti pada **MinIO**, menggunakan protokol S3 melalui `MinioStorageService`. Tidak memerlukan akun AWS. Database Prisma hanya menyimpan metadata, object key dan checksum; isi berkas berada dalam bucket privat.

## Menjalankan MinIO lokal

**Windows native tanpa Docker:** jalankan `npm.cmd run native:install`, lalu `npm.cmd run native:start`. Lihat [installer Windows](windows-native.md) untuk start/stop, data lokal dan prasyarat aplikasi lainnya.

Dari root proyek, dengan Docker Desktop berjalan:

```powershell
docker compose --env-file .env -f manifest/docker-compose.yml up --build -d minio storage-init
npm.cmd run storage:check
```

Image MinIO dan `mc` dibangun lokal dari source resmi yang dikunci, melalui [minio.Dockerfile](../minio.Dockerfile). Compose tidak lagi menarik `minio/minio` atau `minio/mc` dari Docker Hub. Tag source sama dengan installer native Windows. Build pertama perlu mengunduh image dasar Go/Alpine serta dependency Go dan dapat memerlukan beberapa menit; build berikutnya memakai cache. Volume `evidence` dan kredensial tetap digunakan, tanpa penghapusan data. Pendekatan source mengikuti [panduan repository resmi MinIO](https://github.com/minio/minio#installation).

Jika muncul `pull access denied for minio/minio` pada konfigurasi lama, gunakan Compose terbaru di repository ini lalu ulangi perintah di atas. Tidak perlu `docker login` untuk mengganti image MinIO yang sudah tidak tersedia. Jangan memakai `docker compose down -v` untuk memperbaiki masalah pull karena perintah itu menghapus volume.

- API MinIO: `http://localhost:9000`.
- Console MinIO: `http://localhost:9001`, masuk menggunakan `MINIO_ROOT_USER` dan `MINIO_ROOT_PASSWORD` di `.env`.
- Bucket default: `wbs-private`.
- Data tersimpan pada volume Docker `evidence`; restart container tidak menghapus objek.

`storage-init` membuat bucket jika belum ada, menutup akses anonim, dan mengatur user aplikasi beserta policy bucket/prefix `quarantine/`. Policy aplikasi menyediakan baca/tulis objek dan pemeriksaan bucket, tanpa hak menghapus bucket/objek atau administrasi server. Jika kredensial aplikasi sama dengan root pada konfigurasi development lama, initializer mempertahankan akun tersebut. Untuk konfigurasi baru gunakan user aplikasi terpisah sebagaimana `.env.example`.

Jalankan API dan worker seperti biasa. Worker perlu berjalan bersama ClamAV agar bukti lolos dari status PENDING; MinIO sendiri bukan pemindai malware.

## Konfigurasi

```dotenv
MINIO_ENDPOINT=http://localhost:9000
MINIO_REGION=us-east-1
MINIO_BUCKET=wbs-private
MINIO_ACCESS_KEY=wbs_app
MINIO_SECRET_KEY=wbs_app_secret_local_only

# Hanya untuk server/bootstrap MinIO lokal, bukan untuk client aplikasi.
MINIO_ROOT_USER=wbs_local
MINIO_ROOT_PASSWORD=wbs_local_secret_only
```

Nilai di atas adalah contoh development. Untuk server MinIO milik Anda, isi endpoint API, bucket dan kredensial aplikasi yang sesuai. `MINIO_ENDPOINT` harus menunjuk port API, bukan halaman console atau path bucket. API dan worker menggunakan konfigurasi yang sama.

Untuk backend yang dijalankan langsung di Windows gunakan `localhost:9000`; di dalam Compose aplikasi endpoint memakai `http://minio:9000`. Compose aplikasi meneruskan bucket dan kredensial yang sama ke API, worker dan initializer. `--env-file .env` memastikan Compose membaca konfigurasi root proyek secara eksplisit.

`MINIO_*` mendapat prioritas. Bila belum diset, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY` dan `S3_SECRET_KEY` versi sebelumnya tetap diterima. Refactor ini tidak mengganti object key, memindahkan berkas, mengubah schema database, atau menghapus bucket yang sudah ada. Gunakan bucket lama jika ingin mempertahankan akses ke bukti sebelumnya.

## Akses bukti

Browser mengunggah dan mengunduh melalui API WBS; secret MinIO tidak dikirim ke frontend. Tidak ada public URL atau presigned URL. API memeriksa izin perkara, scan READY dan checksum, serta mencatat audit sebelum mengirim unduhan. Gagal scan atau storage tidak tersedia membuat bukti tetap terkunci.

`npm.cmd run storage:check` melakukan HEAD bucket tanpa membuat atau menghapus objek. Ini memeriksa koneksi dan izin akses bucket; bukan verifikasi lengkap policy atau pemindaian malware.

Jika upload mendapat `STORAGE_ACCESS_DENIED`, periksa kredensial `.env`, jalankan `npm.cmd run native:start`, lalu restart API jika masih memakai konfigurasi lama. Launcher native memeriksa hash konfigurasi server dan memuat ulang proses milik proyek saat root credential/endpoint berubah; bucket dan data dipertahankan. Perubahan kredensial aplikasi diterapkan kembali oleh initializer. Dukungan tipe PDF, gambar, MP3 dan video dijelaskan di [API](api.md#bukti).

Tes client memakai server HTTP S3 sintetis untuk memeriksa signature, path-style request, roundtrip data biner dan error objek hilang. MinIO native Windows juga sudah diuji langsung: build, start/stop, akses bucket, unggah/unduh biner dan penolakan akses anonim berhasil. Integrasi pemindaian ClamAV tetap memerlukan scanner yang berjalan.
