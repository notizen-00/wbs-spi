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
import { AdminService } from '../apps/api/src/admin/admin.service';
import { createSuperAdmin } from '../apps/api/src/seed-super-admin';
import { seedCompletedCase, completedCaseId } from '../apps/api/src/seed-completed-case';
import type { MinioStorageService } from '../apps/api/src/storage/minio-storage.service';
import { NotificationsGateway } from '../apps/api/src/notifications/notifications.gateway';
import {
  NotificationPublisher,
  notificationChannel,
} from '../apps/api/src/notifications/notification-publisher';
import { AuthService } from '../apps/api/src/auth/auth.service';
import { passwordMatches } from '../apps/api/src/security';
import { UnauthorizedException } from '@nestjs/common';
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
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
      13,
    );
  });
  await t.test('katalog kategori dan 25 subkategori tersimpan di database', async () => {
    assert.equal(await prisma.reportCategory.count(), 5);
    const names = [
      'Pelanggaran BMN',
      'Pelanggaran Umum (Zona Integritas)',
      'Divisi Akuntansi dan Keuangan',
      'Divisi PBJ',
      'Divisi SDM',
    ];
    const rows = await prisma.reportCategory.findMany({
      where: { name: { in: names } },
      orderBy: { sortOrder: 'asc' },
    });
    assert.deepEqual(
      rows.map((row) => row.name),
      names,
    );
    assert.deepEqual(
      rows.map((row) => row.subcategories.length),
      [5, 9, 5, 3, 3],
    );
    assert.ok(rows.every((row) => row.active));
    const settings = await new AdminService(prisma).publicSettings();
    assert.deepEqual(settings.subcategories['Divisi SDM'], rows[4]!.subcategories);
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
  await t.test('migrasi menggabungkan pengelola lama tanpa kehilangan akun dan akses', async () => {
    const userId = randomUUID();
    const reportId = randomUUID();
    await db.exec('BEGIN; ALTER TABLE users DROP CONSTRAINT users_role_check;');
    try {
      await db.query(
        "INSERT INTO users(id,name,email,password_hash,role,verified) VALUES($1,'Petugas lama','legacy-role@example.test','hash','MANAGER',true)",
        [userId],
      );
      await db.query('INSERT INTO intake_members(user_id) VALUES($1)', [userId]);
      await db.query("INSERT INTO reports(id,owner_id,stage) VALUES($1,$2,'SUBMITTED')", [
        reportId,
        userId,
      ]);
      await db.query('INSERT INTO case_access(report_id,user_id) VALUES($1,$2)', [
        reportId,
        userId,
      ]);
      // Restore the old constraint before applying the new migration to existing data.
      await db.exec(
        "ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('REPORTER','MANAGER','INVESTIGATOR','OFFICIAL','EXECUTOR','ADMIN','SUPER_ADMIN'))",
      );
      await db.exec(
        readFileSync(
          'database/prisma/migrations/20261112000100_merge_verifier_investigator/migration.sql',
          'utf8',
        ),
      );
      assert.equal(
        (await db.query<{ role: string }>('SELECT role FROM users WHERE id=$1', [userId])).rows[0]!
          .role,
        'INVESTIGATOR',
      );
      assert.equal(
        (await db.query('SELECT * FROM intake_members WHERE user_id=$1', [userId])).rows.length,
        1,
      );
      assert.equal(
        (
          await db.query('SELECT * FROM case_access WHERE report_id=$1 AND user_id=$2', [
            reportId,
            userId,
          ])
        ).rows.length,
        1,
      );
      await assert.rejects(db.query("UPDATE users SET role='MANAGER' WHERE id=$1", [userId]));
    } finally {
      await db.exec('ROLLBACK');
    }
  });
  await t.test('akun Admin lama menjadi Super Admin tanpa mengganti kredensial', async () => {
    const userId = randomUUID();
    await db.exec('BEGIN; ALTER TABLE users DROP CONSTRAINT users_role_check;');
    try {
      await db.query(
        "INSERT INTO users(id,name,email,password_hash,role,verified,auth_version) VALUES($1,'Admin lama','legacy-admin@example.test','existing-hash','ADMIN',true,7)",
        [userId],
      );
      await db.exec(
        "ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('REPORTER','INVESTIGATOR','OFFICIAL','EXECUTOR','ADMIN','SUPER_ADMIN'))",
      );
      await db.exec(
        readFileSync(
          'database/prisma/migrations/20261112000200_merge_admin_into_super_admin/migration.sql',
          'utf8',
        ),
      );
      const user = (
        await db.query<{ role: string; password_hash: string; auth_version: number }>(
          'SELECT role,password_hash,auth_version FROM users WHERE id=$1',
          [userId],
        )
      ).rows[0]!;
      assert.deepEqual(user, {
        role: 'SUPER_ADMIN',
        password_hash: 'existing-hash',
        auth_version: 7,
      });
      await assert.rejects(db.query("UPDATE users SET role='ADMIN' WHERE id=$1", [userId]));
    } finally {
      await db.exec('ROLLBACK');
    }
  });
  const people: Record<string, User> = {};
  for (const role of ['REPORTER', 'INVESTIGATOR', 'OFFICIAL', 'EXECUTOR']) {
    const result = await db.query<any>(
      "INSERT INTO users(name,email,password_hash,role,verified) VALUES($1,$2,'hash',$3,true) RETURNING *",
      [role, `${role.toLowerCase()}@example.test`, role],
    );
    people[role] = result.rows[0];
  }
  const assignedInvestigator = await prisma.user.create({
    data: {
      name: 'Verifikator/Pemeriksa kedua',
      email: 'assigned-investigator@example.test',
      passwordHash: 'hash',
      role: 'INVESTIGATOR',
      verified: true,
    },
  });
  const reports = new ReportsService(prisma, new ReportsRepository(prisma), new WorkflowService());
  const reporter = people.REPORTER!,
    manager = people.INVESTIGATOR!,
    official = people.OFFICIAL!,
    investigator = assignedInvestigator as User,
    executor = people.EXECUTOR!;
  await t.test('hanya pelapor dapat membuat draf dan menjalankan tindakan pelapor', async () => {
    for (const role of ['INVESTIGATOR', 'OFFICIAL', 'EXECUTOR', 'SUPER_ADMIN'] as const) {
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
        where: { AND: [{ id: draft.id }, caseScope({ ...manager, role: 'SUPER_ADMIN' })] },
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
        category: 'Pelanggaran Umum (Zona Integritas)',
        subcategory: 'Pelanggaran disiplin atau kode etik',
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
  await t.test('verifikator hanya meneruskan dan tidak membuat usulan penugasan', async () => {
    await assert.rejects(
      command(manager, {
        action: 'PROPOSE_ASSIGNMENT',
        assigneeId: investigator.id,
        summary: 'Bukan kewenangan verifikator',
      }),
      (e: any) => e.getStatus() === 403,
    );
    await assert.rejects(
      command(reporter, { action: 'FORWARD_TO_OFFICIAL' }),
      (e: any) => e.getStatus() === 403,
    );
    await assert.rejects(
      command(official, {
        action: 'PROPOSE_ASSIGNMENT',
        assigneeId: investigator.id,
        summary: 'Belum diteruskan',
      }),
      (e: any) => e.getStatus() === 409,
    );
    await command(manager, { action: 'FORWARD_TO_OFFICIAL' });
    assert.equal(r.stage, 'ASSIGNMENT_APPROVAL');
    assert.equal(await prisma.proposal.count({ where: { reportId: r.id } }), 0);
    assert.ok(
      (await reports.detail(r.id, reporter)).events.some(
        (event) => event.action === 'FORWARD_TO_OFFICIAL',
      ),
    );
    assert.deepEqual(((await reports.workspace(r.id, manager)) as any).users, []);
  });
  await t.test(
    'pejabat langsung menugaskan pelaksana setelah verifikasi tanpa penugasan pemeriksa ulang',
    async () => {
      await assert.rejects(
        command(official, {
          action: 'PROPOSE_RESULT',
          executorId: investigator.id,
          instruction: 'Harus pelaksana',
        }),
      );
      await command(official, {
        action: 'PROPOSE_RESULT',
        executorId: executor.id,
        instruction: 'Periksa dan laksanakan tindak lanjut',
      });
      assert.equal(r.stage, 'FOLLOW_UP');
      assert.equal(await prisma.assignment.count({ where: { reportId: r.id } }), 0);
      const task = await prisma.followUpTask.findFirstOrThrow({ where: { reportId: r.id } });
      assert.equal(task.executorId, executor.id);
      assert.ok(
        ((await reports.workspace(r.id, official)) as any).users.every(
          (person: any) => person.role === 'EXECUTOR',
        ),
      );
    },
  );
  // Retain coverage for investigation-stage reports created under the previous workflow.
  const legacyInvestigation = await prisma.report.create({
    data: { ownerId: reporter.id, stage: 'INVESTIGATION', payload: {} },
  });
  const legacyAssignment = await prisma.proposal.create({
    data: {
      reportId: legacyInvestigation.id,
      type: 'ASSIGNMENT',
      proposerId: official.id,
      status: 'APPROVED',
      payload: { assigneeId: investigator.id },
    },
  });
  await prisma.assignment.create({
    data: {
      reportId: legacyInvestigation.id,
      userId: investigator.id,
      proposalId: legacyAssignment.id,
    },
  });
  await prisma.caseAccess.createMany({
    data: [manager, official, investigator].map((person) => ({
      reportId: legacyInvestigation.id,
      userId: person.id,
    })),
  });
  r = (await db.query<any>('SELECT * FROM reports WHERE id=$1', [legacyInvestigation.id])).rows[0];
  await t.test('suspend menyimpan tahap dan memblokir proses biasa', async () => {
    await command(official, {
      action: 'SUSPEND',
      evaluationAt: new Date(Date.now() + 86400000).toISOString(),
      conditions: 'Sumber bukti tersedia',
    });
    assert.equal(r.lifecycle, 'SUSPENDED');
    await assert.rejects(command(investigator, { action: 'FINDING', content: 'hasil' }));
    await command(official, { action: 'RESUME' });
    assert.equal(r.stage, 'INVESTIGATION');
  });
  await t.test('hasil pemeriksaan dapat dikembalikan tanpa menghapus versi', async () => {
    await command(investigator, { action: 'FINDING', content: 'Hasil pemeriksaan pertama' });
    assert.equal(r.stage, 'RESULT_REVIEW');
    await command(manager, { action: 'FORWARD_TO_OFFICIAL' });
    await command(official, { action: 'REVIEW_FINDING', decision: 'RETURN' });
    await command(investigator, { action: 'FINDING', content: 'Hasil pemeriksaan revisi' });
    assert.equal((await db.query('SELECT * FROM findings')).rows.length, 2);
  });
  await t.test(
    'pejabat membuat rencana dan penugasan pelaksana setelah verifikator meneruskan hasil',
    async () => {
      await assert.rejects(
        command(manager, {
          action: 'PROPOSE_RESULT',
          executorId: executor.id,
          instruction: 'Tidak boleh mengusulkan',
        }),
        (e: any) => e.getStatus() === 403,
      );
      await command(manager, { action: 'FORWARD_TO_OFFICIAL' });
      assert.equal(r.stage, 'RESULT_APPROVAL');
      await assert.rejects(
        command(official, { action: 'PROPOSE_RESULT', instruction: 'Pelaksana wajib dipilih' }),
      );
      await assert.rejects(
        command(official, {
          action: 'PROPOSE_RESULT',
          executorId: reporter.id,
          instruction: 'Tidak boleh pelapor',
        }),
      );
      await command(official, {
        action: 'PROPOSE_RESULT',
        executorId: executor.id,
        instruction: 'Laksanakan perbaikan dan lampirkan bukti',
      });
      const plan = await prisma.proposal.findFirstOrThrow({
        where: { reportId: r.id, type: 'RESULT' },
      });
      assert.equal(plan.proposerId, official.id);
      assert.equal(plan.status, 'APPROVED');
      assert.equal((plan.payload as any).executorId, executor.id);
      assert.equal(await prisma.approvalDecision.count({ where: { proposalId: plan.id } }), 0);
      assert.equal(r.stage, 'FOLLOW_UP');
    },
  );
  const task = (await db.query<any>('SELECT * FROM follow_up_tasks WHERE report_id=$1', [r.id]))
    .rows[0];
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
    await command(manager, { action: 'FORWARD_TO_OFFICIAL' });
    await command(official, {
      action: 'PROPOSE_CLOSURE',
      outcome: 'COMPLETED',
      response: 'Tindak lanjut telah selesai.',
    });
    assert.equal(r.stage, 'COMPLETED');
  });
  await t.test('reopen perlu keputusan, jawaban lama tetap ada', async () => {
    await command(reporter, { action: 'REQUEST_REOPEN', reason: 'Ada bukti baru' });
    assert.equal(r.stage, 'COMPLETED');
    await command(manager, { action: 'FORWARD_TO_OFFICIAL' });
    await command(official, { action: 'PROPOSE_REOPEN', targetStage: 'INVESTIGATION' });
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
  await t.test(
    'proposal lama tetap dapat diselesaikan pejabat dengan penerima tugas pilihannya',
    async () => {
      const legacy = await prisma.report.create({
        data: { ownerId: reporter.id, stage: 'ASSIGNMENT_APPROVAL', payload: {} },
      });
      await prisma.caseAccess.createMany({
        data: [manager, official].map((person) => ({ reportId: legacy.id, userId: person.id })),
      });
      const proposal = await prisma.proposal.create({
        data: {
          reportId: legacy.id,
          type: 'ASSIGNMENT',
          proposerId: manager.id,
          payload: { assigneeId: investigator.id, summary: 'Proposal lama' },
        },
      });
      await prisma.authorityMandate.create({
        data: {
          userId: official.id,
          decisionType: 'ASSIGNMENT',
          validUntil: new Date(Date.now() + 86400000),
        },
      });
      const request = {
        action: 'DECIDE',
        decision: 'APPROVE',
        reason: 'Pejabat menetapkan pelaksana',
        executorId: executor.id,
        instruction: 'Laksanakan tindak lanjut',
        expectedVersion: legacy.version,
      };
      await assert.rejects(
        () => reports.command(legacy.id, { ...manager, role: 'OFFICIAL' }, request, randomUUID()),
        (e: any) => e.getStatus() === 403,
      );
      const assigned = await reports.command(legacy.id, official, request, randomUUID());
      assert.equal(assigned.stage, 'FOLLOW_UP');
      assert.equal(await prisma.approvalDecision.count({ where: { proposalId: proposal.id } }), 1);
    },
  );
  await t.test('audit immutable', async () => {
    await assert.rejects(db.query("UPDATE findings SET content='tampered'"));
    await assert.rejects(db.query('DELETE FROM approval_decisions'));
  });
  await t.test(
    'pejabat dapat menetapkan ulang proposal lama tanpa persetujuan tambahan',
    async () => {
      const oldReport = await prisma.report.create({
        data: { ownerId: reporter.id, stage: 'RESULT_APPROVAL', payload: {} },
      });
      await prisma.caseAccess.create({ data: { reportId: oldReport.id, userId: official.id } });
      const oldPlan = await prisma.proposal.create({
        data: {
          reportId: oldReport.id,
          proposerId: manager.id,
          type: 'RESULT',
          payload: { instruction: 'Rencana lama', executorId: reporter.id },
        },
      });
      const assigned = await reports.command(
        oldReport.id,
        official,
        {
          action: 'PROPOSE_RESULT',
          reason: 'Penugasan ditetapkan pejabat',
          instruction: 'Rencana dari pejabat',
          executorId: executor.id,
          expectedVersion: oldReport.version,
        },
        randomUUID(),
      );
      assert.equal(assigned.stage, 'FOLLOW_UP');
      assert.equal(
        (await prisma.proposal.findUniqueOrThrow({ where: { id: oldPlan.id } })).status,
        'RETURNED',
      );
      const newPlan = await prisma.proposal.findFirstOrThrow({
        where: { reportId: oldReport.id, status: 'APPROVED' },
      });
      assert.equal(newPlan.proposerId, official.id);
      assert.equal(await prisma.approvalDecision.count({ where: { proposalId: newPlan.id } }), 0);
      assert.equal(
        (await prisma.followUpTask.findFirstOrThrow({ where: { reportId: oldReport.id } }))
          .executorId,
        executor.id,
      );
    },
  );
  await t.test('scope objek melindungi draf, super admin, dan konflik', async () => {
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
    assert.equal(await read(r.id, { ...official, role: 'SUPER_ADMIN' }), 0);
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
      assert.equal((await fetch(url + '/api/v1/admin/settings')).status, 401);
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
      assert.equal((await fetch(url + '/api/v1/admin/settings')).status, 403);
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
          'kind',
          'message',
          'read_at',
          'subject',
          'targetPath',
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
      assert.equal(await prisma.proposal.count({ where: { ...where, status: 'APPROVED' } }), 2);
      assert.equal(
        await prisma.approvalDecision.count({ where: { proposal: { reportId: completedCaseId } } }),
        0,
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
            subcategory: index % 2 === 0 ? 'Sub A' : 'Sub B',
          },
          updatedAt: timestamp,
        })),
      });
      await prisma.report.create({
        data: { ownerId: investigator.id, payload: { title: 'Pagination foreign', category } },
      });
      assert.equal(
        (await reports.listPage(reporter, { category, subcategory: 'Sub A' })).total,
        31,
      );
      assert.equal(
        (await reports.listPage(reporter, { category, subcategory: 'Tidak ada' })).total,
        0,
      );
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
      assert.equal(
        (await reports.listPage({ ...manager, role: 'SUPER_ADMIN' }, { category })).total,
        0,
      );
      await assert.rejects(() => reports.listPage(reporter, { pageSize: 1000 }));
      await assert.rejects(() => reports.listPage(reporter, { stage: 'INVALID' }));
    },
  );
  await t.test(
    'verifikator menutup laporan tanpa tindak lanjut dengan alasan publik tanpa persetujuan pejabat',
    async () => {
      for (const stage of [
        'INITIAL_REVIEW',
        'RESULT_REVIEW',
        'ASSIGNMENT_APPROVAL',
        'RESULT_APPROVAL',
      ]) {
        const report = await prisma.report.create({
          data: { ownerId: reporter.id, stage, payload: {} },
        });
        await prisma.caseAccess.createMany({
          data: [manager, official, executor].map((person) => ({
            reportId: report.id,
            userId: person.id,
          })),
        });
        const close = {
          action: 'CLOSE_NO_FOLLOW_UP',
          reason: 'Informasi tidak menunjukkan adanya pelanggaran.',
          expectedVersion: report.version,
        };
        const actor = ['ASSIGNMENT_APPROVAL', 'RESULT_APPROVAL'].includes(stage)
          ? official
          : manager;
        const otherActor = actor.id === manager.id ? official : manager;
        await assert.rejects(
          () => reports.command(report.id, otherActor, close, randomUUID()),
          (e: any) => e.getStatus() === 409,
        );
        await assert.rejects(
          () => reports.command(report.id, executor, close, randomUUID()),
          (e: any) => e.getStatus() === 403,
        );
        await assert.rejects(
          () => reports.command(report.id, reporter, close, randomUUID()),
          (e: any) => e.getStatus() === 403,
        );
        await assert.rejects(
          () => reports.command(report.id, actor, { ...close, reason: '' }, randomUUID()),
          (e: any) => e.getStatus() === 422,
        );
        const closed = await reports.command(report.id, actor, close, randomUUID());
        assert.equal(closed.stage, 'CLOSED');
        assert.equal(closed.lifecycle, 'CLOSED');
        assert.equal(await prisma.proposal.count({ where: { reportId: report.id } }), 0);
        assert.equal(
          await prisma.approvalDecision.count({ where: { proposal: { reportId: report.id } } }),
          0,
        );
        const detail = await reports.detail(report.id, reporter);
        assert.ok(
          detail.events.some(
            (event) => event.action === 'CLOSE_NO_FOLLOW_UP' && event.reason === close.reason,
          ),
        );
        const tracking = await new TrackingService(prisma).status(report.trackingCode);
        assert.ok(
          tracking.report.events.some(
            (event) => event.action === 'CLOSE_NO_FOLLOW_UP' && event.reason === close.reason,
          ),
        );
      }
      const report = await prisma.report.create({
        data: { ownerId: reporter.id, stage: 'INVESTIGATION', payload: {} },
      });
      await prisma.caseAccess.create({ data: { reportId: report.id, userId: manager.id } });
      await assert.rejects(
        () =>
          reports.command(
            report.id,
            manager,
            {
              action: 'CLOSE_NO_FOLLOW_UP',
              reason: 'Belum selesai diperiksa',
              expectedVersion: report.version,
            },
            randomUUID(),
          ),
        (e: any) => e.getStatus() === 409,
      );
    },
  );
  await t.test(
    'tiket rahasia membuka rincian dan timeline publik tanpa membocorkan aktivitas internal',
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
      await prisma.caseEvent.create({
        data: {
          reportId: draft.id,
          actorId: manager.id,
          action: 'INTERNAL_NOTE',
          reason: 'Catatan internal rahasia',
          visibility: 'INTERNAL',
        },
      });
      const status = await tracking.status(draft.trackingCode!.toLowerCase());
      assert.ok(status.report.events.every((event) => event.action !== 'INTERNAL_NOTE'));
      assert.equal((status.report.payload as any).title, 'Judul rahasia pelacakan');
      assert.ok(Array.isArray(status.report.events));
      assert.equal('ownerId' in status.report, false);
      assert.equal('trackingCode' in status.report, false);
      assert.equal(status.stage, 'SUBMITTED');
      await assert.rejects(() => tracking.status('WBS/2026/00001'));
      await assert.rejects(() => tracking.status('WBS-' + '0'.repeat(32)));
      const second = await reports.create(reporter, { payload: {} });
      assert.notEqual(second.trackingCode, draft.trackingCode);
    },
  );
  await t.test(
    'super admin mengelola kategori dan identitas situs tanpa memperoleh akses perkara',
    async () => {
      const account = await createSuperAdmin(
        prisma,
        'superadmin@example.test',
        'Synthetic-Super-Admin-Password',
      );
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
      assert.equal(
        (await createSuperAdmin(prisma, account.email, 'Other-Synthetic-Password')).created,
        false,
      );
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: account.id } })).passwordHash,
        stored.passwordHash,
      );
      await assert.rejects(() =>
        createSuperAdmin(prisma, reporter.email, 'Synthetic-Super-Admin-Password'),
      );
      const superAdmin = stored as User,
        admin = new AdminService(prisma);
      const statistics = await admin.publicStatistics();
      const submittedReports = await prisma.report.findMany({ where: { stage: { not: 'DRAFT' } } });
      assert.equal(statistics.total, submittedReports.length);
      assert.equal(statistics.monthly.length, 6);
      for (const row of statistics.monthly) {
        assert.match(row.month, /^\d{4}-\d{2}$/);
        assert.ok(Number.isInteger(row.count) && row.count >= 0);
      }
      assert.deepEqual(
        statistics.monthly.map((row) => row.month),
        statistics.monthly.map((row) => row.month).sort(),
      );
      assert.equal(
        statistics.completed,
        submittedReports.filter((r) => r.stage === 'COMPLETED').length,
      );
      assert.equal(statistics.closed, submittedReports.filter((r) => r.stage === 'CLOSED').length);
      assert.equal(statistics.active + statistics.completed + statistics.closed, statistics.total);
      assert.equal(
        statistics.categories.reduce((sum, row) => sum + row.count, 0),
        statistics.total,
      );
      for (const category of statistics.categories) {
        assert.deepEqual(Object.keys(category).sort(), ['count', 'name']);
        assert.equal(
          category.count,
          submittedReports.filter((r) => {
            const payload = r.payload as { category?: string };
            return (payload.category || 'Lainnya') === category.name;
          }).length,
        );
      }
      assert.doesNotThrow(() => JSON.stringify(statistics));
      for (const person of [
        reporter,
        manager,
        official,
        investigator,
        executor,
        { ...manager, role: 'SUPER_ADMIN' as const, verified: false },
      ]) {
        assert.throws(
          () => admin.categories(person),
          (e: any) => e.getStatus() === 403,
        );
        assert.throws(
          () => admin.users(person),
          (e: any) => e.getStatus() === 403,
        );
        await assert.rejects(
          () => admin.createUser(person, {}),
          (e: any) => e.getStatus() === 403,
        );
        await assert.rejects(
          () => admin.saveSettings(person, {}),
          (e: any) => e.getStatus() === 403,
        );
      }
      const staffPassword = 'Abc123';
      for (const role of ['INVESTIGATOR', 'OFFICIAL', 'EXECUTOR', 'SUPER_ADMIN']) {
        const staff = await admin.createUser(superAdmin, {
          name: `Petugas ${role}`,
          email: `Staff-${role}@example.test`,
          password: staffPassword,
          role,
        });
        assert.equal(staff.role, role);
        assert.equal(staff.active, true);
        assert.equal(staff.verified, true);
        assert.equal(staff.email, `staff-${role.toLowerCase()}@example.test`);
        assert.equal('passwordHash' in staff, false);
        const saved = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
        assert.notEqual(saved.passwordHash, staffPassword);
        assert.ok(passwordMatches(staffPassword, saved.passwordHash));
        assert.equal(
          !!(await prisma.intakeMember.findUnique({ where: { userId: staff.id } })),
          role === 'INVESTIGATOR',
        );
        const audit = await prisma.adminAudit.findFirstOrThrow({
          where: { action: 'CREATE_USER', targetId: staff.id },
        });
        assert.equal(audit.actorId, superAdmin.id);
        assert.ok(!JSON.stringify(audit.details).includes(staffPassword));
      }
      const staffInput = {
        name: 'Duplikat',
        email: 'staff-investigator@example.test',
        password: staffPassword,
        role: 'INVESTIGATOR',
      };
      await assert.rejects(
        () => admin.createUser(superAdmin, staffInput),
        (e: any) => e.getStatus() === 409,
      );
      await assert.rejects(
        () =>
          admin.createUser(superAdmin, {
            ...staffInput,
            email: 'baru@example.test',
            role: 'ADMIN',
          }),
        (e: any) => e.getStatus() === 422,
      );
      await assert.rejects(
        () =>
          admin.createUser(superAdmin, {
            ...staffInput,
            email: 'baru@example.test',
            password: 'short',
          }),
        (e: any) => e.getStatus() === 422,
      );
      await assert.rejects(
        () => admin.createUser(superAdmin, { ...staffInput, email: 'invalid' }),
        (e: any) => e.getStatus() === 422,
      );
      const staffList = await admin.users(superAdmin);
      const editable = staffList.find(
        (person) => person.email === 'staff-investigator@example.test',
      )!;
      const originalHash = (await prisma.user.findUniqueOrThrow({ where: { id: editable.id } }))
        .passwordHash;
      const referencedReport = await prisma.report.findFirstOrThrow();
      await prisma.caseAccess.create({
        data: { userId: editable.id, reportId: referencedReport.id },
      });
      const updatedStaff = await admin.updateUser(superAdmin, editable.id, {
        name: 'Pelaksana Diperbarui',
        email: editable.email,
        role: 'EXECUTOR',
        active: true,
        password: '',
        expectedVersion: editable.authVersion,
      });
      assert.equal(updatedStaff.authVersion, editable.authVersion + 1);
      assert.equal(updatedStaff.role, 'EXECUTOR');
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: editable.id } })).passwordHash,
        originalHash,
      );
      assert.equal(
        (await prisma.intakeMember.findUniqueOrThrow({ where: { userId: editable.id } })).active,
        false,
      );
      assert.ok(
        (
          await prisma.caseAccess.findUniqueOrThrow({
            where: { reportId_userId: { reportId: referencedReport.id, userId: editable.id } },
          })
        ).revokedAt,
      );
      await assert.rejects(
        () =>
          admin.updateUser(superAdmin, editable.id, {
            ...updatedStaff,
            password: '',
            expectedVersion: editable.authVersion,
          }),
        (e: any) => e.getStatus() === 409,
      );
      await assert.rejects(
        () =>
          admin.deleteUser(superAdmin, editable.id, { expectedVersion: updatedStaff.authVersion }),
        (e: any) => e.getStatus() === 409,
      );
      assert.ok(await prisma.user.findUnique({ where: { id: editable.id } }));
      const disabled = await admin.updateUser(superAdmin, editable.id, {
        ...updatedStaff,
        active: false,
        password: 'New123',
        expectedVersion: updatedStaff.authVersion,
      });
      assert.equal(disabled.active, false);
      assert.ok(
        passwordMatches(
          'New123',
          (await prisma.user.findUniqueOrThrow({ where: { id: editable.id } })).passwordHash,
        ),
      );
      const disposable = await admin.createUser(superAdmin, {
        name: 'Disposable',
        email: 'disposable@example.test',
        role: 'INVESTIGATOR',
        password: staffPassword,
      });
      await admin.deleteUser(superAdmin, disposable.id, {
        expectedVersion: disposable.authVersion,
      });
      assert.equal(await prisma.user.findUnique({ where: { id: disposable.id } }), null);
      const selfInput = {
        name: stored.name,
        email: stored.email,
        role: 'EXECUTOR',
        active: true,
        expectedVersion: stored.authVersion,
      };
      await assert.rejects(
        () => admin.updateUser(superAdmin, superAdmin.id, selfInput),
        (e: any) => e.getStatus() === 409,
      );
      await assert.rejects(
        () => admin.deleteUser(superAdmin, superAdmin.id, { expectedVersion: stored.authVersion }),
        (e: any) => e.getStatus() === 409,
      );
      await assert.rejects(
        () => admin.updateUser(manager, editable.id, {}),
        (e: any) => e.getStatus() === 403,
      );
      await assert.rejects(
        () => admin.deleteUser(manager, editable.id, {}),
        (e: any) => e.getStatus() === 403,
      );
      assert.ok(
        staffList.every((person) => person.role !== 'REPORTER' && !('passwordHash' in person)),
      );
      let category = await admin.saveCategory(superAdmin, {
        name: 'Kategori integrasi',
        description: 'Deskripsi',
        active: true,
        sortOrder: 15,
      });
      await assert.rejects(() =>
        admin.saveCategory(superAdmin, { name: 'KATEGORI INTEGRASI', active: true, sortOrder: 15 }),
      );
      category = await admin.saveCategory(
        superAdmin,
        { ...category, name: 'Kategori diperbarui', expectedVersion: category.version },
        category.id,
      );
      await assert.rejects(() =>
        admin.saveCategory(
          superAdmin,
          { ...category, expectedVersion: category.version - 1 },
          category.id,
        ),
      );
      await admin.deleteCategory(superAdmin, category.id, category.version);
      const used = await admin.saveCategory(superAdmin, {
        name: 'Kategori dipakai',
        active: true,
        sortOrder: 80,
      });
      const report = await prisma.report.create({
        data: { ownerId: reporter.id, payload: { category: used.name } },
      });
      await prisma.caseAccess.create({ data: { reportId: report.id, userId: superAdmin.id } });
      assert.equal(
        await prisma.report.count({ where: { AND: [{ id: report.id }, caseScope(superAdmin)] } }),
        0,
      );
      await assert.rejects(() => admin.deleteCategory(superAdmin, used.id, used.version));
      await assert.rejects(() =>
        admin.saveCategory(
          superAdmin,
          { ...used, name: 'Nama lain', expectedVersion: used.version },
          used.id,
        ),
      );
      await admin.saveCategory(
        superAdmin,
        { ...used, active: false, expectedVersion: used.version },
        used.id,
      );
      assert.ok(!(await admin.publicSettings()).categories.includes(used.name));
      const draft = await reports.create(reporter, {
        payload: {
          title: 'Uji kategori nonaktif',
          category: used.name,
          what: 'Kejadian',
          who: 'Pihak',
          when: '2026-11-01',
          where: 'Lokasi',
          why: 'Dasar',
          how: 'Kronologi',
          evidenceReason: 'Sumber',
          confidentiality: 'PROTECTED',
        },
      });
      await assert.rejects(
        () =>
          reports.command(
            draft.id,
            reporter,
            { action: 'SUBMIT', expectedVersion: draft.version, reason: 'Uji kategori nonaktif' },
            randomUUID(),
          ),
        (e: any) => e.getStatus() === 422,
      );
      const settings = await admin.settings(superAdmin);
      const logo =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
      const updated = await admin.saveSettings(superAdmin, {
        ...settings,
        appName: 'Portal Integrasi',
        helpEmail: 'bantuan@example.test',
        logoDataUrl: logo,
        expectedVersion: settings.version,
      });
      assert.equal((await admin.publicSettings()).appName, 'Portal Integrasi');
      assert.equal((await admin.publicSettings()).logoDataUrl, logo);
      await assert.rejects(() =>
        admin.saveSettings(superAdmin, {
          ...updated,
          expectedVersion: updated.version,
          logoDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
        }),
      );
      await assert.rejects(() =>
        admin.saveSettings(superAdmin, { ...updated, expectedVersion: settings.version }),
      );
      assert.ok((await admin.audits(superAdmin)).length >= 5);
      await assert.rejects(db.query('DELETE FROM admin_audits'));
    },
  );
  await t.test(
    'status baca notifikasi tersimpan, dibatasi pemilik, dan tidak menandai pembaruan setelah cutoff',
    async () => {
      await prisma.notification.updateMany({
        where: { userId: reporter.id },
        data: { readAt: new Date() },
      });
      const before = new Date();
      const first = await prisma.notification.create({
        data: {
          id: randomUUID(),
          userId: reporter.id,
          message: 'Satu',
          createdAt: new Date(before.getTime() - 2000),
        },
      });
      const second = await prisma.notification.create({
        data: {
          id: randomUUID(),
          userId: reporter.id,
          message: 'Dua',
          createdAt: new Date(before.getTime() - 1000),
        },
      });
      const future = await prisma.notification.create({
        data: {
          id: randomUUID(),
          userId: reporter.id,
          message: 'Baru',
          createdAt: new Date(before.getTime() + 60000),
        },
      });
      const foreign = await prisma.notification.create({
        data: { id: randomUUID(), userId: manager.id, message: 'Privat' },
      });
      await assert.rejects(() => reports.readNotification(manager, first.id));
      assert.equal((await reports.notificationSummary(reporter)).unreadCount, 3);
      await reports.readNotification(reporter, first.id);
      assert.equal((await reports.notificationSummary(reporter)).unreadCount, 2);
      const stamp = (await prisma.notification.findUniqueOrThrow({ where: { id: first.id } }))
        .readAt;
      await reports.readNotification(reporter, first.id);
      assert.deepEqual(
        (await prisma.notification.findUniqueOrThrow({ where: { id: first.id } })).readAt,
        stamp,
      );
      assert.equal(
        (await reports.readAllNotifications(reporter, before.toISOString())).unreadCount,
        1,
      );
      assert.ok((await prisma.notification.findUniqueOrThrow({ where: { id: second.id } })).readAt);
      assert.equal(
        (await prisma.notification.findUniqueOrThrow({ where: { id: future.id } })).readAt,
        null,
      );
      assert.equal(
        (await prisma.notification.findUniqueOrThrow({ where: { id: foreign.id } })).readAt,
        null,
      );
      await assert.rejects(() => reports.readAllNotifications(reporter, 'invalid timestamp'));
      const history = await reports.notifications(reporter);
      assert.ok(history.some((n) => n.id === first.id && n.read_at));
      assert.ok(history.every((n) => n.targetPath && n.kind));
    },
  );
  await t.test('baseline database lama mempertahankan laporan dan riwayat', async () => {
    const count = await prisma.report.count();
    const snapshots = await prisma.reportVersion.count();
    // Only this disposable test database: simulate history from the previous SQL runner.
    await db.exec(
      'DROP TABLE admin_audits, site_settings, report_categories; DROP INDEX evidence_scan_queue_idx; ALTER TABLE evidence DROP COLUMN scan_error, DROP COLUMN next_scan_at; ALTER TABLE notifications DROP COLUMN title, DROP COLUMN subject, DROP COLUMN kind, DROP COLUMN target_path, DROP COLUMN read_at; ALTER TABLE reports DROP COLUMN tracking_code; DELETE FROM _prisma_migrations',
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
