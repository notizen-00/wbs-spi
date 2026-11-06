# API implementasi lokal

Prefix `/api/v1`. Sesi opaque berupa cookie `wbs_session` HttpOnly, SameSite Strict; Secure pada environment produksi. ID sesi di-hash sebagai key Redis; session menyimpan ID pengguna dan versi autentikasi. Reset sandi menaikkan versi sehingga sesi lama gagal digunakan.

Mutasi menggunakan `application/json` dan header `Origin` yang sama persis dengan `APP_ORIGIN`. Frontend dan API dilayani melalui origin yang sama. Jangan mengaktifkan CORS bebas.

| Metode   | Path                          | Keterangan                                               |
| -------- | ----------------------------- | -------------------------------------------------------- |
| GET      | `/health`, `/ready`           | Liveness; readiness database/Redis                       |
| POST     | `/auth/register`              | `{name,email,password}`, role selalu REPORTER            |
| POST     | `/auth/verify`                | `{token}`, token sekali pakai, 1 jam                     |
| POST     | `/auth/recovery`              | `{email,kind: RESET atau VERIFY}`, respons generik       |
| POST     | `/auth/reset-password`        | `{token,password}`, cabut sesi lama                      |
| POST     | `/auth/login`, `/auth/logout` | Masuk/keluar                                             |
| GET      | `/me`                         | Profil pengguna sendiri                                  |
| GET      | `/reports?page=1&q=`          | Maksimal 50 per halaman; scope akses di SQL              |
| POST     | `/reports/drafts`             | `{payload}`, membuat draf privat                         |
| PATCH    | `/reports/:id/draft`          | `{payload,expectedVersion}`, hanya draf milik sendiri    |
| GET      | `/reports/:id`                | Detail sesuai role, status, versi, timeline tersaring    |
| GET      | `/reports/:id/workspace`      | Proposal, temuan, tugas, jawaban resmi sesuai hak        |
| POST     | `/reports/:id/commands`       | Perintah di bawah, transaksi dan idempotensi             |
| GET/POST | `/reports/:id/evidence`       | Metadata atau upload `{name,data:base64}`                |
| GET      | `/evidence/:id/download`      | Otorisasi perkara, status READY, checksum, audit durable |
| GET      | `/notifications`              | 30 pemberitahuan terakhir milik sendiri                  |

Notifikasi baru juga dikirim melalui Socket.IO, namespace `/notifications`, engine path `/api/v1/socket.io`, event `notification:new`. Handshake memakai cookie sesi dan validasi origin. Lihat [protokol realtime](realtime-notifications.md).

## Pagination dan filter daftar

Daftar pada website menggunakan `GET /reports?paginated=true&page=1&pageSize=10`. Respons berbentuk `{items,page,pageSize,total,totalPages}`; `total` menghitung seluruh hasil yang memenuhi filter dan hak akses, bukan hanya halaman saat ini. Permintaan tanpa `paginated=true` tetap mengembalikan array maksimal 50 laporan untuk kompatibilitas dashboard.

| Parameter   | Nilai                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| `page`      | Nomor halaman mulai 1; halaman di luar jangkauan diarahkan ke halaman terakhir                                       |
| `pageSize`  | `10`, `25`, atau `50`                                                                                                |
| `q`         | Cari nomor/judul tanpa membedakan huruf besar-kecil; pejabat/pelaksana hanya dapat mencari nomor                     |
| `group`     | `ALL`, `ACTIVE`, `DRAFT`, `FINISHED`; ACTIVE mengecualikan draf dan status final, FINISHED mencakup COMPLETED/CLOSED |
| `stage`     | Salah satu status perkara, misalnya `INITIAL_REVIEW` atau `COMPLETED`                                                |
| `lifecycle` | `ACTIVE`, `SUSPENDED`, `COMPLETED`, atau `CLOSED`                                                                    |
| `category`  | Nama kategori yang harus sama persis                                                                                 |
| `sort`      | `newest` (default) atau `oldest`, berdasarkan waktu pembaruan dan ID untuk urutan stabil                             |

Filter digabungkan, dan seluruh query tetap dibatasi scope perkara pengguna. Website mengembalikan halaman ke 1 saat filter/jumlah per halaman berubah, menyediakan reset filter, indikator jumlah hasil, dan navigasi halaman.

## Payload laporan

Body login, register, recovery, reset-password, dan command `SUBMIT` wajib menyertakan `captchaToken` valid. Token diperiksa server melalui Google reCAPTCHA v2. Permintaan tanpa token, token gagal, atau hostname yang tidak sesuai ditolak; layanan verifikasi yang belum dikonfigurasi/tidak tersedia menghasilkan 503.

`title, category, what, who, when (YYYY-MM-DD), where, why, how, evidenceReason, confidentiality`.

`confidentiality`: `PROTECTED` atau `IDENTIFIED`. Keduanya menggunakan akun; opsi kedua berarti bersedia dihubungi, bukan publikasi identitas. Kedua opsi masih perlu pengesahan institusi. Bukti atau kronologi dapat mengandung identitas; sistem tidak mengklaim anonimisasi otomatis.

## Perintah perkara

Semua command menyertakan `action`, `expectedVersion`, `reason` (wajib), dan header `Idempotency-Key` 16–128 karakter. Kunci di-scope ke aktor + perkara, hash payload dicatat. Pengulangan payload sama mengembalikan keadaan perkara terkini setelah memeriksa ulang akses; payload berbeda dengan kunci sama ditolak 409.

| Action             | Input tambahan                              | Kewenangan                                               |
| ------------------ | ------------------------------------------- | -------------------------------------------------------- |
| SUBMIT             | —                                           | Pemilik, email terverifikasi; intake harus dikonfigurasi |
| ADVANCE            | —                                           | Pengelola, hanya SUBMITTED → INITIAL_REVIEW              |
| CLARIFY            | reason menjadi pertanyaan                   | Pengelola perkara                                        |
| RESPOND            | reason menjadi tanggapan                    | Pemilik dengan klarifikasi terbuka                       |
| PROPOSE_ASSIGNMENT | assigneeId, summary tersamarkan             | Pengelola pada verifikasi awal                           |
| DECIDE             | decision: APPROVE / RETURN                  | Pejabat, mandat sesuai jenis proposal, bukan pengusul    |
| FINDING            | content hasil dan rekomendasi               | Pemeriksa dengan penugasan aktif                         |
| REVIEW_FINDING     | decision: RETURN                            | Pengelola pada review hasil                              |
| PROPOSE_RESULT     | executorId, instruction                     | Pengelola pada review hasil                              |
| EXECUTE            | taskId, execution, evidenceId               | Pelaksana tugas, bukti READY milik sendiri               |
| REVIEW_EXECUTION   | taskId, decision: VERIFY / RETURN           | Pengelola berbeda dari pelaksana, bukti masih READY      |
| PROPOSE_CLOSURE    | outcome: CLOSED / COMPLETED, response aman  | Pengelola, COMPLETED harus seluruh tugas terverifikasi   |
| SUSPEND            | evaluationAt ISO, conditions                | Pengelola perkara; kewenangan institusi belum final      |
| RESUME             | reason hasil evaluasi                       | Pengelola, kembali ke tahap asal                         |
| REQUEST_REOPEN     | reason informasi baru                       | Pemilik, perkara final                                   |
| PROPOSE_REOPEN     | targetStage: INITIAL_REVIEW / INVESTIGATION | Pengelola, ada request pending                           |
| CONFLICT           | reason                                      | Petugas terkait, mencabut akses dan penugasannya         |

Keputusan tidak memakai PATCH status bebas. Proposal yang dikembalikan memiliki keputusan final tersendiri; revisi dibuat sebagai proposal baru. Snapshot dan keputusan terdahulu tidak ditimpa. API umum tidak menyediakan DELETE perkara.

## Bukti

Upload dibatasi 20 MiB dan 10 berkas per perkara. Tipe diperiksa dari isi biner menggunakan `file-type`, lalu dicocokkan dengan ekstensi; MIME dari browser tidak dipercaya. Allowlist backend dan UI memakai kontrak bersama. Nama berkas disanitasi. Objek MinIO berada dalam bucket privat dengan key acak di prefix karantina. Worker membaca objek, memverifikasi checksum SHA-256, dan mengirim ke ClamAV INSTREAM. Hasil scan gagal tetap tertutup; setelah lima percobaan perlu investigasi operator.

| Jenis  | Ekstensi                                                    | MIME                                                                                                                    |
| ------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| PDF    | pdf                                                         | application/pdf                                                                                                         |
| Gambar | jpg, jpeg, png, gif, webp, bmp, tif, tiff, avif, heic, heif | image/jpeg, image/png, image/gif, image/webp, image/bmp, image/tiff, image/avif, image/heic, image/heif                 |
| Audio  | mp3                                                         | audio/mpeg                                                                                                              |
| Video  | mp4, mov, webm, mkv, avi, mpeg, mpg, 3gp, 3g2, m4v          | video/mp4, video/quicktime, video/webm, video/matroska, video/vnd.avi, video/mpeg, video/3gpp, video/3gpp2, video/x-m4v |

SVG/HTML/script tidak diterima. MIME MPEG dan HEIF sequence dari detektor dinormalisasi ke keluarga MIME yang sesuai. Ekstensi palsu, base64 tidak valid dan berkas yang tidak dikenali ditolak 422; berkas terlalu besar ditolak 413.

Download melalui API, bukan public URL atau presigned URL. Konten diambil dan diverifikasi terlebih dahulu; audit akses di-commit sebelum respons. Header attachment, no-store, dan nosniff diterapkan. Upload base64 adalah kompromi versi pengembangan; streaming multipart diperlukan untuk kapasitas produksi.

## Respons dan batas

401 sesi tidak sah, 403 aksi tidak diizinkan, 404 objek tidak boleh diketahui, 409 konflik versi/idempotensi/tahap, 413 ukuran berkas/request berlebih, 422 input/domain, 429 rate limit, 503 dependensi tidak tersedia. Error MinIO memiliki kode `STORAGE_ACCESS_DENIED`, `STORAGE_BUCKET_MISSING`, atau `STORAGE_UNAVAILABLE` dan pesan yang dapat ditindaklanjuti. Detail SQL, kredensial dan stack tidak dikembalikan.

Kontrak ini dokumentasi implementasi, belum OpenAPI-generated client. API memiliki otorisasi dan pembatasan dasar; pengujian keamanan menyeluruh tetap diperlukan.

### Pemisahan portal pelapor dan internal

Hanya `REPORTER` dapat membuat dan mengedit draf, mengirim aduan, menjawab klarifikasi, serta meminta pembukaan kembali. Akun internal menerima HTTP 403 untuk tindakan tersebut. Pelapor hanya mengakses laporan miliknya; petugas internal hanya mengakses perkara bukan draf dengan penugasan aktif dan tanpa konflik kepentingan. Kepemilikan laporan lama tidak memberikan akses pelapor kepada akun yang sudah berganti menjadi petugas. `ADMIN` merupakan administrator teknis dan tidak memiliki akses isi perkara.

### Diagnostik pemindaian bukti

Daftar bukti mengembalikan `scan_error` (alasan aman untuk pengguna), `retry_available`, dan `retry_scheduled`. `POST /api/v1/evidence/:id/retry` mengantrekan ulang hanya berkas ERROR dengan scope perkara dan pembatasan rate yang sama; READY dan REJECTED ditolak 409. Pengulangan dicatat pada audit akses. Berkas tetap tidak dapat diunduh sebelum READY. Migrasi `20261106080000_evidence_scan_diagnostics` menambah alasan dan jadwal retry serta membuka kesempatan ulang untuk ERROR lama.
