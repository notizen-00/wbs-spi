ALTER TABLE users ADD COLUMN auth_version integer NOT NULL DEFAULT 1;
CREATE TABLE intake_members (user_id uuid PRIMARY KEY REFERENCES users,active boolean NOT NULL DEFAULT true);
