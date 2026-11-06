import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

import { PrismaService } from '../apps/api/src/prisma/prisma.service';
import { ReportsService } from '../apps/api/src/reports/reports.service';
import { ReportsRepository } from '../apps/api/src/reports/reports.repository';
import { WorkflowService } from '../apps/api/src/reports/workflow.service';
import { caseScope } from '../apps/api/src/prisma/access-policy';
import type { User } from '@wbs/contracts';
import { createApplication } from '../apps/api/src/bootstrap';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from '../apps/worker/src/worker.module';
import { OutboxService } from '../apps/worker/src/outbox.service';
import { ScannerService } from '../apps/worker/src/scanner.service';
import { EvidenceService } from '../apps/api/src/evidence/evidence.service';
import { TrackingService } from '../apps/api/src/reports/tracking.service';
import { seedCompletedCase, completedCaseId } from '../apps/api/src/seed-completed-case';
import type { MinioStorageService } from '../apps/api/src/storage/minio-storage.service';
import { NotificationsGateway } from '../apps/api/src/notifications/notifications.gateway';
import {
  NotificationPublisher,
  notificationChannel,
} from '../apps/api/src/notifications/notification-publisher';
import { AuthService } from '../apps/api/src/auth/auth.service';
import { UnauthorizedException } from '@nestjs/common';
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import { Server as SocketServer } from 'socket.io';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import type Redis from 'ioredis';

test('migrasi dan alur perkara, mandat, konflik, penundaan, penutupan dan reopen', async (t) => {
  const db = new PGlite();
  await db.waitReady;
  const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0, maxConnections: 10 });
  await server.start();
  const connectionString =
    'postgresql://postgres:postgres@' + server.getServerConn() + '/postgres?sslmode=disable';
  const prisma = new PrismaService(new PrismaPg({ connectionString, max: 1 }));
  t.after(async () => {
    await prisma.$disconnect();
    await server.stop();
    await db.close();
  });
  async function cli(args: string[], extraEnv: Record<string, string> = {}) {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, ['node_modules/prisma/build/index.js', ...args], {
        env: { ...process.env, DATABASE_URL: connectionString, ...extraEnv },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
      });
      child.stderr.on('data', (chunk) => {
        output += chunk;
      });
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve(output) : reject(new Error(output))));
    });
  }
  const migrate = () => cli(['migrate', 'deploy']);
  await t.test('Prisma migrate deploy menerapkan migrasi sekali dan aman diulang', async () => {
    await migrate();
    await migrate();
    assert.equal(
      (await db.query('SELECT * FROM _prisma_migrations WHERE finished_at IS NOT NULL')).rows
        .length,
      7,
    );
  });
  await t.test('schema Prisma sesuai dengan database hasil migrasi', async () => {
    await cli([
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      'database/prisma/schema.prisma',
      '--exit-code',
    ]);
  });
  const people: Record<string, User> = {};
  for (const role of ['REPORTER', 'MANAGER', 'OFFICIAL', 'INVESTIGATOR', 'EXECUTOR']) {
    const result = await db.query<any>(
      "INSERT INTO users(name,email,password_hash,role,verified) VALUES($1,$2,'hash',$3,true) RETURNING *",
      [role, `${role.toLowerCase()}@example.test`, role],
    );
    people[role] = result.rows[0];
  }
  const reports = new ReportsService(prisma, new ReportsRepository(prisma), new WorkflowService());
  const reporter = people.REPORTER!,
    manager = people.MANAGER!,
    official = people.OFFICIAL!,
    investigator = people.INVESTIGATOR!,
    executor = people.EXECUTOR!;
  await t.test('hanya pelapor dapat membuat draf dan menjalankan tindakan pelapor', async () => {
    for (const role of ['MANAGER', 'INVESTIGATOR', 'OFFICIAL', 'EXECUTOR', 'ADMIN'] as const) {
      const internal = { ...manager, role };
      await assert.rejects(
        () => reports.create(internal, { payload: {} }),
        (e: any) => e.getStatus() === 403,
      );
      await assert.rejects(
        () => reports.save(randomUUID(), internal, {}),
        (e: any) => e.getStatus() === 403,
      );
      for (const action of ['SUBMIT', 'RESPOND', 'REQUEST_REOPEN']) {
        await assert.rejects(
          () => reports.command(randomUUID(), internal, { action }, randomUUID()),
          (e: any) => e.getStatus() === 403,
        );
      }
    }
    const draft = await prisma.report.create({ data: { ownerId: manager.id, payload: {} } });
    await prisma.caseAccess.create({ data: { reportId: draft.id, userId: manager.id } });
    assert.equal(
      await prisma.report.count({ where: { AND: [{ id: draft.id }, caseScope(manager)] } }),
      0,
    );
    assert.equal(
      await prisma.report.count({
        where: { AND: [{ id: draft.id }, caseScope({ ...manager, role: 'ADMIN' })] },
      }),
      0,
    );
    await prisma.caseAccess.deleteMany({ where: { reportId: draft.id } });
    await prisma.report.delete({ where: { id: draft.id } });
  });
  let r = (
    await db.query<any>(
      "INSERT INTO reports(owner_id,stage) VALUES($1,'INITIAL_REVIEW') RETURNING *",
      [reporter.id],
    )
  ).rows[0];
  await prisma.caseAccess.create({ data: { reportId: r.id, userId: manager.id } });
  await prisma.caseAccess.create({ data: { reportId: r.id, userId: official.id } });
  async function command(u: User, b: any) {
    await reports.command(
      r.id,
      u,
      { reason: 'Motivasi untuk pengujian', expectedVersion: r.version, ...b },
      randomUUID(),
    );
    r = (await db.query<any>('SELECT * FROM reports WHERE id=$1', [r.id])).rows[0];
  }
  await t.test(
    'upload bukti menyimpan MIME dan checksum, tetap karantina, serta privat',
    async () => {
      const memory = new Map<string, Buffer>();
      const storage = {
        store: async (key: string, bytes: Buffer) => {
          memory.set(key, bytes);
        },
        retrieve: async (key: string) => memory.get(key)!,
      } as unknown as MinioStorageService;
      const service = new EvidenceService(prisma, new ReportsRepository(prisma), storage);
      const draft = await reports.create(reporter, { payload: { title: 'Upload sintetis' } });
      const bytes = Buffer.from('%PDF-1.7\nSynthetic evidence\n%%EOF');
      const uploaded = await service.upload(draft.id, reporter, {
        name: 'sample.pdf',
        data: bytes.toString('base64'),
      });
      assert.equal(uploaded.status, 'PENDING');
      const metadata = await prisma.evidence.findUniqueOrThrow({ where: { id: uploaded.id } });
      assert.equal(metadata.mime, 'application/pdf');
      assert.equal(metadata.bytes, bytes.length);
      assert.equal(metadata.checksum.length, 64);
      assert.deepEqual(memory.get(metadata.storageKey), bytes);
      const brokenStorage = {
        retrieve: async () => {
          throw new Error('secret internal storage details');
        },
      } as unknown as MinioStorageService;
      const scanner = new ScannerService(prisma, brokenStorage);
      await scanner.tick();
      const failed = await prisma.evidence.findUniqueOrThrow({ where: { id: uploaded.id } });
      assert.equal(failed.scanStatus, 'ERROR');
      assert.equal(failed.attempts, 1);
      assert.ok(failed.scanError?.includes('penyimpanan'));
      assert.ok(!failed.scanError?.includes('secret'));
      await scanner.tick();
      assert.equal(
        (await prisma.evidence.findUniqueOrThrow({ where: { id: uploaded.id } })).attempts,
        1,
      );
      const listed = await service.list(draft.id, reporter);
      assert.equal(listed[0].scan_error, failed.scanError);
      assert.equal(listed[0].retry_scheduled, true);
      await assert.rejects(
        service.retry(uploaded.id, manager),
        (error: any) => error.getStatus() === 404,
      );
      await service.retry(uploaded.id, reporter);
      const retried = await prisma.evidence.findUniqueOrThrow({ where: { id: uploaded.id } });
      assert.equal(retried.scanStatus, 'PENDING');
      assert.equal(retried.scanError, null);
      assert.equal(retried.attempts, 0);
      await prisma.evidence.update({
        where: { id: uploaded.id },
        data: { scanStatus: 'REJECTED' },
      });
      await assert.rejects(
        service.retry(uploaded.id, reporter),
        (error: any) => error.getStatus() === 409,
      );

      await assert.rejects(
        service.download(uploaded.id, reporter),
        (error: any) => error.getStatus() === 409,
      );
      await assert.rejects(
        service.upload(draft.id, manager, { name: 'sample.pdf', data: bytes.toString('base64') }),
        (error: any) => error.getStatus() === 404,
      );
      assert.equal(
        await prisma.sensitiveAccessEvent.count({
          where: { evidenceId: uploaded.id, action: 'UPLOAD' },
        }),
        1,
      );
    },
  );
  await t.test(
    'draf privat, submit atomik, idempotensi dan konflik versi melalui Prisma',
    async () => {
      const payload = {
        title: 'Laporan sintetis Prisma',
        category: 'Pelanggaran akademik',
        what: 'Kejadian sintetis',
        who: 'Pihak sintetis',
        when: '2026-11-01',
        where: 'Lokasi sintetis',
        why: 'Dasar sintetis',
        how: 'Kronologi sintetis',
        evidenceReason: 'Sumber sintetis',
        confidentiality: 'PROTECTED',
      };
      const draft = await reports.create(reporter, { payload });
      const body = {
        action: 'SUBMIT',
        expectedVersion: draft.version,
        reason: 'Laporan sintetis dikirim.',
      };
      const key = randomUUID();
      await assert.rejects(
        reports.detail(draft.id, manager),
        (error: any) => error.getStatus() === 404,
      );
      await assert.rejects(
        reports.command(draft.id, { ...reporter, verified: false }, body, key),
        (error: any) => error.getStatus() === 403,
      );
      await assert.rejects(
        reports.command(draft.id, reporter, body, key),
        (error: any) => error.getStatus() === 503,
      );
      assert.equal(await prisma.reportVersion.count({ where: { reportId: draft.id } }), 0);
      assert.equal(await prisma.idempotencyRecord.count({ where: { reportId: draft.id } }), 0);
      assert.equal(
        (await prisma.report.findUniqueOrThrow({ where: { id: draft.id } })).stage,
        'DRAFT',
      );
      await prisma.intakeMember.create({ data: { userId: manager.id } });
      const submitted = await reports.command(draft.id, reporter, body, key);
      const retry = await reports.command(draft.id, reporter, body, key);
      assert.equal(submitted.stage, 'SUBMITTED');
      assert.equal(retry.number, submitted.number);
      assert.equal(retry.version, submitted.version);
      assert.equal(await prisma.reportVersion.count({ where: { reportId: draft.id } }), 1);
      await assert.rejects(
        reports.command(draft.id, reporter, { ...body, reason: 'Payload berbeda' }, key),
        (error: any) => error.getStatus() === 409,
      );
      await assert.rejects(
        reports.save(draft.id, reporter, { payload, expectedVersion: draft.version }),
        (error: any) => error.getStatus() === 409,
      );
      assert.ok((await reports.list(reporter, 1, 'prisma')).some((item) => item.id === draft.id));
    },
  );
  await t.test('proposal penugasan memerlukan pengelola', async () => {
    await assert.rejects(
      command(reporter, {
        action: 'PROPOSE_ASSIGNMENT',
        assigneeId: investigator.id,
        summary: 'Ringkasan',
      }),
    );
    await command(manager, {
      action: 'PROPOSE_ASSIGNMENT',
      assigneeId: investigator.id,
      summary: 'Ringkasan tersamarkan',
    });
    assert.equal(r.stage, 'ASSIGNMENT_APPROVAL');
  });
  await t.test('pejabat tanpa mandat gagal menyetujui', async () => {
    await assert.rejects(command(official, { action: 'DECIDE', decision: 'APPROVE' }));
  });
  await t.test('pengusul yang memiliki role pejabat tetap gagal menyetujui sendiri', async () => {
    await assert.rejects(
      command({ ...manager, role: 'OFFICIAL' }, { action: 'DECIDE', decision: 'APPROVE' }),
    );
  });
  await db.query(
    "INSERT INTO authority_mandates(user_id,decision_type,valid_until) SELECT $1,t,now()+interval '1 day' FROM unnest(ARRAY['ASSIGNMENT','RESULT','CLOSURE','REOPEN']) t",
    [official.id],
  );
  await t.test('persetujuan memberikan akses dan penugasan', async () => {
    await command(official, { action: 'DECIDE', decision: 'APPROVE' });
    assert.equal(r.stage, 'INVESTIGATION');
    assert.equal(
      (await db.query('SELECT * FROM assignments WHERE user_id=$1', [investigator.id])).rows.length,
      1,
    );
  });
  await t.test('suspend menyimpan tahap dan memblokir proses biasa', async () => {
    await command(manager, {
      action: 'SUSPEND',
      evaluationAt: new Date(Date.now() + 86400000).toISOString(),
      conditions: 'Sumber bukti tersedia',
    });
    assert.equal(r.lifecycle, 'SUSPENDED');
    await assert.rejects(command(investigator, { action: 'FINDING', content: 'hasil' }));
    await command(manager, { action: 'RESUME' });
    assert.equal(r.stage, 'INVESTIGATION');
  });
  await t.test('hasil pemeriksaan dapat dikembalikan tanpa menghapus versi', async () => {
    await command(investigator, { action: 'FINDING', content: 'Hasil pemeriksaan pertama' });
    assert.equal(r.stage, 'RESULT_REVIEW');
    await command(manager, { action: 'REVIEW_FINDING', decision: 'RETURN' });
    await command(investigator, { action: 'FINDING', content: 'Hasil pemeriksaan revisi' });
    assert.equal((await db.query('SELECT * FROM findings')).rows.length, 2);
  });
  await t.test('persetujuan hasil membuat tugas pelaksana', async () => {
    await command(manager, {
      action: 'PROPOSE_RESULT',
      executorId: executor.id,
      instruction: 'Laksanakan perbaikan dan lampirkan bukti',
    });
    await command(official, { action: 'DECIDE', decision: 'APPROVE' });
    assert.equal(r.stage, 'FOLLOW_UP');
  });
  const task = (await db.query<any>('SELECT * FROM follow_up_tasks')).rows[0];
  await t.test('tanpa bukti bersih, pelaksanaan gagal', async () => {
    await assert.rejects(
      command(executor, {
        action: 'EXECUTE',
        taskId: task.id,
        execution: 'Selesai',
        evidenceId: 'invalid',
      }),
    );
  });
  const e = (
    await db.query<any>(
      "INSERT INTO evidence(report_id,uploader_id,storage_key,original_name,mime,bytes,checksum,scan_status) VALUES($1,$2,'test/object','bukti.pdf','application/pdf',10,'hash','READY') RETURNING id",
      [r.id, executor.id],
    )
  ).rows[0];
  await t.test('bukti harus ditelaah sebelum selesai', async () => {
    await command(executor, {
      action: 'EXECUTE',
      taskId: task.id,
      execution: 'Perbaikan telah dilaksanakan',
      evidenceId: e.id,
    });
    await assert.rejects(
      command(manager, { action: 'PROPOSE_CLOSURE', outcome: 'COMPLETED', response: 'Selesai' }),
    );
    await command(manager, { action: 'REVIEW_EXECUTION', taskId: task.id, decision: 'VERIFY' });
    await command(manager, {
      action: 'PROPOSE_CLOSURE',
      outcome: 'COMPLETED',
      response: 'Tindak lanjut telah selesai.',
    });
    await command(official, { action: 'DECIDE', decision: 'APPROVE' });
    assert.equal(r.stage, 'COMPLETED');
  });
  await t.test('reopen perlu keputusan, jawaban lama tetap ada', async () => {
    await command(reporter, { action: 'REQUEST_REOPEN', reason: 'Ada bukti baru' });
    assert.equal(r.stage, 'COMPLETED');
    await command(manager, { action: 'PROPOSE_REOPEN', targetStage: 'INVESTIGATION' });
    await command(official, { action: 'DECIDE', decision: 'APPROVE' });
    assert.equal(r.stage, 'INVESTIGATION');
    assert.equal((await db.query('SELECT * FROM official_responses')).rows.length, 1);
  });
  await t.test('konflik mencabut akses dan penugasan', async () => {
    await command(investigator, { action: 'CONFLICT' });
    assert.ok(
      (
        await db.query<any>('SELECT revoked_at FROM assignments WHERE user_id=$1', [
          investigator.id,
        ])
      ).rows[0].revoked_at,
    );
    await assert.rejects(command(investigator, { action: 'FINDING', content: 'Tidak boleh' }));
  });
  await t.test('audit immutable', async () => {
    await assert.rejects(db.query("UPDATE findings SET content='tampered'"));
    await assert.rejects(db.query('DELETE FROM approval_decisions'));
  });
  await t.test('scope objek melindungi draf, admin teknis, dan konflik', async () => {
    const draft = (
      await db.query<any>('INSERT INTO reports(owner_id) VALUES($1) RETURNING id', [reporter.id])
    ).rows[0];
    await db.query('INSERT INTO case_access(report_id,user_id) VALUES($1,$2)', [
      draft.id,
      manager.id,
    ]);
    const read = async (id: string, user: User) =>
      (await prisma.report.findMany({ where: { id, AND: caseScope(user) } })).length;
    assert.equal(await read(draft.id, manager), 0);
    assert.equal(await read(draft.id, reporter), 1);
    assert.equal(await read(r.id, { ...official, role: 'ADMIN' }), 0);
    assert.equal(await read(r.id, investigator), 0);
  });
  await t.test('modul Nest, dependency injection, lifecycle Prisma dan guard HTTP', async () => {
    const previous = process.env.DATABASE_URL;
    const previousSecret = process.env.RECAPTCHA_SECRET_KEY;
    const previousMode = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.RECAPTCHA_SECRET_KEY = 'synthetic-captcha-secret';
    process.env.DATABASE_URL = connectionString;
    const app = await createApplication();
    try {
      await app.listen(0, '127.0.0.1');
      const url = await app.getUrl();
      assert.deepEqual(await (await fetch(url + '/api/v1/health')).json(), { status: 'ok' });
      assert.equal((await fetch(url + '/api/v1/me')).status, 401);
      assert.equal((await fetch(url + '/api/v1/reports')).status, 401);
      assert.equal(
        (
          await fetch(url + '/api/v1/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          })
        ).status,
        403,
      );
      const auth = app.get(AuthService);
      auth.rate = async () => {};
      for (const path of [
        '/auth/register',
        '/auth/login',
        '/auth/recovery',
        '/auth/reset-password',
        '/public/reports/status',
      ]) {
        const response = await fetch(url + '/api/v1' + path, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: process.env.APP_ORIGIN || 'http://localhost:3000',
          },
          body: '{}',
        });
        assert.equal(response.status, 422, path);
        assert.match((await response.json()).message, /reCAPTCHA/);
      }
      const config = await (await fetch(url + '/api/v1/public/captcha')).json();
      assert.deepEqual(Object.keys(config).sort(), ['configured', 'required', 'siteKey']);
      auth.session = async () => reporter;
      const submitWithoutCaptcha = await fetch(url + `/api/v1/reports/${r.id}/commands`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: process.env.APP_ORIGIN || 'http://localhost:3000',
        },
        body: JSON.stringify({ action: 'SUBMIT' }),
      });
      assert.equal(submitWithoutCaptcha.status, 422);
      assert.match((await submitWithoutCaptcha.json()).message, /reCAPTCHA/);
    } finally {
      await app.close();
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
      if (previousSecret === undefined) delete process.env.RECAPTCHA_SECRET_KEY;
      else process.env.RECAPTCHA_SECRET_KEY = previousSecret;
      if (previousMode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousMode;
    }
  });
  await t.test('worker Nest memakai PrismaService yang dikelola lifecycle', async () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = connectionString;
    const app = await NestFactory.createApplicationContext(WorkerModule, { logger: false });
    try {
      assert.ok(app.get(PrismaService));
      assert.ok(app.get(OutboxService));
      assert.ok(app.get(ScannerService));
    } finally {
      await app.close();
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });
  await t.test(
    'WebSocket menerima notifikasi hanya untuk sesi pemilik dan menolak sesi/origin tidak sah',
    async () => {
      const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
      const bus = new EventEmitter() as EventEmitter & {
        subscribe: () => Promise<void>;
        connect: () => Promise<void>;
        disconnect: () => void;
        publish: (channel: string, payload: string) => Promise<number>;
      };
      bus.subscribe = async () => {};
      bus.connect = async () => {
        bus.emit('ready');
      };
      bus.disconnect = () => {};
      bus.publish = async (channel, payload) => {
        bus.emit('message', channel, payload);
        return 1;
      };
      const firstToken = 'a'.repeat(64),
        secondToken = 'b'.repeat(64);
      const sessions = new Map([
        [firstToken, reporter],
        [secondToken, manager],
      ]);
      const auth = {
        sessionFromToken: async (token: string) =>
          sessions.get(token) ??
          (() => {
            throw new UnauthorizedException();
          })(),
      } as unknown as AuthService;
      const http = createServer();
      const server = new SocketServer(http, {
        path: '/api/v1/socket.io',
        transports: ['websocket'],
        allowRequest: (req, cb) => cb(null, req.headers.origin === origin),
      });
      const gateway = new NotificationsGateway(auth, prisma, bus as unknown as Redis);
      const publisher = new NotificationPublisher(bus as unknown as Redis);
      const namespace = server.of('/notifications');
      gateway.afterInit(namespace);
      namespace.on('connection', (socket) => {
        void gateway.handleConnection(socket);
      });
      await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
      const address = http.address() as { port: number };
      const clients: ClientSocket[] = [];
      const connect = (token: string, requestOrigin = origin) => {
        const socket = io(`http://127.0.0.1:${address.port}/notifications`, {
          path: '/api/v1/socket.io',
          transports: ['websocket'],
          autoConnect: false,
          reconnection: false,
          extraHeaders: { Origin: requestOrigin, Cookie: `wbs_session=${token}` },
          timeout: 1000,
        });
        clients.push(socket);
        return socket;
      };
      async function ready(socket: ClientSocket) {
        await new Promise<void>((resolve, reject) => {
          socket.once('connect_error', reject);
          socket.once('notifications:ready', () => resolve());
          socket.connect();
        });
      }
      async function rejected(socket: ClientSocket) {
        await new Promise<void>((resolve, reject) => {
          socket.once('connect', () => reject(new Error('Unauthorized connection accepted')));
          socket.once('connect_error', () => resolve());
          socket.connect();
        });
      }
      try {
        await rejected(connect('invalid'));
        await rejected(connect(firstToken, 'https://invalid.example.test'));
        const first = connect(firstToken),
          second = connect(secondToken);
        await ready(first);
        await ready(second);
        let foreign = 0;
        second.on('notification:new', () => foreign++);
        second.emit('join', `user:${reporter.id}`);
        const event = await prisma.notification.create({
          data: { id: randomUUID(), userId: reporter.id, message: 'Ada pembaruan di portal WBS.' },
        });
        const received = new Promise<any>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Notification timeout')), 2000);
          first.once('notification:new', (item) => {
            clearTimeout(timer);
            resolve(item);
          });
        });
        await publisher.publish([event.id]);
        const item = await received;
        assert.deepEqual(Object.keys(item).sort(), [
          'created_at',
          'id',
          'message',
          'subject',
          'title',
        ]);
        assert.equal(item.title, event.title);
        assert.equal(item.subject, event.subject);
        assert.equal(item.id, event.id);
        assert.equal(foreign, 0);
        sessions.delete(firstToken);
        const disconnected = new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('Revoked session was not disconnected')),
            2000,
          );
          first.once('disconnect', () => {
            clearTimeout(timer);
            resolve();
          });
        });
        let leaked = false;
        first.on('notification:new', () => {
          leaked = true;
        });
        await publisher.publish([event.id]);
        await disconnected;
        assert.equal(leaked, false);
      } finally {
        for (const client of clients) client.disconnect();
        gateway.onModuleDestroy();
        publisher.onModuleDestroy();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  );
  await t.test(
    'notifikasi tersimpan sebelum broadcast dan tidak menunggu worker email',
    async () => {
      const caseReport = await prisma.report.create({
        data: { ownerId: reporter.id, stage: 'SUBMITTED' },
      });
      await prisma.caseAccess.create({ data: { reportId: caseReport.id, userId: manager.id } });
      let broadcasts = 0;
      const publisher = {
        publish: async (ids: string[]) => {
          assert.equal(db.isInTransaction(), false);
          assert.ok(ids.length);
          assert.equal(await prisma.notification.count({ where: { id: { in: ids } } }), ids.length);
          assert.equal(
            await prisma.outboxEvent.count({ where: { id: { in: ids }, processedAt: null } }),
            ids.length,
          );
          broadcasts++;
        },
      } as NotificationPublisher;
      const service = new ReportsService(
        prisma,
        new ReportsRepository(prisma),
        new WorkflowService(),
        publisher,
      );
      const body = { action: 'ADVANCE', reason: 'Catatan pengujian', expectedVersion: 1 };
      const key = randomUUID();
      await service.command(caseReport.id, manager, body, key);
      await service.command(caseReport.id, manager, body, key);
      assert.equal(broadcasts, 1);
      const saved = await prisma.notification.findFirstOrThrow({
        where: { userId: reporter.id, title: 'Verifikasi awal dimulai' },
      });
      assert.ok(saved.subject.includes('Verifikasi awal dimulai'));
      assert.ok(saved.message.includes('Verifikasi awal'));
      assert.ok(!saved.message.includes('Catatan pengujian'));
      const pending = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: saved.id } });
      assert.equal((pending.payload as any).subject, saved.subject);
    },
  );
  await t.test('outbox Prisma mempertahankan retry dan deduplikasi notifikasi', async () => {
    await prisma.outboxEvent.updateMany({ data: { processedAt: new Date() } });
    const event = await prisma.outboxEvent.create({
      data: {
        recipientId: reporter.id,
        kind: 'UPDATE',
        payload: {
          title: 'Laporan selesai ditangani',
          subject: 'Laporan WBS/2026/00001: Laporan selesai ditangani',
          message: 'Buka portal untuk membaca jawaban resmi.',
        },
      },
    });
    const failing = new OutboxService(prisma, {
      sendMail: async () => {
        throw new Error('Synthetic SMTP failure');
      },
    } as any);
    await failing.tick();
    const failed = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    assert.equal(failed.attempts, 1);
    assert.equal(failed.processedAt, null);
    let sent = 0;
    const success = new OutboxService(prisma, {
      sendMail: async (mail: any) => {
        sent++;
        assert.equal(mail.subject, 'Laporan WBS/2026/00001: Laporan selesai ditangani');
        assert.ok(mail.text.includes('Buka portal untuk membaca jawaban resmi.'));
        return {};
      },
    } as any);
    await success.tick();
    await success.tick();
    assert.equal(sent, 1);
    assert.ok(
      (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).processedAt,
    );
    assert.equal(await prisma.notification.count({ where: { id: event.id } }), 1);
    assert.equal(
      (await prisma.notification.findUniqueOrThrow({ where: { id: event.id } })).title,
      'Laporan selesai ditangani',
    );
  });
  await t.test('Prisma seed dapat diulang tanpa duplikasi akun atau mandat', async () => {
    const env = { SEED_PASSWORD: 'Synthetic-Prisma-Test-Password', NODE_ENV: 'development' };
    await cli(['db', 'seed'], env);
    await cli(['db', 'seed'], env);
    assert.equal(
      await prisma.user.count({
        where: { email: { endsWith: '@example.test' }, name: { endsWith: 'Demo' } },
      }),
      5,
    );
    const official = await prisma.user.findUniqueOrThrow({
      where: { email: 'pejabat@example.test' },
    });
    assert.equal(await prisma.authorityMandate.count({ where: { userId: official.id } }), 4);
  });
  await t.test(
    'seed kasus lengkap pulih dari scanner gagal dan aman diulang setelah selesai',
    async () => {
      const memory = new Map<string, Buffer>();
      const storage = {
        check: async () => {},
        store: async (key: string, bytes: Buffer) => {
          memory.set(key, bytes);
        },
        retrieve: async (key: string) => memory.get(key)!,
      } as unknown as MinioStorageService;
      // Explicit scanner fixture: no real infrastructure is used by this integration test.
      let scans = 0;
      await assert.rejects(
        () =>
          seedCompletedCase(prisma, storage, async () => {
            if (++scans === 3) throw new Error('Synthetic scanner outage');
            return 'READY';
          }),
        /Synthetic scanner outage/,
      );
      assert.equal(
        (await prisma.report.findUniqueOrThrow({ where: { id: completedCaseId } })).stage,
        'FOLLOW_UP',
      );
      const result = await seedCompletedCase(prisma, storage, async () => 'READY');
      assert.equal(result.stage, 'COMPLETED');
      assert.equal(result.lifecycle, 'COMPLETED');
      assert.ok(result.number?.startsWith('WBS/'));
      const where = { reportId: completedCaseId };
      assert.equal(await prisma.proposal.count({ where: { ...where, status: 'APPROVED' } }), 3);
      assert.equal(
        await prisma.approvalDecision.count({ where: { proposal: { reportId: completedCaseId } } }),
        3,
      );
      assert.equal(await prisma.followUpTask.count({ where: { ...where, status: 'VERIFIED' } }), 1);
      assert.equal(
        await prisma.officialResponse.count({ where: { ...where, outcome: 'COMPLETED' } }),
        1,
      );
      assert.equal(await prisma.evidence.count({ where: { ...where, scanStatus: 'READY' } }), 2);
      const demoReporter = await prisma.user.findUniqueOrThrow({
        where: { email: 'pelapor@example.test' },
      });
      const visible = await reports.workspace(completedCaseId, demoReporter as User);
      assert.equal(visible.officialResponses.length, 1);
      const item = await prisma.evidence.findFirstOrThrow({ where });
      const file = await new EvidenceService(
        prisma,
        new ReportsRepository(prisma),
        storage,
      ).download(item.id, demoReporter as User);
      assert.ok(file.bytes.toString().startsWith('%PDF-1.4'));
      const counts = [
        await prisma.caseEvent.count({ where }),
        await prisma.reportVersion.count({ where }),
        await prisma.outboxEvent.count(),
      ];
      await seedCompletedCase(prisma, storage, async () => {
        throw new Error('Completed seed must not rescan');
      });
      assert.deepEqual(
        [
          await prisma.caseEvent.count({ where }),
          await prisma.reportVersion.count({ where }),
          await prisma.outboxEvent.count(),
        ],
        counts,
      );
      assert.equal(await prisma.report.count({ where: { id: completedCaseId } }), 1);
    },
  );
  await t.test(
    'pagination dan filter mencakup lebih dari 50 laporan serta mempertahankan scope akses',
    async () => {
      const category = 'Pagination fixture';
      const timestamp = new Date('2026-11-06T01:00:00Z');
      await prisma.report.createMany({
        data: Array.from({ length: 61 }, (_, index) => ({
          ownerId: reporter.id,
          stage: index < 36 ? 'INITIAL_REVIEW' : 'COMPLETED',
          lifecycle: index === 0 ? 'SUSPENDED' : index < 36 ? 'ACTIVE' : 'COMPLETED',
          payload: {
            title: index === 60 ? 'Pagination needle' : `Pagination sample ${index}`,
            category,
          },
          updatedAt: timestamp,
        })),
      });
      await prisma.report.create({
        data: { ownerId: investigator.id, payload: { title: 'Pagination foreign', category } },
      });
      const first = await reports.listPage(reporter, { category, pageSize: 50 });
      const second = await reports.listPage(reporter, { category, pageSize: 50, page: 2 });
      assert.equal(first.total, 61);
      assert.equal(first.totalPages, 2);
      assert.equal(first.items.length, 50);
      assert.equal(second.items.length, 11);
      assert.equal(new Set([...first.items, ...second.items].map((row) => row.id)).size, 61);
      assert.equal((await reports.listPage(reporter, { category, group: 'ACTIVE' })).total, 36);
      assert.equal((await reports.listPage(reporter, { category, group: 'FINISHED' })).total, 25);
      assert.equal(
        (await reports.listPage(reporter, { category, lifecycle: 'SUSPENDED' })).total,
        1,
      );
      assert.equal((await reports.listPage(reporter, { category, stage: 'COMPLETED' })).total, 25);
      const search = await reports.listPage(reporter, { category, q: 'needle', page: 100 });
      assert.equal(search.total, 1);
      assert.equal(search.page, 1);
      assert.equal(search.items[0]?.payload.title, 'Pagination needle');
      const oldest = await reports.listPage(reporter, { category, sort: 'oldest', pageSize: 10 });
      assert.equal(oldest.items[0]?.id, second.items.at(-1)?.id);
      assert.equal((await reports.listPage(manager, { category })).total, 0);
      await prisma.caseAccess.create({
        data: { userId: manager.id, reportId: first.items[0]!.id },
      });
      assert.equal((await reports.listPage(manager, { category })).total, 1);
      assert.equal((await reports.listPage({ ...manager, role: 'ADMIN' }, { category })).total, 0);
      await assert.rejects(() => reports.listPage(reporter, { pageSize: 1000 }));
      await assert.rejects(() => reports.listPage(reporter, { stage: 'INVALID' }));
    },
  );
  await t.test(
    'kode pelacakan unik, hanya pemilik melihat kode, status publik tidak membocorkan isi',
    async () => {
      const draft = await reports.create(reporter, {
        payload: { title: 'Judul rahasia pelacakan' },
      });
      assert.match(draft.trackingCode!, /^WBS-[A-F0-9]{32}$/);
      const tracking = new TrackingService(prisma);
      await assert.rejects(() => tracking.status(draft.trackingCode));
      await prisma.report.update({ where: { id: draft.id }, data: { stage: 'SUBMITTED' } });
      await prisma.caseAccess.create({ data: { reportId: draft.id, userId: manager.id } });
      assert.equal((await reports.detail(draft.id, manager)).trackingCode, undefined);
      const status = await tracking.status(draft.trackingCode!.toLowerCase());
      assert.deepEqual(Object.keys(status).sort(), ['label', 'lifecycle', 'stage', 'updatedAt']);
      assert.equal(status.stage, 'SUBMITTED');
      await assert.rejects(() => tracking.status('WBS/2026/00001'));
      await assert.rejects(() => tracking.status('WBS-' + '0'.repeat(32)));
      const second = await reports.create(reporter, { payload: {} });
      assert.notEqual(second.trackingCode, draft.trackingCode);
    },
  );
  await t.test('baseline database lama mempertahankan laporan dan riwayat', async () => {
    const count = await prisma.report.count();
    const snapshots = await prisma.reportVersion.count();
    // Only this disposable test database: simulate history from the previous SQL runner.
    await db.exec(
      'DROP INDEX evidence_scan_queue_idx; ALTER TABLE evidence DROP COLUMN scan_error, DROP COLUMN next_scan_at; ALTER TABLE notifications DROP COLUMN title, DROP COLUMN subject; ALTER TABLE reports DROP COLUMN tracking_code; DELETE FROM _prisma_migrations',
    );
    const entries = [
      ['001_initial.sql', '20261106000100_initial'],
      ['002_workflow.sql', '20261106000200_workflow'],
      ['003_evidence.sql', '20261106000300_evidence'],
      ['004_intake_and_sessions.sql', '20261106000400_intake_and_sessions'],
    ];
    for (const [oldName, migration] of entries) {
      await db.query('INSERT INTO schema_migrations(name) VALUES($1)', [oldName]);
      await cli(['migrate', 'resolve', '--applied', migration!]);
    }
    await migrate();
    await cli([
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      'database/prisma/schema.prisma',
      '--exit-code',
    ]);
    assert.equal(await prisma.report.count(), count);
    assert.equal(await prisma.reportVersion.count(), snapshots);
    assert.equal(await prisma.legacyMigration.count(), 4);
  });
});
