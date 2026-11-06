ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('REPORTER','MANAGER','INVESTIGATOR','OFFICIAL','EXECUTOR','ADMIN','SUPER_ADMIN'));
CREATE TABLE report_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE,
 description text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true,
 sort_order integer NOT NULL DEFAULT 0, version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX report_categories_name_lower_key ON report_categories(lower(name));
INSERT INTO report_categories(name,sort_order) VALUES
 ('Penyalahgunaan wewenang',10),('Korupsi & gratifikasi',20),('Pelanggaran akademik',30),
 ('Pelanggaran etika',40),('Pengadaan barang & jasa',50),('Pelanggaran lainnya',60),('Pungutan liar',70);
-- Preserve categories used before the managed catalog existed.
INSERT INTO report_categories(name)
 SELECT DISTINCT btrim(payload->>'category') FROM reports
 WHERE jsonb_typeof(payload->'category')='string' AND length(btrim(payload->>'category')) BETWEEN 1 AND 120
 ON CONFLICT DO NOTHING;
CREATE TABLE site_settings (
 id text PRIMARY KEY DEFAULT 'main' CHECK(id='main'), app_name text NOT NULL DEFAULT 'WBS',
 institution_name text NOT NULL DEFAULT 'Universitas Jember', tagline text NOT NULL DEFAULT 'Whistleblowing System',
 help_email text NOT NULL DEFAULT '', help_phone text NOT NULL DEFAULT '', help_address text NOT NULL DEFAULT '',
 logo_data_url text, version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO site_settings(id) VALUES('main');
CREATE TABLE admin_audits (
 id bigserial PRIMARY KEY, actor_id uuid NOT NULL REFERENCES users(id), action text NOT NULL,
 target_id text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION reject_admin_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Admin audit is immutable'; END; $$;
CREATE TRIGGER immutable_admin_audit BEFORE UPDATE OR DELETE ON admin_audits FOR EACH ROW EXECUTE FUNCTION reject_admin_audit_change();
