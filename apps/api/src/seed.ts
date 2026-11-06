import { db } from './db';
import { passwordHash } from './security';
async function main() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Synthetic seed disabled in production');
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12)
    throw new Error('Set SEED_PASSWORD to at least 12 characters');
  for (const [name, email, role] of [
    ['Pelapor Demo', 'pelapor@example.test', 'REPORTER'],
    ['Pengelola Demo', 'pengelola@example.test', 'MANAGER'],
    ['Pejabat Demo', 'pejabat@example.test', 'OFFICIAL'],
    ['Pemeriksa Demo', 'pemeriksa@example.test', 'INVESTIGATOR'],
    ['Pelaksana Demo', 'pelaksana@example.test', 'EXECUTOR'],
  ]) {
    await db.query(
      'INSERT INTO users(name,email,role,verified,password_hash) VALUES($1,$2,$3,true,$4) ON CONFLICT(email) DO NOTHING',
      [name, email, role, passwordHash(password)],
    );
  }
  await db.query(
    "INSERT INTO intake_members(user_id) SELECT id FROM users WHERE email='pengelola@example.test' ON CONFLICT DO NOTHING",
  );
  await db.query(`INSERT INTO authority_mandates(user_id,decision_type,valid_until)
    SELECT u.id,t,now()+interval '30 days' FROM users u CROSS JOIN unnest(ARRAY['ASSIGNMENT','RESULT','CLOSURE','REOPEN']) t
    WHERE u.email='pejabat@example.test' AND NOT EXISTS(SELECT 1 FROM authority_mandates m WHERE m.user_id=u.id AND m.decision_type=t AND m.valid_until>now())`);
  console.log('Synthetic accounts, demo intake and 30-day demo mandates created.');
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
