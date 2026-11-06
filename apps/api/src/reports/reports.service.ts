import { Inject, Injectable, Optional } from '@nestjs/common';
import { NotificationPublisher } from '../notifications/notification-publisher';
import { stageLabels, type Stage, type User, type ReportPayload } from '@wbs/contracts';
import { nextStage, validateSubmission } from '@wbs/domain';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { caseScope } from '../prisma/access-policy';
import { object, json, reportPayload, fail, text } from '../common/validation';
import { hash } from '../security';
import { ReportsRepository } from './reports.repository';
import { serializeReport } from './report.serializer';
import { WorkflowService, workflowActions } from './workflow.service';

@Injectable()
export class ReportsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReportsRepository) private readonly repository: ReportsRepository,
    @Inject(WorkflowService) private readonly workflow: WorkflowService,
    @Optional() @Inject(NotificationPublisher) private readonly publisher?: NotificationPublisher,
  ) {}
  async list(user: User, pageValue: unknown, qValue: unknown) {
    const page = Math.max(1, Math.min(100000, Math.trunc(Number(pageValue) || 1)));
    const q = String(qValue ?? '').slice(0, 200);
    const search: Prisma.ReportWhereInput[] = [
      { number: { contains: q, mode: 'insensitive' } },
      ...(['EXECUTOR', 'OFFICIAL'].includes(user.role)
        ? []
        : [{ payload: { path: ['title'], string_contains: q, mode: 'insensitive' as const } }]),
    ];
    const rows = await this.prisma.report.findMany({
      where: { AND: [caseScope(user), ...(q ? [{ OR: search }] : [])] },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      skip: (page - 1) * 50,
    });
    return rows.map((r) => serializeReport(r, user));
  }
  async create(user: User, input: unknown) {
    const b = object(input);
    return serializeReport(
      await this.prisma.report.create({
        data: { ownerId: user.id, payload: json(reportPayload(b.payload)) },
      }),
      user,
    );
  }
  async detail(id: string, user: User) {
    const report = await this.repository.authorized(id, user);
    const events =
      user.role === 'EXECUTOR'
        ? []
        : await this.prisma.caseEvent.findMany({
            where: { reportId: id, ...(user.role === 'REPORTER' ? { visibility: 'PUBLIC' } : {}) },
            orderBy: { id: 'desc' },
            select: { action: true, reason: true, createdAt: true },
          });
    return { ...serializeReport(report, user), events };
  }
  async save(id: string, user: User, input: unknown) {
    const b = object(input);
    this.version(b.expectedVersion);
    return this.prisma.$transaction(async (tx) => {
      const report = await this.repository.authorized(id, user, tx, true);
      if (
        report.ownerId !== user.id ||
        report.stage !== 'DRAFT' ||
        report.version !== b.expectedVersion
      )
        fail(409, 'Draf berubah atau tidak dapat diedit. Muat ulang data terbaru.');
      return serializeReport(
        await tx.report.update({
          where: { id },
          data: {
            payload: json(reportPayload(b.payload)),
            version: { increment: 1 },
            updatedAt: new Date(),
          },
        }),
        user,
      );
    });
  }
  async command(id: string, user: User, input: unknown, key: string) {
    const b = object(input);
    if (key.length < 16 || key.length > 128) fail(422, 'Idempotency-Key wajib diisi.');
    this.version(b.expectedVersion);
    const fingerprint = hash(JSON.stringify(input));
    text(b.reason, 'alasan atau catatan', 10000);
    const result = await this.prisma.$transaction(async (tx) => {
      const report = await this.repository.authorized(id, user, tx, true);
      const prior = await tx.idempotencyRecord.findUnique({
        where: { actorId_operation_key: { actorId: user.id, operation: id, key } },
      });
      if (prior) {
        if (prior.requestHash !== fingerprint)
          fail(409, 'Kunci telah dipakai untuk permintaan berbeda.');
        return { report: serializeReport(report, user), notificationIds: [] as string[] };
      }
      if (report.version !== b.expectedVersion)
        fail(409, 'Laporan telah berubah. Muat ulang sebelum melanjutkan.');
      if (report.lifecycle === 'SUSPENDED' && !['RESUME', 'CONFLICT'].includes(b.action))
        fail(409, 'Perkara sedang ditunda.');
      let state = {
        stage: report.stage,
        lifecycle: report.lifecycle,
        proposerId: report.proposerId,
        visibility: 'PUBLIC',
      };
      let number = report.number;
      let clarification = report.clarification;
      if (workflowActions.includes(b.action))
        state = await this.workflow.execute(tx, report, user, b);
      else if (b.action === 'SUBMIT') {
        if (report.ownerId !== user.id || report.stage !== 'DRAFT')
          fail(403, 'Pengiriman tidak diizinkan.');
        if (!user.verified) fail(403, 'Verifikasi email sebelum mengirim laporan.');
        try {
          validateSubmission(report.payload as unknown as ReportPayload);
        } catch (e) {
          fail(422, (e as Error).message);
        }
        const members = await tx.intakeMember.findMany({
          where: {
            active: true,
            user: {
              is: {
                role: 'MANAGER',
                active: true,
                verified: true,
                NOT: { id: user.id },
                conflicts: { none: { reportId: id } },
              },
            },
          },
          select: { userId: true },
        });
        if (!members.length)
          fail(503, 'Pengelola penerimaan belum dikonfigurasi. Draf Anda tetap tersimpan.');
        await tx.caseAccess.createMany({
          data: members.map((m) => ({ reportId: id, userId: m.userId })),
          skipDuplicates: true,
        });
        const [sequence] = await tx.$queryRaw<
          { n: bigint }[]
        >`SELECT nextval('report_numbers') AS n`;
        number = `WBS/${new Date().getUTCFullYear()}/${String(sequence!.n).padStart(5, '0')}`;
        state.stage = 'SUBMITTED';
      } else if (b.action === 'CLARIFY') {
        if (
          user.role !== 'MANAGER' ||
          report.ownerId === user.id ||
          ['DRAFT', 'COMPLETED', 'CLOSED'].includes(report.stage) ||
          (clarification && !object(clarification).response)
        )
          fail(403, 'Permintaan klarifikasi tidak diizinkan.');
        clarification = { question: b.reason, originStage: report.stage };
      } else if (b.action === 'RESPOND') {
        if (report.ownerId !== user.id || !clarification || object(clarification).response)
          fail(403, 'Tidak ada klarifikasi aktif.');
        clarification = { ...object(clarification), response: b.reason };
      } else if (b.action === 'ADVANCE') {
        if (report.stage !== 'SUBMITTED')
          fail(422, 'Gunakan perintah proposal dan keputusan khusus pada tahap ini.');
        if (user.id === report.ownerId || (clarification && !object(clarification).response))
          fail(403, 'Tindakan tidak tersedia.');
        try {
          state.stage = nextStage(report.stage as Stage, user.role, user.id, report.proposerId);
        } catch (e) {
          fail(403, (e as Error).message);
        }
      } else fail(422, 'Perintah tidak dikenali.');
      const updated = await tx.report.update({
        where: { id },
        data: {
          stage: state.stage,
          lifecycle: state.lifecycle,
          proposerId: state.proposerId,
          number,
          clarification: clarification === null ? Prisma.DbNull : json(clarification),
          version: { increment: 1 },
          updatedAt: new Date(),
        },
      });
      await tx.caseEvent.create({
        data: {
          reportId: id,
          actorId: user.id,
          action: b.action,
          reason: b.reason,
          visibility: state.visibility,
        },
      });
      if (report.stage !== state.stage && b.action !== 'SUBMIT')
        await tx.caseEvent.create({
          data: {
            reportId: id,
            actorId: user.id,
            action: 'STATUS_UPDATED',
            reason: `Status laporan: ${stageLabels[state.stage as Stage]}.`,
            visibility: 'PUBLIC',
          },
        });
      await tx.reportVersion.create({
        data: {
          reportId: id,
          version: updated.version,
          snapshot: json({
            stage: updated.stage,
            lifecycle: updated.lifecycle,
            payload: updated.payload,
            clarification: updated.clarification,
          }),
        },
      });
      await tx.idempotencyRecord.create({
        data: { actorId: user.id, operation: id, key, requestHash: fingerprint, reportId: id },
      });
      const recipients = await tx.caseAccess.findMany({
        where: {
          reportId: id,
          revokedAt: null,
          userId: { notIn: [report.ownerId, user.id] },
          user: { is: { active: true, conflicts: { none: { reportId: id } } } },
        },
        select: { userId: true },
      });
      const outbox = await tx.outboxEvent.createManyAndReturn({
        data: [
          { recipientId: report.ownerId, kind: 'UPDATE' },
          ...recipients.map((m) => ({ recipientId: m.userId, kind: 'UPDATE' })),
        ],
        select: { id: true, recipientId: true },
      });
      await tx.notification.createMany({
        data: outbox.map((event) => ({
          id: event.id,
          userId: event.recipientId,
          message: 'Ada pembaruan di portal WBS.',
        })),
        skipDuplicates: true,
      });
      return {
        report: serializeReport(updated, user),
        notificationIds: outbox.map((event) => event.id),
      };
    });
    if (result.notificationIds.length) await this.publisher?.publish(result.notificationIds);
    return result.report;
  }
  async workspace(id: string, user: User) {
    const report = await this.repository.authorized(id, user);
    const officialResponses = await this.prisma.officialResponse.findMany({
      where: { reportId: id },
      orderBy: { createdAt: 'desc' },
      select: { content: true, outcome: true, createdAt: true },
    });
    const reopenRequests = await this.prisma.reopenRequest.findMany({
      where: { reportId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, reason: true, status: true },
    });
    const safeResponses = officialResponses.map((r) => ({
      content: r.content,
      outcome: r.outcome,
      created_at: r.createdAt,
    }));
    if (user.id === report.ownerId) return { officialResponses: safeResponses, reopenRequests };
    const tasks = await this.prisma.followUpTask.findMany({
      where: { reportId: id, ...(user.role === 'EXECUTOR' ? { executorId: user.id } : {}) },
      select: { id: true, instruction: true, execution: true, status: true },
    });
    if (user.role === 'EXECUTOR')
      return {
        tasks,
        officialResponses: [],
        reopenRequests: [],
        users: [],
        proposals: [],
        findings: [],
        lifecycle: report.lifecycle,
      };
    const proposals = await this.prisma.proposal.findMany({
      where: { reportId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, type: true, payload: true, status: true },
    });
    const findings = await this.prisma.finding.findMany({
      where: { reportId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, content: true, createdAt: true },
    });
    const users =
      user.role === 'MANAGER'
        ? await this.prisma.user.findMany({
            where: { role: { in: ['INVESTIGATOR', 'EXECUTOR'] }, active: true, verified: true },
            orderBy: { name: 'asc' },
            take: 200,
            select: { id: true, name: true, role: true },
          })
        : [];
    return {
      officialResponses: safeResponses,
      reopenRequests,
      proposals,
      findings: findings.map((f) => ({ id: f.id, content: f.content, created_at: f.createdAt })),
      tasks,
      users,
      lifecycle: report.lifecycle,
    };
  }
  async notifications(user: User) {
    const rows = await this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, message: true, createdAt: true },
    });
    return rows.map((r) => ({ id: r.id, message: r.message, created_at: r.createdAt }));
  }
  private version(value: unknown) {
    if (!Number.isSafeInteger(value) || Number(value) < 1) fail(422, 'Versi laporan tidak valid.');
  }
}
