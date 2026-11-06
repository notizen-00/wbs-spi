ALTER TABLE evidence ADD COLUMN scan_error text, ADD COLUMN next_scan_at timestamptz NOT NULL DEFAULT now();
-- Give previously exhausted scans another chance after infrastructure is repaired.
UPDATE evidence SET attempts = 0 WHERE scan_status = 'ERROR';
CREATE INDEX evidence_scan_queue_idx ON evidence(next_scan_at, created_at) WHERE scan_status IN ('PENDING', 'ERROR');
