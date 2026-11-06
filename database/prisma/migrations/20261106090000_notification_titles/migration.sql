ALTER TABLE notifications
  ADD COLUMN title text NOT NULL DEFAULT 'Pembaruan laporan WBS',
  ADD COLUMN subject text NOT NULL DEFAULT 'WBS — Pembaruan penanganan laporan';
