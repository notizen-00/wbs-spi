import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { workflow } from '../apps/api/src/workflow';
import { caseScope } from '../apps/api/src/access';
import type { User } from '@wbs/contracts';

test('migrasi dan alur perkara, mandat, konflik, penundaan, penutupan dan reopen', async (t) => {
  const db = new PGlite();
  await db.waitReady;
  for (const f of readdirSync('database/migrations').sort())
    await db.exec(readFileSync(`database/migrations/${f}`, 'utf8'));
  const people: Record<string, User> = {};
  for (const role of ['REPORTER', 'MANAGER', 'OFFICIAL', 'INVESTIGATOR', 'EXECUTOR']) {
    const result = await db.query<any>(
      "INSERT INTO users(name,email,password_hash,role,verified) VALUES($1,$2,'hash',$3,true) RETURNING *",
      [role, `${role.toLowerCase()}@example.test`, role],
    );
    people[role] = result.rows[0];
  }
  const c = {
    query: async (sql: string, params?: any[]) => {
      const result = await db.query(sql, params);
      return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
    },
  } as any;
  const reporter = people.REPORTER!,
    manager = people.MANAGER!,
    official = people.OFFICIAL!,
    investigator = people.INVESTIGATOR!,
    executor = people.EXECUTOR!;
  let r = (
    await db.query<any>(
      "INSERT INTO reports(owner_id,stage) VALUES($1,'INITIAL_REVIEW') RETURNING *",
      [reporter.id],
    )
  ).rows[0];
  async function command(u: User, b: any) {
    await db.exec('BEGIN');
    try {
      await workflow(c, r, u, { reason: 'Motivasi untuk pengujian', ...b });
      await db.exec('COMMIT');
    } catch (e) {
      await db.exec('ROLLBACK');
      throw e;
    }
    r = (await db.query<any>('SELECT * FROM reports WHERE id=$1', [r.id])).rows[0];
  }
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
    const scope = caseScope();
    const read = async (id: string, user: User) =>
      (
        await db.query(`SELECT r.id FROM reports r WHERE r.id=$1 AND ${scope}`, [
          id,
          user.id,
          user.role,
        ])
      ).rows.length;
    assert.equal(await read(draft.id, manager), 0);
    assert.equal(await read(draft.id, reporter), 1);
    assert.equal(await read(r.id, { ...official, role: 'ADMIN' }), 0);
    assert.equal(await read(r.id, investigator), 0);
  });
  await db.close();
});
