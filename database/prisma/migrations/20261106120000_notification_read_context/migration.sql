ALTER TABLE notifications
 ADD COLUMN kind text NOT NULL DEFAULT 'UPDATE',
 ADD COLUMN target_path text NOT NULL DEFAULT '/dashboard',
 ADD COLUMN read_at timestamptz;
CREATE INDEX notifications_user_unread_idx ON notifications(user_id) WHERE read_at IS NULL;
-- Recover report links for earlier notifications that contain a receipt number.
UPDATE notifications n SET target_path='/reports/' || r.id::text
FROM reports r WHERE r.number IS NOT NULL
 AND n.subject LIKE ('Laporan ' || r.number || ': %')
 AND (r.owner_id=n.user_id OR EXISTS (SELECT 1 FROM case_access a WHERE a.report_id=r.id AND a.user_id=n.user_id AND a.revoked_at IS NULL));
