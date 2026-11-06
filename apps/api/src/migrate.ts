import { db } from './db';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
async function main() {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(890124)');
    await c.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())',
    );
    const dir = resolve(__dirname, '../../../database/migrations');
    for (const name of readdirSync(dir)
      .filter((n) => n.endsWith('.sql'))
      .sort()) {
      if (!(await c.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name])).rowCount) {
        await c.query(readFileSync(resolve(dir, name), 'utf8'));
        await c.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
        console.log('Applied', name);
      }
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
    await db.end();
  }
}
main().catch(() => {
  console.error('Migration failed. Check database availability.');
  process.exitCode = 1;
});
