-- Remove only catalog entries; report payloads and their history are preserved.
DELETE FROM report_categories WHERE name NOT IN (
  'Pelanggaran BMN',
  'Pelanggaran Umum (Zona Integritas)',
  'Divisi Akuntansi dan Keuangan',
  'Divisi PBJ',
  'Divisi SDM'
);
