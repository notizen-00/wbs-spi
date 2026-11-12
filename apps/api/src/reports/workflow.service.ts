import { Injectable } from '@nestjs/common';
import type { User } from '@wbs/contracts';
import type { Report } from '../generated/prisma/client';
import type { TransactionClient } from '../prisma/prisma.service';
import { fail, text, object, json, validId } from '../common/validation';

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

@Injectable()
export class WorkflowService {
  async execute(tx: TransactionClient, report: Report, user: User, b: Record<string, any>) {
    const state = {
      stage: report.stage,
      lifecycle: report.lifecycle,
      proposerId: report.proposerId,
    };
    const verifier = () => {
      if (user.role !== 'INVESTIGATOR' || user.id === report.ownerId)
        fail(403, 'Memerlukan verifikator/pemeriksa perkara yang berbeda dari pelapor.');
    };
    const stage = (...allowed: string[]) => {
      if (!allowed.includes(state.stage)) fail(409, 'Tindakan tidak sesuai tahap perkara.');
    };
    const target = async (id: unknown, role: string) => {
      validId(id);
      const found = await tx.user.findFirst({
        where: {
          id,
          role,
          active: true,
          verified: true,
          NOT: { id: report.ownerId },
          conflicts: { none: { reportId: report.id } },
        },
        select: { id: true },
      });
      return found?.id ?? fail(422, 'Penerima tugas tidak memenuhi syarat.');
    };
    const grant = async (userId: string) => {
      await tx.caseAccess.upsert({
        where: { reportId_userId: { reportId: report.id, userId } },
        create: { reportId: report.id, userId },
        update: { revokedAt: null },
      });
    };
    const propose = async (type: string, payload: Record<string, unknown>) => {
      await tx.proposal.create({
        data: { reportId: report.id, type, proposerId: user.id, payload: json(payload) },
      });
      state.proposerId = user.id;
      const now = new Date();
      const officials = await tx.user.findMany({
        where: {
          role: 'OFFICIAL',
          active: true,
          verified: true,
          NOT: { id: report.ownerId },
          conflicts: { none: { reportId: report.id } },
          mandates: {
            some: {
              decisionType: type,
              validFrom: { lte: now },
              validUntil: { gt: now },
              revokedAt: null,
            },
          },
        },
        select: { id: true },
      });
      await tx.caseAccess.createMany({
        data: officials.map((u) => ({ reportId: report.id, userId: u.id })),
        skipDuplicates: true,
      });
    };
    const completedTasks = async () => {
      const total = await tx.followUpTask.count({ where: { reportId: report.id } });
      const pending = await tx.followUpTask.count({
        where: { reportId: report.id, status: { not: 'VERIFIED' } },
      });
      if (!total || pending) fail(422, 'Seluruh tindak lanjut harus diverifikasi.');
    };
    const clarification = object(report.clarification);
    if (report.lifecycle === 'SUSPENDED' && !['RESUME', 'CONFLICT'].includes(b.action))
      fail(409, 'Perkara sedang ditunda.');
    if (
      clarification.question &&
      !clarification.response &&
      !['CONFLICT', 'SUSPEND'].includes(b.action)
    )
      fail(409, 'Selesaikan klarifikasi aktif sebelum melanjutkan.');
    switch (b.action) {
      case 'PROPOSE_ASSIGNMENT':
        verifier();
        stage('INITIAL_REVIEW');
        await propose('ASSIGNMENT', {
          assigneeId: await target(b.assigneeId, 'INVESTIGATOR'),
          summary: text(b.summary, 'ringkasan tersamarkan'),
        });
        state.stage = 'ASSIGNMENT_APPROVAL';
        break;
      case 'DECIDE': {
        if (user.role !== 'OFFICIAL') fail(403, 'Memerlukan pejabat berwenang.');
        const p = await tx.proposal.findFirst({
          where: { reportId: report.id, status: 'PENDING' },
        });
        if (!p) fail(409, 'Tidak ada proposal menunggu keputusan.');
        if (p.proposerId === user.id || report.ownerId === user.id)
          fail(403, 'Persetujuan sendiri ditolak.');
        const now = new Date();
        const mandate = await tx.authorityMandate.findFirst({
          where: {
            userId: user.id,
            decisionType: p.type,
            validFrom: { lte: now },
            validUntil: { gt: now },
            revokedAt: null,
          },
        });
        if (!mandate) fail(403, 'Mandat keputusan tidak berlaku.');
        if (!['APPROVE', 'RETURN'].includes(b.decision)) fail(422, 'Pilih keputusan.');
        const payload = object(p.payload);
        await tx.approvalDecision.create({
          data: {
            proposalId: p.id,
            actorId: user.id,
            mandateId: mandate.id,
            decision: b.decision,
            reason: b.reason,
          },
        });
        await tx.proposal.update({
          where: { id: p.id },
          data: { status: b.decision === 'APPROVE' ? 'APPROVED' : 'RETURNED' },
        });
        if (b.decision === 'RETURN') {
          if (p.type === 'ASSIGNMENT') state.stage = 'INITIAL_REVIEW';
          if (p.type === 'RESULT') state.stage = 'RESULT_REVIEW';
          if (p.type === 'CLOSURE') state.stage = payload.originStage;
          if (p.type === 'REOPEN')
            await tx.reopenRequest.updateMany({
              where: { reportId: report.id, status: 'PENDING' },
              data: { status: 'REJECTED' },
            });
          break;
        }
        if (p.type === 'ASSIGNMENT') {
          const assignee = await target(payload.assigneeId, 'INVESTIGATOR');
          await tx.assignment.create({
            data: { reportId: report.id, userId: assignee, proposalId: p.id },
          });
          await grant(assignee);
          state.stage = 'INVESTIGATION';
        }
        if (p.type === 'RESULT') {
          const executor = await target(payload.executorId, 'EXECUTOR');
          await tx.followUpTask.create({
            data: { reportId: report.id, executorId: executor, instruction: payload.instruction },
          });
          await grant(executor);
          state.stage = 'FOLLOW_UP';
        }
        if (p.type === 'CLOSURE') {
          if (payload.outcome === 'COMPLETED') await completedTasks();
          await tx.officialResponse.create({
            data: {
              reportId: report.id,
              proposalId: p.id,
              content: payload.response,
              outcome: payload.outcome,
            },
          });
          state.stage = payload.outcome;
          state.lifecycle = payload.outcome;
        }
        if (p.type === 'REOPEN') {
          state.stage = payload.targetStage;
          state.lifecycle = 'ACTIVE';
          await tx.reopenRequest.updateMany({
            where: { reportId: report.id, status: 'PENDING' },
            data: { status: 'APPROVED' },
          });
        }
        break;
      }
      case 'FINDING':
        stage('INVESTIGATION');
        if (
          user.role !== 'INVESTIGATOR' ||
          !(await tx.assignment.findFirst({
            where: { reportId: report.id, userId: user.id, revokedAt: null },
          }))
        )
          fail(403, 'Penugasan pemeriksaan tidak aktif.');
        await tx.finding.create({
          data: {
            reportId: report.id,
            actorId: user.id,
            content: text(b.content, 'hasil dan rekomendasi'),
          },
        });
        state.stage = 'RESULT_REVIEW';
        break;
      case 'REVIEW_FINDING':
        verifier();
        stage('RESULT_REVIEW');
        if (b.decision !== 'RETURN') fail(422, 'Gunakan usulan hasil untuk hasil yang memadai.');
        state.stage = 'INVESTIGATION';
        break;
      case 'PROPOSE_RESULT':
        verifier();
        stage('RESULT_REVIEW');
        await propose('RESULT', {
          executorId: await target(b.executorId, 'EXECUTOR'),
          instruction: text(b.instruction, 'rencana tindak lanjut'),
        });
        state.stage = 'RESULT_APPROVAL';
        break;
      case 'EXECUTE': {
        stage('FOLLOW_UP');
        if (user.role !== 'EXECUTOR') fail(403, 'Memerlukan pelaksana.');
        validId(b.evidenceId);
        validId(b.taskId);
        const evidence = await tx.evidence.findFirst({
          where: {
            id: b.evidenceId,
            reportId: report.id,
            uploaderId: user.id,
            scanStatus: 'READY',
          },
        });
        if (!evidence) fail(422, 'Pilih bukti pelaksanaan yang telah lolos pemindaian.');
        const task = await tx.followUpTask.updateMany({
          where: {
            id: b.taskId,
            reportId: report.id,
            executorId: user.id,
            status: { in: ['OPEN', 'RETURNED'] },
          },
          data: {
            execution: text(b.execution, 'pelaksanaan tindak lanjut'),
            evidenceId: evidence.id,
            status: 'SUBMITTED',
          },
        });
        if (!task.count) fail(404, 'Tugas tidak tersedia.');
        break;
      }
      case 'REVIEW_EXECUTION': {
        verifier();
        stage('FOLLOW_UP');
        validId(b.taskId);
        if (!['VERIFY', 'RETURN'].includes(b.decision)) fail(422, 'Keputusan tidak valid.');
        const task = await tx.followUpTask.updateMany({
          where: {
            id: b.taskId,
            reportId: report.id,
            executorId: { not: user.id },
            status: 'SUBMITTED',
            ...(b.decision === 'VERIFY' ? { evidence: { is: { scanStatus: 'READY' } } } : {}),
          },
          data: { status: b.decision === 'VERIFY' ? 'VERIFIED' : 'RETURNED', reviewedBy: user.id },
        });
        if (!task.count) fail(422, 'Tugas atau bukti belum dapat diverifikasi.');
        break;
      }
      case 'PROPOSE_CLOSURE':
        verifier();
        stage('INITIAL_REVIEW', 'FOLLOW_UP');
        if (!['COMPLETED', 'CLOSED'].includes(b.outcome)) fail(422, 'Pilih hasil penutupan.');
        if (b.outcome === 'COMPLETED') {
          stage('FOLLOW_UP');
          await completedTasks();
        }
        await propose('CLOSURE', {
          outcome: b.outcome,
          response: text(b.response, 'jawaban resmi yang aman'),
          originStage: state.stage,
        });
        state.stage = 'CLOSURE_APPROVAL';
        break;
      case 'SUSPEND': {
        verifier();
        if (['DRAFT', 'COMPLETED', 'CLOSED'].includes(state.stage))
          fail(422, 'Tahap tidak dapat ditunda.');
        const evaluationAt = new Date(b.evaluationAt);
        if (!Number.isFinite(evaluationAt.getTime()) || evaluationAt.getTime() <= Date.now())
          fail(422, 'Tanggal evaluasi harus di masa mendatang.');
        await tx.suspension.create({
          data: {
            reportId: report.id,
            originStage: state.stage,
            actorId: user.id,
            reason: b.reason,
            evaluationAt,
            resumeConditions: text(b.conditions, 'syarat melanjutkan'),
          },
        });
        state.lifecycle = 'SUSPENDED';
        break;
      }
      case 'RESUME': {
        verifier();
        if (state.lifecycle !== 'SUSPENDED') fail(422, 'Perkara tidak sedang ditunda.');
        const suspension = await tx.suspension.findFirst({
          where: { reportId: report.id, resumedAt: null },
        });
        if (!suspension) fail(422, 'Penundaan tidak ditemukan.');
        await tx.suspension.update({
          where: { id: suspension.id },
          data: { resumedAt: new Date() },
        });
        state.stage = suspension.originStage;
        state.lifecycle = 'ACTIVE';
        break;
      }
      case 'REQUEST_REOPEN':
        if (user.id !== report.ownerId) fail(403, 'Hanya pelapor dapat mengajukan.');
        stage('COMPLETED', 'CLOSED');
        await tx.reopenRequest.create({
          data: { reportId: report.id, requesterId: user.id, reason: b.reason },
        });
        break;
      case 'PROPOSE_REOPEN':
        verifier();
        stage('COMPLETED', 'CLOSED');
        if (!['INITIAL_REVIEW', 'INVESTIGATION'].includes(b.targetStage))
          fail(422, 'Tahap tujuan tidak valid.');
        if (
          !(await tx.reopenRequest.findFirst({ where: { reportId: report.id, status: 'PENDING' } }))
        )
          fail(422, 'Belum ada permintaan pembukaan kembali.');
        await propose('REOPEN', { targetStage: b.targetStage });
        break;
      case 'CONFLICT':
        if (user.id === report.ownerId || user.role === 'REPORTER')
          fail(403, 'Hanya petugas terkait dapat menyatakan konflik.');
        await tx.conflict.upsert({
          where: { reportId_userId: { reportId: report.id, userId: user.id } },
          create: { reportId: report.id, userId: user.id, reason: b.reason },
          update: {},
        });
        await tx.caseAccess.updateMany({
          where: { reportId: report.id, userId: user.id },
          data: { revokedAt: new Date() },
        });
        await tx.assignment.updateMany({
          where: { reportId: report.id, userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        break;
      default:
        fail(422, 'Perintah tidak dikenal.');
    }
    return { ...state, visibility: b.action === 'REQUEST_REOPEN' ? 'PUBLIC' : 'INTERNAL' };
  }
}
