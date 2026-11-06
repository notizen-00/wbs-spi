import type { User } from '@wbs/contracts';
import type { Report } from '../generated/prisma/client';
import { object } from '../common/validation';
export function serializeReport(report: Report, user: User) {
  const limited = user.id !== report.ownerId && ['OFFICIAL', 'EXECUTOR'].includes(user.role);
  return {
    id: report.id,
    number: report.number,
    stage: report.stage,
    lifecycle: report.lifecycle,
    version: report.version,
    payload: limited
      ? { title: `Perkara ${report.number ?? ''}`, category: object(report.payload).category }
      : report.payload,
    clarification: limited ? undefined : report.clarification,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}
