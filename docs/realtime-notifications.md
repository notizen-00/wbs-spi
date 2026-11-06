# Notifikasi realtime WebSocket

Notifikasi portal memakai **Socket.IO pada NestJS** dan Redis Pub/Sub untuk menghubungkan proses API/worker. Tidak memerlukan service baru selain Redis yang sudah digunakan untuk sesi.

## Menjalankan

```powershell
npm.cmd ci
npm.cmd run dev
# Terminal lain untuk email dan scan bukti:
npm.cmd run worker
```

Tidak ada migrasi database baru. `REDIS_URL` harus sama untuk API dan worker. `NOTIFICATION_REDIS_CHANNEL` opsional, default `wbs:notifications:v1`; gunakan nilai sama pada seluruh proses deployment. `APP_ORIGIN` harus tepat sesuai origin browser, termasuk protocol dan port.

Nuxt development proxy meneruskan upgrade WebSocket melalui `/api`. Konfigurasi Nginx juga meneruskan upgrade, sehingga frontend selalu menggunakan origin yang sama, baik lokal native maupun Compose. Tidak ada port WebSocket terpisah.

## Alur

1. Command perkara menyimpan perubahan, audit, outbox email dan notifikasi PostgreSQL dalam transaksi yang sama.
2. Setelah commit, API memublikasikan ID notifikasi ke Redis. Kegagalan publikasi tidak membatalkan keputusan yang sudah tersimpan.
3. Setiap instance API menerima sinyal, mengambil notifikasi dari PostgreSQL dan memeriksa ulang sesi sebelum mengirim ke socket pengguna tersebut.
4. UI memperbarui lonceng, jumlah pembaruan baru dan daftar tanpa refresh. Event dengan ID yang sama tidak menggandakan daftar/badge.
5. Saat reconnect, UI mengambil kembali 30 notifikasi terbaru melalui REST. Jika Redis subscriber tersambung kembali, server mengirim sinyal sinkronisasi tanpa isi perkara.

Email dan notifikasi aplikasi dipisahkan: SMTP gagal tidak menahan notifikasi command yang sudah di-commit. Worker tetap mengirim email umum melalui outbox; notifikasi email memakai ID yang sama sehingga tidak menghasilkan duplikasi. Retry pengiriman command dengan idempotency key sama tidak membuat notifikasi baru.

## Protokol dan akses

- Transport: WebSocket, Socket.IO v4; namespace `/notifications`.
- Engine path: `/api/v1/socket.io`.
- Autentikasi: cookie HttpOnly `wbs_session`, divalidasi dengan sesi Redis dan akun/versi autentikasi PostgreSQL yang sama dengan REST.
- Origin handshake harus sama dengan `APP_ORIGIN`. Token tidak ditempatkan di query string, localStorage atau payload browser.
- Room ditentukan server dari pengguna terautentikasi. Tidak ada event client untuk memilih penerima atau bergabung ke room pengguna lain.
- Sesi diperiksa ulang sebelum setiap pengiriman, dan koneksi idle diperiksa setiap 30 detik. Sesi yang dicabut tidak menerima pesan berikutnya.

Server mengirim:

```typescript
// notification:new
{ id: string, message: string, created_at: string }
// notifications:ready dan notifications:sync: tanpa isi perkara
```

Payload hanya pesan umum; tidak berisi kronologi, bukti, identitas, nomor perkara, catatan internal atau token. `GET /api/v1/notifications` tetap menjadi riwayat durable terfilter ke pengguna saat ini.

Badge menghitung pembaruan baru selama sesi halaman; membuka panel mengosongkan badge tersebut. Status baca lintas perangkat belum disimpan ke database. Semua listener, timer dan koneksi frontend dibersihkan saat logout/unmount; respons HTTP lama tidak dapat mengembalikan notifikasi akun sebelumnya.

Redis Pub/Sub bersifat best effort, bukan penyimpanan notifikasi. Bila sinyal terlewat, notifikasi tetap ada di PostgreSQL dan dipulihkan lewat REST ketika reconnect/panel dibuka. Kehilangan koneksi tidak membuat keputusan perkara dijalankan ulang.

## Pengujian

- Tes WebSocket nyata dengan database sementara: penolakan sesi/origin tidak sah, pemisahan penerima, event join palsu, payload aman dan pencabutan sesi.
- Tes transaksi: notifikasi tersedia sebelum broadcast dan ketika email belum diproses; retry command tidak memublikasikan ulang.
- Tes browser mobile: badge realtime, deduplikasi, sinkronisasi setelah reconnect, logout dan lebar layar tanpa overflow.
- Smoke test lokal dengan Redis nyata dan sesi terautentikasi pada database/channel terisolasi berhasil, termasuk pencabutan sesi. Handshake juga terverifikasi melalui proxy Nuxt pada port 3000.

Referensi: [NestJS gateways](https://docs.nestjs.com/websockets/gateways), [Socket.IO rooms](https://socket.io/docs/v4/rooms/).
