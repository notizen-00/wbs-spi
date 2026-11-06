# Super admin: kategori, logo, dan pengaturan layanan

Role `SUPER_ADMIN` mengelola kategori laporan serta identitas situs. Role ini tidak otomatis mempunyai akses ke isi perkara, tugas penanganan, atau keputusan pejabat. Akun tidak dapat dibuat melalui registrasi publik.

## Membuat akun

Jalankan migrasi, lalu seeder khusus:

```powershell
npm.cmd run db:migrate
npm.cmd run db:seed:admin
```

Pada development, default email adalah `superadmin@example.test`. Jika `SUPER_ADMIN_PASSWORD` tidak diisi, script membuat password acak dan menyimpannya ke `.local/super-admin-credentials.txt` yang diabaikan Git. File tersebut hanya dibuat ketika akun baru dibuat. Masuk melalui `/login`.

Untuk menentukan kredensial sendiri, isi `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_NAME` (opsional), dan `SUPER_ADMIN_PASSWORD` minimal 12 karakter pada environment atau `.env`. Production mewajibkan email dan password eksplisit. Script aman diulang: akun yang sudah ada tidak diubah passwordnya. Email yang telah digunakan role lain ditolak, bukan dipromosikan otomatis.

## Menu

- **Dashboard:** jumlah kategori dan riwayat perubahan administrasi terbaru.
- **Kategori laporan** (`/admin/categories`): tambah, lihat, ubah nama/deskripsi/urutan, aktifkan/nonaktifkan, dan hapus kategori.
- **Pengaturan situs** (`/admin/settings`): nama aplikasi, institusi, tagline, logo, email/telepon bantuan, serta alamat atau keterangan layanan.

Kategori yang sudah dipakai laporan tidak dapat dihapus atau diganti namanya. Nonaktifkan kategori untuk menghentikan pemakaian baru tanpa mengubah riwayat. Urutan terkecil ditampilkan lebih dahulu. Nama kategori tidak boleh duplikat meskipun huruf besar-kecil berbeda. Formulir menggunakan katalog aktif dari database; server menolak pengiriman dengan kategori yang tidak aktif/tidak tersedia.

Logo menerima PNG, JPG, dan WebP maksimal 1 MiB. Server memeriksa isi dan MIME, bukan hanya ekstensi. SVG tidak diterima. Logo disimpan sebagai data URI di database pengaturan, sehingga belum memerlukan MinIO untuk logo. Menghapus logo mengembalikan ikon default. Logo/nama ditampilkan di header publik, halaman akun, dan sidebar; kontak bantuan ditampilkan pada landing page. Tagline juga digunakan di halaman akun/footer. Perubahan langsung diterapkan setelah disimpan dan dimuat kembali saat halaman direload.

Setiap perubahan disimpan bersama identitas akun pelaku dan timestamp di `admin_audits`; update/delete audit ditolak oleh trigger database. Versi data mencegah penimpaan perubahan admin lain; jika mendapat pesan konflik versi, muat ulang sebelum mengedit lagi.

## API

- `GET /api/v1/public/settings`: identitas publik, logo, kontak bantuan, dan nama kategori aktif; tidak berisi informasi akun atau audit.
- `GET/POST /api/v1/admin/categories`, `PATCH/DELETE /api/v1/admin/categories/:id`.
- `GET/PATCH /api/v1/admin/settings`.
- `GET /api/v1/admin/audits`: 30 perubahan terbaru.

Endpoint admin memerlukan sesi super admin aktif/terverifikasi. Mutasi memakai `Origin`, JSON, rate limit, dan `expectedVersion` untuk update/delete. Sesuai konfigurasi CAPTCHA, login development melewati challenge, sedangkan production memerlukannya.
