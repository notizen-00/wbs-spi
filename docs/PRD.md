# PRD — WBS Universitas Jember

Versi 0.1 • 6 November 2026 • Draf untuk pembahasan

## 1. Ringkasan dan dasar

Bangun aplikasi WBS untuk menerima laporan dari akun terverifikasi, memverifikasi kelayakan, menugaskan pemeriksaan, menyetujui tindak lanjut, serta menutup atau membuka kembali perkara dengan identitas terlindungi dan jejak audit.

Sumber: `SOP_WBS_UNEJ_Bagan_Alur.pdf`, draf SOP 0.1 tanggal 5 November 2026, halaman 1–3; `design.md` untuk arahan UI. Bila ada perbedaan, alur SOP menjadi dasar; keputusan yang belum ditetapkan harus dibahas UNEJ. Dokumen pendamping: `flowcharts.md` dan `technical-spec.md`.

Stack yang diminta: NestJS backend, Nuxt frontend, PostgreSQL database, Redis. Seluruh rincian teknis dan target nonfungsional di bawah adalah usulan implementasi, bukan tambahan kebijakan resmi.

## 2. Tujuan dan indikator

| Tujuan | Indikator penerimaan |
|---|---|
| Laporan dapat diproses dari awal sampai selesai | Skenario pengiriman, pemeriksaan, tindak lanjut, dan penutupan lolos UAT |
| Menjaga akses sesuai perkara dan mandat | Seluruh skenario akses silang, konflik, serta persetujuan sendiri ditolak |
| Keputusan dapat ditelusuri | Setiap transisi menyimpan aktor, waktu, alasan, versi, dan keputusan terkait |
| Pelapor memahami perkembangan | Nomor penerimaan, status aman, permintaan klarifikasi, dan jawaban resmi tersedia |
| Bukti terlindungi | Tidak ada akses unduh/pratinjau sebelum lolos pemindaian dan otorisasi |

Baseline jumlah pengguna, volume laporan, ukuran berkas, dan jam operasional belum tersedia. Tetapkan sebelum uji beban.

## 3. Ruang lingkup

Rilis operasional awal mencakup akun, verifikasi email, draf privat, 5W+1H, pilihan kerahasiaan, unggahan bukti, tanda terima, verifikasi awal, klarifikasi, konflik kepentingan, disposisi, persetujuan penugasan, pemeriksaan, review hasil, persetujuan hasil, tindak lanjut, penutupan, penundaan, pembukaan kembali, izin identitas khusus, audit, dan notifikasi umum.

Di luar lingkup awal: aplikasi mobile native, laporan tanpa akun, publikasi perkara, AI penentu kebenaran laporan, integrasi WhatsApp, tanda tangan elektronik tersertifikasi, multi-institusi/multi-tenant, serta SSO kampus. SSO dapat ditambahkan setelah kebutuhan identitas disetujui.

Rilis bertahap adalah tahapan pembangunan. Jangan mengoperasionalkan sistem yang menerima laporan nyata sebelum seluruh kendali wajib dan jalur pengecualian siap.

## 4. Pengguna dan kewenangan

| Peran | Fungsi | Pembatasan |
|---|---|---|
| Pelapor | Mengelola draf/laporan sendiri, jawaban klarifikasi, permintaan pembukaan kembali | Akun terverifikasi untuk kirim; hanya data sendiri dan informasi aman |
| Pengelola/verifikator | Verifikasi, usulan penugasan, review, verifikasi pelaksanaan, usulan penutupan | Tidak menyetujui usulan sendiri |
| Tim pemeriksa | Pemeriksaan perkara yang ditugaskan, bukti, hasil, rekomendasi | Akses berdasarkan penugasan aktif dan bebas konflik |
| Pejabat berwenang | Keputusan penugasan, hasil/tindak lanjut, penutupan, pembukaan kembali | Mandat sah, bebas konflik, berbeda dari pengusul |
| Pelaksana tindak lanjut | Menjalankan tindakan dan menyerahkan bukti | Hanya tugas dan informasi yang diperlukan |
| Administrator teknis — usulan | Akun internal, konfigurasi, operasional | Tidak otomatis berhak membaca perkara, bukti, atau identitas |

Pemisahan pengelola/verifikator dan pelaksana, delegasi pejabat, serta pemberi izin identitas harus ditetapkan institusi. Peran sistem saja tidak memberikan akses ke seluruh perkara. Kewenangan ditentukan oleh peran, hubungan dengan perkara, mandat, konflik, dan izin spesifik.

## 5. Kebutuhan fungsional dan penerimaan

Semua kebutuhan berikut wajib untuk rilis operasional kecuali ditandai opsional.

| ID | Kebutuhan | Kriteria penerimaan |
|---|---|---|
| FR-01 | Registrasi, masuk, verifikasi email, keluar, pemulihan akun | Token verifikasi sekali pakai dan kedaluwarsa; akun belum terverifikasi gagal mengirim; sesi dapat dicabut |
| FR-02 | Draf privat | Pemilik dapat menyimpan/memperbarui; pengguna lain termasuk petugas tidak memperoleh isi draf; konflik versi tidak menimpa data diam-diam |
| FR-03 | Form 5W+1H dan kerahasiaan | Enam unsur dan bukti atau alasan/sumber bukti tersedia; pilihan kerahasiaan mengikuti konfigurasi resmi; validasi server berlaku |
| FR-04 | Pratinjau dan pengiriman | Pengguna mengonfirmasi; satu pengiriman menghasilkan satu nomor, waktu server, dan snapshot versi; retry tidak menggandakan laporan |
| FR-05 | Bukti | Berkas dikarantina, dipindai, dan hanya bisa diakses setelah lolos; gagal pemindaian tetap tertutup; metadata dan checksum tercatat |
| FR-06 | Pelacakan pelapor | Pemilik melihat status aman, timeline publik terbatas, dan pembaruan; catatan internal dan identitas pihak lain tidak ikut terkirim |
| FR-07 | Verifikasi awal | Petugas mencatat kelengkapan, kewenangan, risiko, konflik, dan hasil; jalur lanjut, klarifikasi, atau usulan penutupan tersedia |
| FR-08 | Klarifikasi | Permintaan punya tenggat dan tahap asal; pelapor menjawab dalam aplikasi; respons ditelaah lalu kembali ke tahap asal; tanpa respons tidak otomatis ditutup bila bukti layak masih ada |
| FR-09 | Konflik kepentingan | Pemeriksaan dilakukan sebelum penugasan/keputusan; pihak berkonflik dicabut dari akses perkara dan dialihkan ke pihak berwenang; konflik tidak sekadar banner |
| FR-10 | Disposisi dan penugasan | Usulan memakai ringkasan tersamarkan; pejabat dapat setuju/kembalikan; pengusul yang sama ditolak oleh backend |
| FR-11 | Pemeriksaan | Tim hanya melihat penugasan aktif; jurnal, bukti, rencana, progres, hasil dan rekomendasi tercatat; revisi mempertahankan versi terdahulu |
| FR-12 | Review dan persetujuan hasil | Review belum memadai kembali ke tim; hasil memadai diajukan ke pejabat; pengembalian memuat alasan; hasil/tindakan tidak berlaku sebelum persetujuan |
| FR-13 | Tindak lanjut | Tugas memiliki pelaksana dan bukti wajib; pengelola memverifikasi bukti; unggahan saja tidak menyelesaikan perkara |
| FR-14 | Penutupan dan jawaban resmi | Pejabat memutus usulan; Selesai untuk tindak lanjut tuntas, Ditutup untuk alasan lain; jawaban aman disetujui dan unduhannya diperiksa akses |
| FR-15 | Penutupan dini | Alasan di luar kewenangan, duplikat, atau dasar tidak cukup setelah telaah dapat diusulkan; keputusan pejabat diperlukan; penolakan kembali ke telaah/perbaikan |
| FR-16 | Penundaan | Alasan, penanggung jawab, tanggal evaluasi, syarat lanjut, dan tahap asal wajib tercatat; pelanjutan kembali ke tahap asal sesuai evaluasi |
| FR-17 | Pembukaan kembali | Alasan/bukti baru diajukan; pejabat memutus dan menetapkan tahap tujuan; keputusan lama tetap utuh; permintaan saja tidak membuka perkara |
| FR-18 | Izin identitas | Identitas disamarkan; pembukaan hanya dengan izin khusus sah, alasan, dan audit; cakupan serta masa izin dikonfigurasi setelah mandat disetujui |
| FR-19 | Audit | Perubahan dan akses sensitif dicatat; aplikasi tidak dapat mengubah/menghapus event terdahulu; log tidak berisi isi bukti atau kredensial |
| FR-20 | Notifikasi dan tenggat | Email hanya pemberitahuan umum; kronologi, bukti, identitas tidak dikirim; pengiriman gagal dapat diulang tanpa mengulang keputusan bisnis |
| FR-21 | Antrean dan pencarian | Pagination/filter berdasarkan akses; nomor dan ringkasan aman dapat dicari; total dan ekspor tidak membocorkan perkara di luar akses |
| FR-22 | Konfigurasi kebijakan | Kalender kerja, SLA, kategori kerahasiaan, mandat, retensi, dan batas berkas memiliki versi dan audit; perubahan tidak menulis ulang histori |
| FR-23 | Operasional | Backup database dan bukti dapat dipulihkan bersama; kegagalan worker dan pemindaian terlihat oleh operator tanpa membuka isi perkara |

Permintaan penarikan laporan tidak menghapus perkara atau bukti. Proses penarikan rinci belum ditentukan PDF; jangan menambahkan hard delete sebagai pengganti.

## 6. Aturan proses

Status teknis usulan: DRAFT, SUBMITTED, INITIAL_REVIEW, ASSIGNMENT_APPROVAL, INVESTIGATION, RESULT_REVIEW, RESULT_APPROVAL, FOLLOW_UP, CLOSURE_APPROVAL, COMPLETED, CLOSED. Klarifikasi dan penundaan menyimpan konteks tahap asal, tidak mereset perkara.

Permintaan pembukaan kembali disimpan terpisah dari status akhir sampai disetujui. Revisi penugasan/hasil/penutupan mengembalikan proposal kepada pengusul; tidak membuat persetujuan sebelumnya berlaku untuk revisi baru. Setiap aksi menggunakan versi perkara untuk mencegah dua keputusan bersamaan.

Ketika konflik muncul di tengah proses, akses pihak terkait dicabut dan penugasan/keputusan berikutnya dihentikan sampai pengalihan sah. Data keputusan terdahulu tetap ada; kewenangan peninjauan ulang perlu ditetapkan UNEJ.

## 7. SLA dan kalender

Sumber halaman 2 mengusulkan: verifikasi awal 3 hari kerja; persetujuan 3 hari kerja; respons klarifikasi 7 hari kerja; pembaruan progres minimal setiap 10 hari kerja. Durasi pemeriksaan mengikuti rencana perkara.

Semuanya masih usulan. Sistem menyimpan kalender, zona waktu Asia/Jakarta, tanggal libur, versi kebijakan, tanggal mulai dan tenggat konkret. Aturan jeda/perhitungan ulang ketika klarifikasi atau penundaan harus diputuskan institusi; jangan menganggap timer berhenti otomatis. Pelanggaran tenggat menimbulkan pengingat/tugas, bukan penutupan atau persetujuan otomatis.

## 8. Kebutuhan nonfungsional — target usulan

| Area | Target/persyaratan |
|---|---|
| Keamanan | HTTPS, cookie HttpOnly/Secure, mitigasi CSRF, validasi origin, pembatasan percobaan, otorisasi setiap objek dan unduhan |
| Akun internal | MFA wajib sebagai usulan sebelum operasional; prosedur pemulihan dan pencabutan akses ditetapkan |
| Data | PostgreSQL menjadi sumber kebenaran; Redis bukan penyimpanan tunggal keputusan atau bukti |
| Konsistensi | Transisi, versi, keputusan, audit bisnis, dan outbox atomik dalam transaksi |
| Performa | Target p95 API baca <800 ms, tulis <1.500 ms pada 50 pengguna aktif simulasi; unggah/pindai dan layanan email diukur terpisah |
| Ketersediaan | Target awal 99,5% per bulan; definisi downtime dan kapasitas perlu disetujui |
| Pemulihan | Usulan RPO ≤24 jam dan RTO ≤8 jam; wajib dibuktikan lewat restore, disesuaikan kebutuhan institusi |
| Aksesibilitas | Target WCAG 2.2 AA untuk alur utama; keyboard, fokus, label dan error jelas |
| Responsif | Desktop 1440 px dan mobile 390 px; kronologi, form, dan bukti tetap dapat digunakan |
| Observabilitas | Request ID, metrik antrean, kegagalan scan, latency, dan alert; redaksi data sensitif |

Batas unggahan awal untuk pembahasan: PDF/JPEG/PNG, 20 MiB per berkas, 10 berkas per pengiriman. Ini bukan aturan sumber; lakukan kajian kebutuhan bukti sebelum menetapkannya. Format lain membutuhkan strategi pratinjau dan pemeriksaan yang sesuai.

## 9. Pemetaan sumber dan layar

| Sumber | Kebutuhan | Layar design.md |
|---|---|---|
| Halaman 1 | FR-01–06 | P01–P04 |
| Halaman 2 | FR-07,09–12,20 | I01–I05 |
| Halaman 3: klarifikasi | FR-08,15 | P05, I03 |
| Halaman 3: tindak lanjut/penutupan | FR-13–14 | P06, I06 |
| Halaman 3: penundaan/pembukaan | FR-16–17 | I07–I08, P06 |
| Halaman 3: akses identitas/audit | FR-18–19 | I09 dan seluruh detail |

## 10. Tahapan implementasi

| Tahap | Hasil konkret | Gerbang penerimaan |
|---|---|---|
| 0 — Penetapan | Mandat, opsi kerahasiaan, SLA/kalender, retensi, batas bukti, akses identitas | Keputusan pemilik proses terdokumentasi |
| 1 — Fondasi | Monorepo, database/migrasi, akun, sesi, policy akses, audit/outbox, storage privat, scanner | Akses lintas pengguna ditolak; bukti gagal scan terkunci |
| 2 — Portal pelapor | Draf, 5W+1H, unggah, pratinjau, kirim, tanda terima, tracking, klarifikasi | Kirim ulang aman; snapshot utuh; detail internal tersaring |
| 3 — Proses inti | Verifikasi, konflik, penugasan, pemeriksaan, review, persetujuan | Self-approval dan keputusan ganda ditolak |
| 4 — Penyelesaian | Tindak lanjut, penutupan dini/normal, penundaan, pembukaan kembali, izin identitas | Semua cabang SOP lolos UAT |
| 5 — Kesiapan operasional | MFA, pemulihan backup, pemantauan, uji beban, pelatihan | Persetujuan go-live dari pemilik proses |

Tidak ada estimasi tanggal tanpa kapasitas tim dan dependensi institusi. Fitur lengkap dapat dibangun dengan data sintetis sementara keputusan kebijakan belum final.

## 11. Skenario UAT minimum

1. Akun belum terverifikasi menyimpan draf tetapi gagal mengirim.
2. Pengguna lain dan petugas tidak dapat membuka draf pemilik.
3. Dua request kirim yang sama menghasilkan tanda terima sama; request berbeda dengan key sama ditolak.
4. Bukti terinfeksi atau scan gagal tidak bisa dibuka melalui URL langsung.
5. Pelapor menerima klarifikasi, menjawab, dan perkara kembali ke tahap asal.
6. Pelapor tidak merespons tetapi bukti layak tersedia: perkara tidak otomatis ditutup.
7. Konflik mencabut akses pihak terkait termasuk akses unduhan yang baru diminta.
8. Pengusul merangkap pejabat tetap tidak dapat menyetujui usulan sendiri.
9. Hasil belum memadai kembali ke tim dengan catatan dan versi lama utuh.
10. Dua pejabat memutus proposal bersamaan: hanya satu keputusan efektif.
11. Tindak lanjut selesai, bukti diverifikasi, pejabat menyetujui jawaban dan status Selesai.
12. Penutupan dini butuh persetujuan dan menghasilkan Ditutup dengan alasan aman.
13. Penundaan dievaluasi dan lanjut ke tahap asal; timer mengikuti kebijakan yang disepakati.
14. Pembukaan kembali disetujui ke tahap tertentu; histori lama utuh.
15. Pengguna berperan Super Admin tetap tidak otomatis melihat identitas.
16. Redis/worker/email terganggu: keputusan tersimpan, pekerjaan tertunda dapat dipulihkan.
17. Restore database dan bukti berhasil; relasi/checksum konsisten dan sistem dapat masuk kembali.

## 12. Keputusan terbuka sebelum produksi

- Pengesah, nomor SOP, tanggal berlaku, serta pemilik produk dan operasional.
- Pemetaan mandat pejabat, delegasi, pemisahan tugas, dan kewenangan penundaan.
- Pilihan kerahasiaan resmi, pemberi izin identitas, masa berlaku dan cakupan izin.
- SLA, hari libur, aturan pause/resume, dan eskalasi keterlambatan.
- Retensi draf/laporan/bukti/audit, legal hold, serta penghapusan terotorisasi setelah retensi.
- Metode verifikasi email, MFA, pemulihan akun, serta kemungkinan SSO.
- Penyedia storage privat, SMTP, pemindaian berkas, backup, dan pengelolaan kunci.
- Perlakuan lampiran pending/ditolak setelah pengiriman, bukti tambahan, koreksi laporan terkirim, dan penarikan.

Tidak ada klaim kepatuhan atau pengesahan formal hanya karena fitur tersedia.
