-- Preserve accounts, intake membership, assignments, access and audit history.
UPDATE users SET role = 'INVESTIGATOR' WHERE role = 'MANAGER';

ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('REPORTER','INVESTIGATOR','OFFICIAL','EXECUTOR','ADMIN','SUPER_ADMIN'));
