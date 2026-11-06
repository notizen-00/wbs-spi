import { HttpException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { User } from '@wbs/contracts';
function deny(message: string, status = 422): never {
  throw new HttpException({ message }, status);
}
const text = (value: any, name: string) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 20000) deny(`Lengkapi ${name}.`);
  return value.trim();
};
export const workflowActions = [
  'PROPOSE_ASSIGNMENT',
  'DECIDE',
  'FINDING',
  'REVIEW_FINDING',
  'PROPOSE_RESULT',
  'EXECUTE',
  'REVIEW_EXECUTION',
  'PROPOSE_CLOSURE',
  'SUSPEND',
  'RESUME',
  'REQUEST_REOPEN',
  'PROPOSE_REOPEN',
  'CONFLICT',
];
export async function workflow(c: PoolClient, r: any, u: User, b: any) {
  const manager = () => {
    if (u.role !== 'MANAGER' || u.id === r.owner_id)
      deny('Memerlukan pengelola perkara yang berbeda dari pelapor.', 403);
  };
  const stage = (...allowed: string[]) => {
    if (!allowed.includes(r.stage)) deny('Tindakan tidak sesuai tahap perkara.', 409);
  };
  const target = async (id: any, role: string) => {
    const { rows } = await c.query(
      'SELECT id FROM users WHERE id::text=$1 AND role=$2 AND active=true AND verified=true AND id<>$3 AND NOT EXISTS(SELECT 1 FROM conflicts WHERE report_id=$4 AND user_id=users.id)',
      [String(id), role, r.owner_id, r.id],
    );
    if (!rows[0]) deny('Penerima tugas tidak memenuhi syarat.');
    return rows[0].id;
  };
  const grant = async (id: string) => {
    await c.query(
      'INSERT INTO case_access(report_id,user_id) VALUES($1,$2) ON CONFLICT(report_id,user_id) DO UPDATE SET revoked_at=NULL',
      [r.id, id],
    );
  };
  const propose = async (type: string, data: any) => {
    await c.query('INSERT INTO proposals(report_id,type,proposer_id,payload) VALUES($1,$2,$3,$4)', [
      r.id,
      type,
      u.id,
      data,
    ]);
    r.proposer_id = u.id;
    await c.query(
      `INSERT INTO case_access(report_id,user_id)
       SELECT $1,m.user_id FROM authority_mandates m JOIN users u ON u.id=m.user_id
       WHERE m.decision_type=$2 AND m.valid_from<=now() AND m.valid_until>now() AND m.revoked_at IS NULL
       AND u.active=true AND u.verified=true AND u.role='OFFICIAL' AND u.id<>$3
       AND NOT EXISTS(SELECT 1 FROM conflicts f WHERE f.report_id=$1 AND f.user_id=u.id)
       ON CONFLICT DO NOTHING`,
      [r.id, type, r.owner_id],
    );
  };
  if (r.lifecycle === 'SUSPENDED' && !['RESUME', 'CONFLICT'].includes(b.action))
    deny('Perkara sedang ditunda.', 409);
  if (
    r.clarification &&
    !r.clarification.response &&
    !['CONFLICT', 'SUSPEND', 'RESPOND'].includes(b.action)
  )
    deny('Selesaikan klarifikasi aktif sebelum melanjutkan.', 409);
  if (b.action === 'PROPOSE_ASSIGNMENT') {
    manager();
    stage('INITIAL_REVIEW');
    const assignee = await target(b.assigneeId, 'INVESTIGATOR');
    await propose('ASSIGNMENT', {
      assigneeId: assignee,
      summary: text(b.summary, 'ringkasan tersamarkan'),
    });
    r.stage = 'ASSIGNMENT_APPROVAL';
  } else if (b.action === 'DECIDE') {
    if (u.role !== 'OFFICIAL') deny('Memerlukan pejabat berwenang.', 403);
    const { rows } = await c.query(
      "SELECT * FROM proposals WHERE report_id=$1 AND status='PENDING' FOR UPDATE",
      [r.id],
    );
    const p = rows[0];
    if (!p) deny('Tidak ada proposal menunggu keputusan.', 409);
    if (p.proposer_id === u.id || u.id === r.owner_id) deny('Persetujuan sendiri ditolak.', 403);
    const mandates = await c.query(
      'SELECT id FROM authority_mandates WHERE user_id=$1 AND decision_type=$2 AND valid_from<=now() AND valid_until>now() AND revoked_at IS NULL LIMIT 1',
      [u.id, p.type],
    );
    const mandate = mandates.rows[0];
    if (!mandate) deny('Mandat keputusan tidak berlaku.', 403);
    if (!['APPROVE', 'RETURN'].includes(b.decision)) deny('Pilih keputusan.');
    await c.query(
      'INSERT INTO approval_decisions(proposal_id,actor_id,mandate_id,decision,reason) VALUES($1,$2,$3,$4,$5)',
      [p.id, u.id, mandate.id, b.decision, b.reason],
    );
    await c.query('UPDATE proposals SET status=$1 WHERE id=$2', [
      b.decision === 'APPROVE' ? 'APPROVED' : 'RETURNED',
      p.id,
    ]);
    if (b.decision === 'RETURN') {
      if (p.type === 'ASSIGNMENT') r.stage = 'INITIAL_REVIEW';
      if (p.type === 'RESULT') r.stage = 'RESULT_REVIEW';
      if (p.type === 'CLOSURE') r.stage = p.payload.originStage;
      if (p.type === 'REOPEN')
        await c.query(
          "UPDATE reopen_requests SET status='REJECTED' WHERE report_id=$1 AND status='PENDING'",
          [r.id],
        );
    } else if (p.type === 'ASSIGNMENT') {
      const assignee = await target(p.payload.assigneeId, 'INVESTIGATOR');
      await c.query('INSERT INTO assignments(report_id,user_id,proposal_id) VALUES($1,$2,$3)', [
        r.id,
        assignee,
        p.id,
      ]);
      await grant(assignee);
      r.stage = 'INVESTIGATION';
    } else if (p.type === 'RESULT') {
      const executor = await target(p.payload.executorId, 'EXECUTOR');
      await c.query(
        'INSERT INTO follow_up_tasks(report_id,executor_id,instruction) VALUES($1,$2,$3)',
        [r.id, executor, p.payload.instruction],
      );
      await grant(executor);
      r.stage = 'FOLLOW_UP';
    } else if (p.type === 'CLOSURE') {
      if (p.payload.outcome === 'COMPLETED') {
        const tasks = await c.query(
          "SELECT count(*)::int AS count, count(*) FILTER(WHERE status<>'VERIFIED')::int AS pending FROM follow_up_tasks WHERE report_id=$1",
          [r.id],
        );
        if (!tasks.rows[0].count || tasks.rows[0].pending)
          deny('Seluruh tindak lanjut harus diverifikasi.');
      }
      await c.query(
        'INSERT INTO official_responses(report_id,proposal_id,content,outcome) VALUES($1,$2,$3,$4)',
        [r.id, p.id, p.payload.response, p.payload.outcome],
      );
      r.stage = p.payload.outcome;
      r.lifecycle = p.payload.outcome;
    } else if (p.type === 'REOPEN') {
      r.stage = p.payload.targetStage;
      r.lifecycle = 'ACTIVE';
      await c.query(
        "UPDATE reopen_requests SET status='APPROVED' WHERE report_id=$1 AND status='PENDING'",
        [r.id],
      );
    }
  } else if (b.action === 'FINDING') {
    stage('INVESTIGATION');
    if (
      u.role !== 'INVESTIGATOR' ||
      !(
        await c.query(
          'SELECT 1 FROM assignments WHERE report_id=$1 AND user_id=$2 AND revoked_at IS NULL',
          [r.id, u.id],
        )
      ).rowCount
    )
      deny('Penugasan pemeriksaan tidak aktif.', 403);
    await c.query('INSERT INTO findings(report_id,actor_id,content) VALUES($1,$2,$3)', [
      r.id,
      u.id,
      text(b.content, 'hasil dan rekomendasi'),
    ]);
    r.stage = 'RESULT_REVIEW';
  } else if (b.action === 'REVIEW_FINDING') {
    manager();
    stage('RESULT_REVIEW');
    if (b.decision !== 'RETURN') deny('Gunakan usulan hasil untuk hasil yang memadai.');
    r.stage = 'INVESTIGATION';
  } else if (b.action === 'PROPOSE_RESULT') {
    manager();
    stage('RESULT_REVIEW');
    const executor = await target(b.executorId, 'EXECUTOR');
    await propose('RESULT', {
      executorId: executor,
      instruction: text(b.instruction, 'rencana tindak lanjut'),
    });
    r.stage = 'RESULT_APPROVAL';
  } else if (b.action === 'EXECUTE') {
    stage('FOLLOW_UP');
    if (u.role !== 'EXECUTOR') deny('Memerlukan pelaksana.', 403);
    const evidence = await c.query(
      "SELECT id FROM evidence WHERE id::text=$1 AND report_id=$2 AND uploader_id=$3 AND scan_status='READY'",
      [String(b.evidenceId), r.id, u.id],
    );
    if (!evidence.rows[0]) deny('Pilih bukti pelaksanaan yang telah lolos pemindaian.');
    const t = await c.query(
      "UPDATE follow_up_tasks SET execution=$1,status='SUBMITTED',evidence_id=$5 WHERE id::text=$2 AND report_id=$3 AND executor_id=$4 AND status IN ('OPEN','RETURNED') RETURNING id",
      [
        text(b.execution, 'pelaksanaan tindak lanjut'),
        String(b.taskId),
        r.id,
        u.id,
        evidence.rows[0].id,
      ],
    );
    if (!t.rowCount) deny('Tugas tidak tersedia.', 404);
  } else if (b.action === 'REVIEW_EXECUTION') {
    manager();
    stage('FOLLOW_UP');
    if (!['VERIFY', 'RETURN'].includes(b.decision)) deny('Keputusan tidak valid.');
    const t = await c.query(
      "UPDATE follow_up_tasks t SET status=$4,reviewed_by=$1 WHERE id::text=$2 AND report_id=$3 AND executor_id<>$1 AND status='SUBMITTED' AND ($4='RETURNED' OR EXISTS(SELECT 1 FROM evidence e WHERE e.id=t.evidence_id AND scan_status='READY')) RETURNING id",
      [u.id, String(b.taskId), r.id, b.decision === 'VERIFY' ? 'VERIFIED' : 'RETURNED'],
    );
    if (!t.rowCount) deny('Tugas atau bukti belum dapat diverifikasi.');
  } else if (b.action === 'PROPOSE_CLOSURE') {
    manager();
    stage('INITIAL_REVIEW', 'FOLLOW_UP');
    if (!['COMPLETED', 'CLOSED'].includes(b.outcome)) deny('Pilih hasil penutupan.');
    if (b.outcome === 'COMPLETED') {
      stage('FOLLOW_UP');
      const t = await c.query(
        "SELECT count(*)::int AS count,count(*) FILTER(WHERE status<>'VERIFIED')::int AS pending FROM follow_up_tasks WHERE report_id=$1",
        [r.id],
      );
      if (!t.rows[0].count || t.rows[0].pending) deny('Tindak lanjut belum tuntas.');
    }
    await propose('CLOSURE', {
      outcome: b.outcome,
      response: text(b.response, 'jawaban resmi yang aman'),
      originStage: r.stage,
    });
    r.stage = 'CLOSURE_APPROVAL';
  } else if (b.action === 'SUSPEND') {
    manager();
    if (['DRAFT', 'COMPLETED', 'CLOSED'].includes(r.stage)) deny('Tahap tidak dapat ditunda.');
    const evaluation = new Date(b.evaluationAt);
    if (!Number.isFinite(evaluation.getTime()) || evaluation.getTime() <= Date.now())
      deny('Tanggal evaluasi harus di masa mendatang.');
    await c.query(
      'INSERT INTO suspensions(report_id,origin_stage,actor_id,reason,evaluation_at,resume_conditions) VALUES($1,$2,$3,$4,$5,$6)',
      [r.id, r.stage, u.id, b.reason, evaluation, text(b.conditions, 'syarat melanjutkan')],
    );
    r.lifecycle = 'SUSPENDED';
  } else if (b.action === 'RESUME') {
    manager();
    if (r.lifecycle !== 'SUSPENDED') deny('Perkara tidak sedang ditunda.');
    const s = await c.query(
      'UPDATE suspensions SET resumed_at=now() WHERE report_id=$1 AND resumed_at IS NULL RETURNING origin_stage',
      [r.id],
    );
    if (!s.rows[0]) deny('Penundaan tidak ditemukan.');
    r.stage = s.rows[0].origin_stage;
    r.lifecycle = 'ACTIVE';
  } else if (b.action === 'REQUEST_REOPEN') {
    if (u.id !== r.owner_id) deny('Hanya pelapor dapat mengajukan.', 403);
    stage('COMPLETED', 'CLOSED');
    await c.query('INSERT INTO reopen_requests(report_id,requester_id,reason) VALUES($1,$2,$3)', [
      r.id,
      u.id,
      b.reason,
    ]);
  } else if (b.action === 'PROPOSE_REOPEN') {
    manager();
    stage('COMPLETED', 'CLOSED');
    if (!['INITIAL_REVIEW', 'INVESTIGATION'].includes(b.targetStage))
      deny('Tahap tujuan tidak valid.');
    if (
      !(
        await c.query("SELECT 1 FROM reopen_requests WHERE report_id=$1 AND status='PENDING'", [
          r.id,
        ])
      ).rowCount
    )
      deny('Belum ada permintaan pembukaan kembali.');
    await propose('REOPEN', { targetStage: b.targetStage });
  } else if (b.action === 'CONFLICT') {
    if (u.id === r.owner_id || u.role === 'REPORTER')
      deny('Hanya petugas terkait dapat menyatakan konflik.', 403);
    await c.query(
      'INSERT INTO conflicts(report_id,user_id,reason) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
      [r.id, u.id, b.reason],
    );
    await c.query('UPDATE case_access SET revoked_at=now() WHERE report_id=$1 AND user_id=$2', [
      r.id,
      u.id,
    ]);
    await c.query('UPDATE assignments SET revoked_at=now() WHERE report_id=$1 AND user_id=$2', [
      r.id,
      u.id,
    ]);
  } else deny('Perintah tidak dikenal.');
  await c.query('UPDATE reports SET stage=$1,lifecycle=$2,proposer_id=$3 WHERE id=$4', [
    r.stage,
    r.lifecycle,
    r.proposer_id,
    r.id,
  ]);
  return {
    stage: r.stage,
    proposer: r.proposer_id,
    visibility: b.action === 'REQUEST_REOPEN' ? 'PUBLIC' : 'INTERNAL',
  };
}
