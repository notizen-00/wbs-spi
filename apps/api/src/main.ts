import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  Module,
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Req,
  Res,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import Redis from 'ioredis';
import { db } from './db';
import { workflow, workflowActions } from './workflow';
import { store, retrieve, detectMime } from './storage';
import { hash, token, passwordHash, passwordMatches } from './security';
import { nextStage, validateSubmission } from '@wbs/domain';
import type { User, ReportPayload } from '@wbs/contracts';
import { stageLabels, type Stage } from '@wbs/contracts';
import { caseScope } from './access';
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 1,
  lazyConnect: true,
});
redis.on('error', () => {});
const fail = (status: number, message: string): never => {
  throw new HttpException({ message }, status);
};
async function session(req: Request): Promise<User> {
  const raw = req.cookies?.wbs_session;
  if (!raw) fail(401, 'Silakan masuk terlebih dahulu.');
  let id;
  try {
    id = await redis.get(`session:${hash(raw)}`);
  } catch {
    fail(503, 'Layanan sesi sementara tidak tersedia.');
  }
  if (!id) fail(401, 'Sesi telah berakhir.');
  const [userId, version] = String(id).split(':');
  const { rows } = await db.query(
    'SELECT id,name,email,role,verified FROM users WHERE id::text=$1 AND auth_version::text=$2 AND active=true',
    [userId, version],
  );
  return rows[0] || fail(401, 'Sesi tidak berlaku.');
}
async function rate(req: Request, kind: string, limit = 10) {
  const k = `rate:${kind}:${req.ip}`;
  try {
    const n = await redis.incr(k);
    if (n === 1) await redis.expire(k, 900);
    if (n > limit) fail(429, 'Terlalu banyak percobaan. Coba kembali 15 menit lagi.');
  } catch (e) {
    if (e instanceof HttpException) throw e;
    fail(503, 'Layanan sementara tidak tersedia.');
  }
}
function validId(id: string) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) fail(404, 'Laporan tidak ditemukan.');
}
function payload(p: any): ReportPayload {
  if (!p || typeof p !== 'object') fail(422, 'Isian laporan tidak valid.');
  const result: any = {};
  for (const key of [
    'title',
    'category',
    'what',
    'who',
    'when',
    'where',
    'why',
    'how',
    'evidenceReason',
    'confidentiality',
  ]) {
    if (p[key] !== undefined && typeof p[key] !== 'string') fail(422, 'Format isian tidak valid.');
    result[key] = String(p[key] || '').slice(0, key === 'title' ? 200 : 20000);
  }
  return result;
}
function serialize(r: any, u?: User) {
  const limited = u && u.id !== r.owner_id && ['OFFICIAL', 'EXECUTOR'].includes(u.role);
  return {
    id: r.id,
    number: r.number,
    stage: r.stage,
    lifecycle: r.lifecycle,
    version: r.version,
    payload: limited
      ? { title: `Perkara ${r.number || ''}`, category: r.payload.category }
      : r.payload,
    clarification: limited ? undefined : r.clarification,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
const scoped = caseScope();
@Controller('api/v1')
class ApiController {
  @Get('health') health() {
    return { status: 'ok' };
  }
  @Get('ready') async ready() {
    await Promise.all([db.query('SELECT 1'), redis.ping()]);
    return { status: 'ready' };
  }
  @Get('me') async me(@Req() req: Request) {
    return session(req);
  }
  @Post('auth/register') async register(@Req() req: Request, @Body() b: any) {
    await rate(req, 'register');
    if (
      typeof b.name !== 'string' ||
      !b.name.trim() ||
      typeof b.email !== 'string' ||
      !/^\S+@\S+\.\S+$/.test(b.email) ||
      typeof b.password !== 'string' ||
      b.password.length < 12 ||
      b.password.length > 128
    )
      fail(422, 'Isi nama, email valid, dan kata sandi 12–128 karakter.');
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      const { rows } = await c.query(
        'INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING RETURNING id',
        [b.name.trim().slice(0, 120), b.email.toLowerCase().trim(), passwordHash(b.password)],
      );
      if (rows[0]) {
        const t = token();
        await c.query(
          "INSERT INTO account_tokens(token_hash,user_id,kind,expires_at) VALUES($1,$2,'VERIFY',now()+interval '1 hour')",
          [hash(t), rows[0].id],
        );
        await c.query(
          "INSERT INTO outbox_events(recipient_id,kind,payload) VALUES($1,'VERIFY',$2)",
          [rows[0].id, JSON.stringify({ token: t })],
        );
      }
      await c.query('COMMIT');
      return { message: 'Jika email dapat didaftarkan, tautan verifikasi akan dikirim.' };
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  @Post('auth/recovery') async recovery(@Req() req: Request, @Body() b: any) {
    await rate(req, 'recovery', 5);
    if (typeof b.email !== 'string' || !/^\S+@\S+\.\S+$/.test(b.email))
      fail(422, 'Isi email yang valid.');
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      const users = await c.query('SELECT id FROM users WHERE email=$1 AND active=true', [
        b.email.toLowerCase().trim(),
      ]);
      if (users.rows[0]) {
        const t = token();
        const kind = b.kind === 'VERIFY' ? 'VERIFY' : 'RESET';
        await c.query(
          "INSERT INTO account_tokens(token_hash,user_id,kind,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
          [hash(t), users.rows[0].id, kind],
        );
        await c.query('INSERT INTO outbox_events(recipient_id,kind,payload) VALUES($1,$2,$3)', [
          users.rows[0].id,
          kind,
          JSON.stringify({ token: t }),
        ]);
      }
      await c.query('COMMIT');
      return { message: 'Jika akun ditemukan, tautan akan dikirim ke email Anda.' };
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  @Post('auth/reset-password') async resetPassword(@Req() req: Request, @Body() b: any) {
    await rate(req, 'reset');
    if (typeof b.password !== 'string' || b.password.length < 12 || b.password.length > 128)
      fail(422, 'Gunakan kata sandi 12–128 karakter.');
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      const { rows } = await c.query(
        "UPDATE account_tokens SET consumed_at=now() WHERE token_hash=$1 AND kind='RESET' AND consumed_at IS NULL AND expires_at>now() RETURNING user_id",
        [hash(String(b.token || ''))],
      );
      if (!rows[0]) fail(422, 'Tautan tidak berlaku atau kedaluwarsa.');
      await c.query('UPDATE users SET password_hash=$1,auth_version=auth_version+1 WHERE id=$2', [
        passwordHash(b.password),
        rows[0].user_id,
      ]);
      await c.query(
        "UPDATE account_tokens SET consumed_at=now() WHERE user_id=$1 AND kind='RESET' AND consumed_at IS NULL",
        [rows[0].user_id],
      );
      await c.query('COMMIT');
      return { message: 'Kata sandi diperbarui. Semua sesi lama telah dicabut.' };
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  @Post('auth/verify') async verify(@Req() req: Request, @Body() b: any) {
    await rate(req, 'verify');
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      const { rows } = await c.query(
        "UPDATE account_tokens SET consumed_at=now() WHERE token_hash=$1 AND kind='VERIFY' AND consumed_at IS NULL AND expires_at>now() RETURNING user_id",
        [hash(String(b.token || ''))],
      );
      if (!rows[0]) fail(422, 'Tautan tidak valid atau kedaluwarsa.');
      await c.query('UPDATE users SET verified=true WHERE id=$1', [rows[0].user_id]);
      await c.query('COMMIT');
      return { message: 'Email berhasil diverifikasi. Silakan masuk.' };
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  @Post('auth/login') async login(
    @Req() req: Request,
    @Body() b: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    await rate(req, 'login');
    if (typeof b.email !== 'string' || typeof b.password !== 'string' || b.password.length > 128)
      fail(422, 'Email dan kata sandi wajib diisi.');
    const { rows } = await db.query('SELECT * FROM users WHERE email=$1 AND active=true', [
      b.email.toLowerCase().trim(),
    ]);
    const u = rows[0];
    const valid = passwordMatches(b.password, u?.password_hash || passwordHash('dummy-password'));
    if (!u || !valid) fail(401, 'Email atau kata sandi tidak sesuai.');
    if (req.cookies?.wbs_session) await redis.del(`session:${hash(req.cookies.wbs_session)}`);
    const t = token();
    await redis.set(`session:${hash(t)}`, `${u.id}:${u.auth_version}`, 'EX', 28800);
    res.cookie('wbs_session', t, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 28800000,
      path: '/',
    });
    return { id: u.id, name: u.name, email: u.email, role: u.role, verified: u.verified };
  }
  @Post('auth/logout') async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (req.cookies?.wbs_session) await redis.del(`session:${hash(req.cookies.wbs_session)}`);
    res.clearCookie('wbs_session', { path: '/' });
    return { ok: true };
  }
  @Get('reports') async list(@Req() req: Request) {
    const u = await session(req);
    const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
    const q = String(req.query.q || '').slice(0, 200);
    const { rows } = await db.query(
      `SELECT r.* FROM reports r WHERE ${caseScope('r', '$1', '$2')} AND (coalesce(r.number,'') ILIKE $3 OR ($2 NOT IN ('EXECUTOR','OFFICIAL') AND r.payload->>'title' ILIKE $3)) ORDER BY r.updated_at DESC LIMIT 50 OFFSET $4`,
      [u.id, u.role, `%${q}%`, (page - 1) * 50],
    );
    return rows.map((r) => serialize(r, u));
  }
  @Post('reports/drafts') async create(@Req() req: Request, @Body() b: any) {
    const u = await session(req);
    await rate(req, 'draft', 100);
    const { rows } = await db.query(
      'INSERT INTO reports(owner_id,payload) VALUES($1,$2) RETURNING *',
      [u.id, payload(b.payload)],
    );
    return serialize(rows[0], u);
  }
  @Get('reports/:id') async detail(@Req() req: Request, @Param('id') id: string) {
    validId(id);
    const u = await session(req);
    const { rows } = await db.query(`SELECT r.* FROM reports r WHERE r.id=$1 AND ${scoped}`, [
      id,
      u.id,
      u.role,
    ]);
    if (!rows[0]) fail(404, 'Laporan tidak ditemukan.');
    const events = await db.query(
      "SELECT action,reason,created_at AS \"createdAt\" FROM case_events WHERE report_id=$1 AND (visibility='PUBLIC' OR $2<> 'REPORTER') ORDER BY id DESC",
      [id, u.role],
    );
    return { ...serialize(rows[0], u), events: u.role === 'EXECUTOR' ? [] : events.rows };
  }
  @Patch('reports/:id/draft') async save(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() b: any,
  ) {
    validId(id);
    const u = await session(req);
    const { rows } = await db.query(
      "UPDATE reports SET payload=$1,version=version+1,updated_at=now() WHERE id=$2 AND owner_id=$3 AND stage='DRAFT' AND version=$4 RETURNING *",
      [payload(b.payload), id, u.id, b.expectedVersion],
    );
    if (!rows[0]) fail(409, 'Draf berubah atau tidak dapat diedit. Muat ulang data terbaru.');
    return serialize(rows[0], u);
  }
  @Post('reports/:id/commands') async command(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() b: any,
  ) {
    validId(id);
    const u = await session(req);
    const key = String(req.headers['idempotency-key'] || '');
    if (key.length < 16 || key.length > 128) fail(422, 'Idempotency-Key wajib diisi.');
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      const { rows } = await c.query(
        `SELECT r.* FROM reports r WHERE r.id=$1 AND ${scoped} FOR UPDATE`,
        [id, u.id, u.role],
      );
      const r = rows[0];
      if (!r) fail(404, 'Laporan tidak ditemukan.');
      const fingerprint = hash(JSON.stringify(b));
      const prior = await c.query(
        'SELECT * FROM idempotency_records WHERE actor_id=$1 AND operation=$2 AND key=$3',
        [u.id, id, key],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== fingerprint)
          fail(409, 'Kunci telah dipakai untuk permintaan berbeda.');
        await c.query('COMMIT');
        return serialize(r, u);
      }
      if (r.version !== b.expectedVersion)
        fail(409, 'Laporan telah berubah. Muat ulang sebelum melanjutkan.');
      if (typeof b.reason !== 'string' || !b.reason.trim() || b.reason.length > 10000)
        fail(422, 'Alasan atau catatan wajib diisi.');
      let stage = r.stage;
      const beforeStage = r.stage;
      let clarification = r.clarification;
      let proposer = r.proposer_id;
      let visibility = 'PUBLIC';
      if (r.lifecycle === 'SUSPENDED' && !['RESUME', 'CONFLICT'].includes(b.action))
        fail(409, 'Perkara sedang ditunda.');
      if (workflowActions.includes(b.action)) {
        const result = await workflow(c, r, u, b);
        stage = result.stage;
        proposer = result.proposer;
        visibility = result.visibility;
      } else if (b.action === 'SUBMIT') {
        if (r.owner_id !== u.id || r.stage !== 'DRAFT') fail(403, 'Pengiriman tidak diizinkan.');
        if (!u.verified) fail(403, 'Verifikasi email sebelum mengirim laporan.');
        try {
          validateSubmission(r.payload);
        } catch (e) {
          fail(422, (e as Error).message);
        }
        stage = 'SUBMITTED';
        const intake = await c.query(
          `INSERT INTO case_access(report_id,user_id)
           SELECT $1,u.id FROM intake_members i JOIN users u ON u.id=i.user_id
           WHERE i.active=true AND u.active=true AND u.verified=true AND u.role='MANAGER' AND u.id<>$2
           AND NOT EXISTS(SELECT 1 FROM conflicts f WHERE f.report_id=$1 AND f.user_id=u.id)
           ON CONFLICT DO NOTHING RETURNING user_id`,
          [id, u.id],
        );
        if (!intake.rowCount)
          fail(503, 'Pengelola penerimaan belum dikonfigurasi. Draf Anda tetap tersimpan.');
        const n = await c.query("SELECT nextval('report_numbers') AS n");
        r.number = `WBS/${new Date().getUTCFullYear()}/${String(n.rows[0].n).padStart(5, '0')}`;
      } else if (b.action === 'CLARIFY') {
        if (
          u.role !== 'MANAGER' ||
          r.owner_id === u.id ||
          r.stage === 'DRAFT' ||
          ['COMPLETED', 'CLOSED'].includes(r.stage) ||
          (clarification && !clarification.response)
        )
          fail(403, 'Permintaan klarifikasi tidak diizinkan.');
        clarification = { question: b.reason, originStage: r.stage };
      } else if (b.action === 'RESPOND') {
        if (u.id !== r.owner_id || !clarification || clarification.response)
          fail(403, 'Tidak ada klarifikasi aktif.');
        clarification = { ...clarification, response: b.reason };
      } else if (b.action === 'ADVANCE') {
        if (r.stage !== 'SUBMITTED')
          fail(422, 'Gunakan perintah proposal dan keputusan khusus pada tahap ini.');
        if (u.id === r.owner_id || (clarification && !clarification.response))
          fail(403, 'Tindakan tidak tersedia.');
        try {
          stage = nextStage(r.stage, u.role, u.id, proposer);
        } catch (e) {
          fail(403, (e as Error).message);
        }
        if (['ASSIGNMENT_APPROVAL', 'RESULT_APPROVAL', 'CLOSURE_APPROVAL'].includes(stage))
          proposer = u.id;
      } else fail(422, 'Perintah tidak dikenali.');
      await c.query(
        'UPDATE reports SET stage=$1,number=$2,clarification=$3,proposer_id=$4,version=version+1,updated_at=now() WHERE id=$5',
        [stage, r.number, clarification, proposer, id],
      );
      await c.query(
        'INSERT INTO case_events(report_id,actor_id,action,reason,visibility) VALUES($1,$2,$3,$4,$5)',
        [id, u.id, b.action, b.reason, visibility],
      );
      if (beforeStage !== stage && b.action !== 'SUBMIT')
        await c.query(
          "INSERT INTO case_events(report_id,actor_id,action,reason,visibility) VALUES($1,$2,'STATUS_UPDATED',$3,'PUBLIC')",
          [id, u.id, `Status laporan: ${stageLabels[stage as Stage]}.`],
        );
      await c.query('INSERT INTO report_versions(report_id,version,snapshot) VALUES($1,$2,$3)', [
        id,
        r.version + 1,
        JSON.stringify({ stage, lifecycle: r.lifecycle, payload: r.payload, clarification }),
      ]);
      await c.query('INSERT INTO idempotency_records VALUES($1,$2,$3,$4,$5)', [
        u.id,
        id,
        key,
        fingerprint,
        id,
      ]);
      await c.query("INSERT INTO outbox_events(recipient_id,kind) VALUES($1,'UPDATE')", [
        r.owner_id,
      ]);
      await c.query(
        "INSERT INTO outbox_events(recipient_id,kind) SELECT a.user_id,'UPDATE' FROM case_access a JOIN users u ON u.id=a.user_id WHERE a.report_id=$1 AND a.revoked_at IS NULL AND a.user_id<>$2 AND a.user_id<>$3 AND u.active=true AND NOT EXISTS(SELECT 1 FROM conflicts f WHERE f.report_id=$1 AND f.user_id=a.user_id)",
        [id, r.owner_id, u.id],
      );
      const updated = await c.query('SELECT * FROM reports WHERE id=$1', [id]);
      await c.query('COMMIT');
      return serialize(updated.rows[0], u);
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  @Get('notifications') async notifications(@Req() req: Request) {
    const u = await session(req);
    return (
      await db.query(
        'SELECT id,message,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',
        [u.id],
      )
    ).rows;
  }
  @Get('reports/:id/evidence') async evidenceList(@Req() req: Request, @Param('id') id: string) {
    validId(id);
    const u = await session(req);
    if (
      !(await db.query(`SELECT 1 FROM reports r WHERE r.id=$1 AND ${scoped}`, [id, u.id, u.role]))
        .rowCount
    )
      fail(404, 'Laporan tidak ditemukan.');
    return (
      await db.query(
        "SELECT id,original_name AS name,mime,bytes,scan_status AS status,created_at FROM evidence WHERE report_id=$1 AND ($2<>'EXECUTOR' OR uploader_id=$3) ORDER BY created_at",
        [id, u.role, u.id],
      )
    ).rows;
  }
  @Post('reports/:id/evidence') async upload(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() b: any,
  ) {
    validId(id);
    const u = await session(req);
    await rate(req, 'upload', 30);
    if (
      typeof b.name !== 'string' ||
      typeof b.data !== 'string' ||
      b.data.length > 27962030 ||
      !b.data.length ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(b.data)
    )
      fail(422, 'Berkas tidak valid atau melebihi 20 MiB.');
    const bytes = Buffer.from(b.data, 'base64');
    if (!bytes.length || bytes.length > 20971520) fail(422, 'Batas berkas 20 MiB.');
    const mime = detectMime(bytes);
    if (
      !mime ||
      !{ 'application/pdf': /\.pdf$/i, 'image/png': /\.png$/i, 'image/jpeg': /\.jpe?g$/i }[
        mime as 'application/pdf'
      ]?.test(b.name)
    )
      fail(422, 'Hanya PDF, JPEG, dan PNG dengan format sesuai yang diterima.');
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      const allowed = await c.query(
        `SELECT r.* FROM reports r WHERE r.id=$1 AND ${scoped} FOR UPDATE`,
        [id, u.id, u.role],
      );
      const r = allowed.rows[0];
      if (!r) fail(404, 'Laporan tidak ditemukan.');
      if (['COMPLETED', 'CLOSED'].includes(r.stage) || r.lifecycle === 'SUSPENDED')
        fail(409, 'Perkara tidak menerima bukti pada tahap ini.');
      const count = await c.query('SELECT count(*)::int AS n FROM evidence WHERE report_id=$1', [
        id,
      ]);
      if (count.rows[0].n >= 10)
        fail(422, 'Maksimal 10 berkas per laporan pada versi kebijakan awal.');
      const key = `quarantine/${token()}`;
      await store(key, bytes, mime!);
      const result = await c.query(
        'INSERT INTO evidence(report_id,uploader_id,storage_key,original_name,mime,bytes,checksum) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,scan_status AS status',
        [
          id,
          u.id,
          key,
          b.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(-150),
          mime,
          bytes.length,
          hash(bytes),
        ],
      );
      await c.query(
        "INSERT INTO sensitive_access_events(actor_id,report_id,evidence_id,action) VALUES($1,$2,$3,'UPLOAD')",
        [u.id, id, result.rows[0].id],
      );
      await c.query('COMMIT');
      return result.rows[0];
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  @Get('evidence/:id/download') async download(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    validId(id);
    const u = await session(req);
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      const { rows } = await c.query(
        `SELECT e.*,r.owner_id FROM evidence e JOIN reports r ON r.id=e.report_id WHERE e.id=$1 AND ${scoped} FOR UPDATE OF r`,
        [id, u.id, u.role],
      );
      const e = rows[0];
      if (!e || (u.role === 'EXECUTOR' && e.uploader_id !== u.id))
        fail(404, 'Bukti tidak ditemukan.');
      if (e.scan_status !== 'READY') fail(409, 'Bukti belum lolos pemindaian keamanan.');
      const bytes = await retrieve(e.storage_key);
      if (hash(bytes) !== e.checksum) fail(409, 'Integritas bukti tidak sesuai.');
      await c.query(
        "INSERT INTO sensitive_access_events(actor_id,report_id,evidence_id,action) VALUES($1,$2,$3,'DOWNLOAD')",
        [u.id, e.report_id, id],
      );
      await c.query('COMMIT');
      res.setHeader('Content-Type', e.mime);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${e.original_name.replace(/["\r\n]/g, '_')}"`,
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(bytes);
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  @Get('reports/:id/workspace') async workspace(@Req() req: Request, @Param('id') id: string) {
    validId(id);
    const u = await session(req);
    const allowed = await db.query(`SELECT r.* FROM reports r WHERE r.id=$1 AND ${scoped}`, [
      id,
      u.id,
      u.role,
    ]);
    if (!allowed.rows[0]) fail(404, 'Laporan tidak ditemukan.');
    const r = allowed.rows[0];
    const officialResponses = (
      await db.query(
        'SELECT content,outcome,created_at FROM official_responses WHERE report_id=$1 ORDER BY created_at DESC',
        [id],
      )
    ).rows;
    const reopenRequests = (
      await db.query(
        'SELECT id,reason,status FROM reopen_requests WHERE report_id=$1 ORDER BY created_at DESC',
        [id],
      )
    ).rows;
    if (u.id === r.owner_id) return { officialResponses, reopenRequests };
    const proposals = (
      await db.query(
        'SELECT id,type,payload,status FROM proposals WHERE report_id=$1 ORDER BY created_at DESC',
        [id],
      )
    ).rows;
    const findings = (
      await db.query(
        'SELECT id,content,created_at FROM findings WHERE report_id=$1 ORDER BY created_at DESC',
        [id],
      )
    ).rows;
    const tasks = (
      await db.query(
        "SELECT id,instruction,execution,status FROM follow_up_tasks WHERE report_id=$1 AND ($2<>'EXECUTOR' OR executor_id=$3)",
        [id, u.role, u.id],
      )
    ).rows;
    const users =
      u.role === 'MANAGER'
        ? (
            await db.query(
              "SELECT id,name,role FROM users WHERE role IN ('INVESTIGATOR','EXECUTOR') AND active=true AND verified=true ORDER BY name LIMIT 200",
            )
          ).rows
        : [];
    if (u.role === 'EXECUTOR')
      return {
        tasks,
        officialResponses: [],
        reopenRequests: [],
        users: [],
        proposals: [],
        findings: [],
        lifecycle: r.lifecycle,
      };
    return {
      officialResponses,
      reopenRequests,
      proposals,
      findings,
      tasks,
      users,
      lifecycle: r.lifecycle,
    };
  }
}
@Module({ controllers: [ApiController] })
class AppModule {}
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.useBodyParser('json', { limit: '29mb' });
  app.use(helmet());
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers.origin !== (process.env.APP_ORIGIN || 'http://localhost:3000')) {
        res.status(403).json({ message: 'Origin permintaan tidak diizinkan.' });
        return;
      }
      if (!req.is('application/json')) {
        res.status(415).json({ message: 'Gunakan application/json.' });
        return;
      }
    }
    next();
  });
  app.useGlobalFilters({
    catch(exception: any, host: any) {
      const res = host.switchToHttp().getResponse();
      const status = exception instanceof HttpException ? exception.getStatus() : 503;
      res
        .status(status)
        .json(
          exception instanceof HttpException
            ? exception.getResponse()
            : { message: 'Layanan sementara tidak tersedia. Silakan coba lagi.' },
        );
    },
  });
  await app.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1');
}
bootstrap();
