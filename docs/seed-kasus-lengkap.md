# Seeder satu kasus lengkap sampai Selesai

Seeder ini membuat satu kasus **sintetis** tentang pungutan tambahan Rp150.000 pada layanan administrasi yang seharusnya gratis. Seluruh tokoh, unit, kejadian, dan bukti adalah rekaan untuk pengembangan/UAT.

## Menjalankan

Dari root proyek, pastikan PostgreSQL, MinIO, dan ClamAV tersedia. Gunakan database development yang sudah dimigrasi. Seeder menjalankan command bisnis secara langsung; API, web, Redis, Mailpit, dan worker tidak diperlukan selama seed. API/web dan Redis tetap diperlukan untuk login serta melihat hasil di portal; worker dan SMTP diperlukan untuk mengirim antrean email yang dihasilkan.

```powershell
npm.cmd run db:migrate
npm.cmd run native:start
npm.cmd run native:scanner:start
npm.cmd run storage:check
npm.cmd run scanner:check

# Isi SEED_PASSWORD di .env terlebih dahulu; minimal 12 karakter.
npm.cmd run db:seed:case
```

Jika MinIO/ClamAV belum dipasang, ikuti [instalasi native di README](../README.md). Jangan menjalankan worker pemindaian bersamaan dengan seeder ini agar dua proses tidak memindai bukti seed yang sama saat penyiapan.

Perintah ini juga menjalankan seed lima akun demo dan mandat pejabat. Password akun yang sudah ada tetap dipertahankan. Seed ditolak pada `NODE_ENV=production`. Seeder tidak menghapus laporan atau mereset database.

## Cerita dan urutan penanganan

| Urutan | Pelaku | Kejadian dalam seed | Hasil |
| --- | --- | --- | --- |
| 1 | Pelapor | Membuat draf dugaan pungutan Rp150.000 tanpa kuitansi pada layanan gratis; melampirkan PDF catatan kejadian | Draf privat dengan bukti sintetis |
| 2 | Pelapor | Mengirim laporan lengkap 5W+1H | Nomor laporan diterbitkan, status Terkirim |
| 3 | Pengelola | Memulai verifikasi awal dan menanyakan dasar tarif serta kuitansi | Klarifikasi tercatat |
| 4 | Pelapor | Menjelaskan bahwa tarif resmi gratis dan tidak ada kuitansi | Klarifikasi terjawab |
| 5 | Pengelola | Mengusulkan pemeriksa dengan ringkasan tersamarkan | Menunggu persetujuan penugasan |
| 6 | Pejabat | Menyetujui penugasan sesuai mandat | Pemeriksa mendapat akses dan penugasan |
| 7 | Pemeriksa | Menyerahkan hasil pemeriksaan sintetis: pungutan tidak berdasar; rekomendasi penghentian, pengembalian dana simulasi, pengumuman tarif, dan pengarahan petugas | Review hasil |
| 8 | Pengelola | Mengusulkan pelaksana dan instruksi perbaikan | Menunggu persetujuan hasil |
| 9 | Pejabat | Menyetujui hasil dan tindak lanjut | Tugas pelaksana dibuat |
| 10 | Pelaksana | Mengunggah PDF berita acara sintetis dan menyerahkan pelaksanaan setelah bukti lolos scan | Tugas diserahkan |
| 11 | Pengelola | Memverifikasi pelaksanaan dan bukti, lalu mengusulkan penutupan beserta jawaban resmi | Tugas VERIFIED, menunggu persetujuan penutupan |
| 12 | Pejabat | Menyetujui penutupan | Perkara COMPLETED/Selesai; jawaban resmi terbit |

Jawaban resmi menjelaskan penghentian pungutan, pencatatan pengembalian dana simulasi, pemasangan informasi layanan gratis, dan pengarahan petugas. Seeder tidak melakukan pembayaran atau menghubungi unit/orang nyata.

## Data yang terbentuk

- Satu laporan dengan ID tetap `2f6c9df0-7a42-4f37-8d82-3ae1e35bc001`; nomor penerimaan dibuat melalui sequence aplikasi.
- Klarifikasi terjawab, akses perkara per role, satu penugasan pemeriksa, dan satu hasil pemeriksaan.
- Tiga usulan yang disetujui beserta keputusan dan referensi mandat: penugasan, hasil, dan penutupan.
- Satu tugas tindak lanjut berstatus `VERIFIED` dan satu jawaban resmi dengan hasil `COMPLETED`.
- Dua PDF yang benar-benar disimpan ke MinIO, diperiksa checksum, dan dipindai melalui ClamAV sebelum diberi status `READY`.
- Event, snapshot versi, idempotency record, notifikasi portal, antrean email, dan audit unggah bukti melalui service aplikasi.

Pemeriksaan antivirus pada seed berjalan langsung, sehingga tidak perlu menunggu worker. Seeder tidak memalsukan hasil antivirus ketika scanner mati. Seluruh langkah berlangsung saat perintah dijalankan; timestamp menunjukkan waktu seed, bukan simulasi penanganan beberapa hari. Tanggal kejadian pada isi laporan adalah 2 November 2026.

## Melihat hasil

Jalankan `npm.cmd run dev`, kemudian buka http://localhost:3000. Login dengan password akun demo yang berlaku:

| Akun | Yang dapat diperiksa |
| --- | --- |
| `pelapor@example.test` | Laporan Selesai, klarifikasi, riwayat publik, bukti yang dapat diakses, dan jawaban resmi |
| `pengelola@example.test` | Riwayat internal, hasil pemeriksaan, usulan/keputusan, serta tugas terverifikasi |
| `pejabat@example.test` | Usulan dan hasil keputusan sesuai pembatasan akses pejabat |
| `pemeriksa@example.test` | Perkara yang ditugaskan dan hasil pemeriksaannya |
| `pelaksana@example.test` | Tugasnya sendiri yang telah terverifikasi dan PDF berita acara miliknya |

Seeder mencetak nomor laporan dan ID setelah berhasil. Cari nomor tersebut pada daftar laporan. Karena kasus sudah final, alur normal tidak lagi menampilkan tindakan lanjutan. Gunakan panduan [role dan alur pelaporan](role-dan-alur-pelaporan.md) jika ingin menguji tahapan secara manual dengan laporan baru.

## Menjalankan ulang dan kegagalan

ID laporan dan kunci langkah dibuat tetap. Menjalankan ulang setelah berhasil mengembalikan kasus yang sama tanpa menambah event, keputusan, tugas, atau notifikasi. Tidak ada reset otomatis terhadap kasus final. Jalankan hanya satu proses seeder pada satu waktu.

Jika proses terhenti di tengah jalan, perbaiki layanan lalu jalankan ulang; langkah command yang sudah berhasil dilewati. Bukti yang sudah tercatat digunakan kembali. Jangan mengubah perkara demo secara manual ketika proses seed belum selesai, karena langkah berikutnya tetap mengikuti skenario tetap.

Jika upload ke MinIO berhasil tetapi transaksi metadata database gagal, objek tanpa metadata dapat tertinggal; seeder tidak menghapus objek secara otomatis. Lihat keluaran error dan konfigurasi layanan sebelum mengulang.

Implementasi: [seed kasus](../apps/api/src/seed-completed-case.ts), [seed akun](../apps/api/src/seed.ts). Pengujian integrasi menggunakan storage dan hasil scanner fixture secara eksplisit untuk menguji pemulihan, penyelesaian, serta pengulangan; bukan bukti integrasi antivirus/MinIO nyata pada mesin pengguna.
