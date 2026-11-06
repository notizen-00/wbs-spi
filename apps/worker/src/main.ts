import { db } from '../../api/src/db';
import nodemailer from 'nodemailer';
import { scanNext } from './scanner';
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: Number(process.env.SMTP_PORT || 1025),
  secure: process.env.SMTP_SECURE === 'true',
  ...(process.env.SMTP_USER
    ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }
    : {}),
});
let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});
async function tick() {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const { rows } = await c.query(
      'SELECT o.*,u.email FROM outbox_events o JOIN users u ON u.id=o.recipient_id WHERE processed_at IS NULL AND attempts<10 ORDER BY created_at FOR UPDATE OF o SKIP LOCKED LIMIT 1',
    );
    const e = rows[0];
    if (e) {
      const message =
        e.kind === 'VERIFY'
          ? `Verifikasi email Anda: ${process.env.APP_ORIGIN || 'http://localhost:3000'}/?verify=${e.payload.token}`
          : e.kind === 'RESET'
            ? `Atur ulang kata sandi Anda: ${process.env.APP_ORIGIN || 'http://localhost:3000'}/?reset=${e.payload.token}`
            : 'Ada pembaruan di portal WBS. Masuk ke aplikasi untuk melihat informasi.';
      try {
        await transport.sendMail({
          from: process.env.SMTP_FROM || 'WBS <noreply@wbs.local>',
          to: e.email,
          subject:
            e.kind === 'VERIFY'
              ? 'Verifikasi email WBS'
              : e.kind === 'RESET'
                ? 'Pemulihan akun WBS'
                : 'Pembaruan WBS',
          text: message,
          messageId: `<${e.id}@wbs.local>`,
        });
        await c.query(
          'INSERT INTO notifications(id,user_id,message) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [e.id, e.recipient_id, 'Ada pembaruan di portal WBS.'],
        );
        await c.query("UPDATE outbox_events SET processed_at=now(),payload='{}' WHERE id=$1", [
          e.id,
        ]);
      } catch {
        await c.query('UPDATE outbox_events SET attempts=attempts+1 WHERE id=$1', [e.id]);
      }
    }
    await c.query('COMMIT');
  } catch {
    await c.query('ROLLBACK');
    console.error('Outbox unavailable; retry scheduled.');
  } finally {
    c.release();
  }
}
async function main() {
  console.log('WBS outbox worker started');
  while (!stopping) {
    try {
      await tick();
      await scanNext();
    } catch {
      console.error('Database unavailable; retry scheduled.');
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  await db.end();
}
main();
