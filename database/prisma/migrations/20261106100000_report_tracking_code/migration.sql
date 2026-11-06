ALTER TABLE reports ADD COLUMN tracking_code text NOT NULL
  DEFAULT ('WBS-'::text || upper(replace((gen_random_uuid())::text, '-'::text, ''::text)));
CREATE UNIQUE INDEX reports_tracking_code_key ON reports(tracking_code);
