import { db } from '../../api/src/db';
import { scan, retrieve } from '../../api/src/storage';
import { hash } from '../../api/src/security';
export async function scanNext() {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const { rows } = await c.query(
      "SELECT * FROM evidence WHERE scan_status IN ('PENDING','ERROR') AND attempts<5 ORDER BY attempts,created_at FOR UPDATE SKIP LOCKED LIMIT 1",
    );
    const e = rows[0];
    if (e) {
      let status = 'ERROR';
      try {
        const body = await retrieve(e.storage_key);
        status = hash(body) === e.checksum ? await scan(body) : 'REJECTED';
      } catch {
        /* Remains locked on any infrastructure failure. */
      }
      await c.query(
        'UPDATE evidence SET scan_status=$1,scan_version=$2,attempts=attempts+1 WHERE id=$3',
        [status, 'clamav-instream-v1', e.id],
      );
    }
    await c.query('COMMIT');
  } catch {
    await c.query('ROLLBACK');
  } finally {
    c.release();
  }
}
