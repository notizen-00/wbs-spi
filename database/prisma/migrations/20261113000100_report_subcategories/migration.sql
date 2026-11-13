ALTER TABLE report_categories ADD COLUMN subcategories text[] NOT NULL DEFAULT ARRAY[]::text[];

INSERT INTO report_categories (name, sort_order, subcategories) VALUES
('Pelanggaran BMN', 10, ARRAY['Penyalahgunaan Penggunaan dan Penguasaan BMN', 'Pelanggaran Pemanfaatan BMN (Sewa, Pinjam Pakai, KSP, BGS/BSG)', 'Pelanggaran Pengamanan dan Pemeliharaan', 'Pelanggaran Pemindahtanganan dan Penghapusan BMN', 'Kecurangan Penatausahaan dan Pelaporan']::text[]),
('Pelanggaran Umum (Zona Integritas)', 20, ARRAY['Pelanggaran disiplin atau kode etik', 'Korupsi, kolusi, dan nepotisme (KKN)', 'Suap atau gratifikasi', 'Benturan kepentingan (conflict of interest)', 'Penyalahgunaan wewenang/kekuasaan', 'Pelayanan akademik/non akademik yang tidak prima', 'Diskriminasi gender, disabilitas, dan SARA', 'Pelecehan seksual atau tindakan asusila', 'Perundungan (bullying)']::text[]),
('Divisi Akuntansi dan Keuangan', 30, ARRAY['Kecurangan Laporan Keuangan (Financial Statement Fraud)', 'Penyalahgunaan Aset (Asset Misappropriation)', 'Pelanggaran Kepatuhan dan Pengendalian Internal', 'Pelanggaran Kepatuhan Perpajakan dan Regulasi', 'Pelanggaran terkait Verifikasi dan Surat Pertanggungjawaban (SPJ) Keuangan']::text[]),
('Divisi PBJ', 40, ARRAY['Persaingan Tidak Sehat antar penyedia', 'Kecurangan (Fraud) Administrasi dan Dokumen Pengadaan', 'Pelanggaran Pelaksanaan Kontrak dan Serah Terima']::text[]),
('Divisi SDM', 50, ARRAY['Ketidakhadiran dan jam kerja', 'Pelaksanaan tugas pokok (pemenuhan tri dharma)', 'Kenaikan pangkat dan jabatan']::text[])
ON CONFLICT (name) DO UPDATE SET subcategories = EXCLUDED.subcategories, sort_order = EXCLUDED.sort_order, active = true, version = report_categories.version + 1, updated_at = now();
