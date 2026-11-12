-- Retain existing accounts and administration audit references.
UPDATE users SET role = 'SUPER_ADMIN' WHERE role = 'ADMIN';

ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('REPORTER','INVESTIGATOR','OFFICIAL','EXECUTOR','SUPER_ADMIN'));
