# Flowchart — WBS Universitas Jember

Draf 0.1 • Pendamping PRD • Berdasarkan SOP draf 0.1 tanggal 5 November 2026.
Diagram Mermaid dapat dirender pada viewer Markdown yang mendukung Mermaid. Label status teknis merupakan usulan, sedangkan kendali mengikuti SOP. Diagram dibagi agar jalur koreksi terbaca.

## 1. Akun dan pengiriman — sumber halaman 1

```mermaid
flowchart TD
    A["Pilih Buat Laporan"] --> B{"Masuk dan email terverifikasi?"}
    B -->|Belum| C["Masuk atau daftar dan verifikasi email"]
    C --> B
    B -->|Ya| D["Isi 5W+1H dan kerahasiaan"]
    D --> E["Unggah bukti atau isi alasan dan sumber bukti"]
    E --> F["Pratinjau laporan"]
    F -->|Perbaiki| D
    F -->|Simpan draf privat| G["Draf hanya untuk pemilik"]
    G --> D
    F -->|Konfirmasi kirim| H{"Validasi server berhasil?"}
    H -->|Tidak| I["Tampilkan error tanpa menghilangkan isian"]
    I --> F
    H -->|Ya| J["Simpan snapshot, nomor, waktu dan audit"]
    J --> K["Dikirim lalu verifikasi awal"]
```

## 2. Siklus bukti — sumber halaman 1, rincian worker usulan teknis

```mermaid
flowchart TD
    A["Unggah dengan otorisasi"] --> B["Simpan di karantina privat"]
    B --> C["Catat metadata dan antrekan scan"]
    C --> D{"Hasil pemindaian"}
    D -->|Lolos| E["Tandai bukti tersedia"]
    D -->|Terinfeksi atau format ditolak| F["Tolak dan blokir akses"]
    D -->|Layanan gagal| G["Tetap terkunci dan jadwalkan retry"]
    G --> C
    E --> H{"Izin akses perkara masih sah?"}
    H -->|Ya| I["Pratinjau atau stream unduhan tercatat"]
    H -->|Tidak| J["Tolak akses"]
```

Pemindaian tidak otomatis menjadi syarat penerbitan tanda terima. Lampiran pending tetap tidak dapat diakses; status scan diperlihatkan terpisah.

## 3. Verifikasi sampai hasil — sumber halaman 2

```mermaid
flowchart TD
    A["Laporan dikirim"] --> B["Verifikasi kelengkapan, kewenangan, risiko, konflik"]
    B --> C{"Layak dilanjutkan?"}
    C -->|Butuh informasi| D["Jalur klarifikasi"]
    D --> B
    C -->|Tidak layak setelah telaah| E["Usulan penutupan dini"]
    C -->|Ya| F["Usulkan disposisi tersamarkan dan penugasan"]
    F --> G["Periksa mandat, konflik dan pemisahan pengusul"]
    G --> H{"Pejabat menyetujui penugasan?"}
    H -->|Perbaiki usulan| F
    H -->|Ya| I["Tim memeriksa dan mencatat bukti"]
    I --> J["Susun hasil dan rekomendasi"]
    J --> K{"Review verifikator/pemeriksa memadai?"}
    K -->|Tidak| I
    K -->|Ya| L["Pejabat menilai hasil dan tindak lanjut"]
    L --> M{"Disetujui?"}
    M -->|Perbaikan hasil| J
    M -->|Ya| N["Pelaksanaan tindak lanjut"]
```

Jalur perbaikan hasil setelah penilaian pejabat adalah detail implementasi usulan agar revisi tetap tercatat; mandat dan tahapan revisi final perlu ditetapkan.

## 4. Tindak lanjut dan penutupan — sumber halaman 3

```mermaid
flowchart TD
    A["Hasil dan tindak lanjut disetujui"] --> B["Pelaksana menjalankan tindak lanjut"]
    B --> C["Serahkan bukti pelaksanaan"]
    C --> D{"Verifikator/Pemeriksa memverifikasi bukti wajib"}
    D -->|Belum memadai| B
    D -->|Memadai| E["Usulkan penutupan dan jawaban resmi aman"]
    E --> F{"Pejabat menyetujui?"}
    F -->|Belum| E
    F -->|Ya| G{"Dasar penutupan"}
    G -->|Tindak lanjut tuntas| H["Selesai"]
    G -->|Alasan lain disetujui| I["Ditutup"]
    H --> J["Pelapor menerima jawaban aman"]
    I --> J
```

## 5. Klarifikasi dan penutupan dini — sumber halaman 3

```mermaid
flowchart TD
    A["Informasi belum memadai"] --> B["Simpan tahap asal dan minta klarifikasi bertenggat"]
    B --> C{"Jawaban diterima?"}
    C -->|Ya| D["Catat jawaban dan kembali ke tahap asal"]
    C -->|Tenggat lewat| E["Petugas menelaah bukti yang masih tersedia"]
    E --> F{"Bukti layak masih tersedia?"}
    F -->|Ya| D
    F -->|Dasar tidak cukup setelah telaah| G["Usulkan penutupan beralasan"]
    H["Di luar kewenangan atau duplikat"] --> G
    G --> I{"Pejabat menyetujui?"}
    I -->|Belum| J["Telaah atau perbaiki usulan"]
    J --> G
    I -->|Ya| K["Ditutup dan jawaban aman"]
```

Tidak ada penutupan otomatis karena pelapor diam. Detail perlakuan jawaban terlambat harus ditetapkan dalam kebijakan.

## 6. Penundaan — sumber halaman 3

```mermaid
flowchart TD
    A["Perlu penundaan beralasan"] --> B["Catat alasan, penanggung jawab dan tahap asal"]
    B --> C["Tetapkan tanggal evaluasi dan syarat lanjut"]
    C --> D["Ditunda sesuai kewenangan"]
    D --> E["Evaluasi penundaan"]
    E --> F{"Syarat lanjut terpenuhi?"}
    F -->|Ya| G["Kembali ke tahap asal dan catat audit"]
    F -->|Belum| H["Catat evaluasi dan jadwal berikutnya"]
    H --> D
```

Pihak berwenang menetapkan perubahan evaluasi; perpanjangan bukan aksi otomatis worker.

## 7. Pembukaan kembali — sumber halaman 3

```mermaid
flowchart TD
    A["Perkara Selesai atau Ditutup"] --> B["Ajukan alasan atau bukti baru"]
    B --> C["Permintaan pembukaan kembali tercatat"]
    C --> D{"Pejabat menyetujui?"}
    D -->|Tidak| E["Simpan keputusan dan status akhir tetap"]
    D -->|Ya| F["Tetapkan tahap tujuan dan akses yang sah"]
    F --> G["Buka kembali tanpa mengubah riwayat lama"]
```

## 8. Gerbang setiap keputusan — penjabaran teknis kendali SOP

```mermaid
flowchart TD
    A["Permintaan tindakan"] --> B{"Akun, peran, mandat dan akses perkara sah?"}
    B -->|Tidak| X["Tolak dan audit percobaan sensitif"]
    B -->|Ya| C{"Ada konflik kepentingan?"}
    C -->|Ya| D["Cabut akses pihak berkonflik dan alihkan"]
    C -->|Tidak| E{"Keputusan terhadap usulan sendiri?"}
    E -->|Ya| X
    E -->|Tidak| F{"Tahap dan versi masih sesuai?"}
    F -->|Tidak| Y["Konflik versi atau transisi ditolak"]
    F -->|Ya| G["Transaksi keputusan, status, audit dan outbox"]
    G --> H["Commit lalu notifikasi umum lewat worker"]
```

## 9. Arsitektur aplikasi — usulan

```mermaid
flowchart TD
    U["Browser pelapor dan petugas"] --> P["Reverse proxy HTTPS"]
    P --> N["Nuxt frontend"]
    P --> A["NestJS API"]
    A --> DB["PostgreSQL"]
    A --> R["Redis sesi dan antrean"]
    A --> S["Storage bukti privat"]
    W["NestJS worker"] --> DB
    W --> R
    W --> S
    W --> V["Layanan pemindaian"]
    W --> M["SMTP institusi"]
```

Nuxt memanggil `/api/v1` pada origin yang sama. Reverse proxy meneruskan jalur API ke NestJS. Storage dan database tidak diekspos langsung ke browser.
