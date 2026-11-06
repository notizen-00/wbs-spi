import type { User } from '@wbs/contracts';
import type { Prisma } from '../generated/prisma/client';
export function caseScope(user: User): Prisma.ReportWhereInput {
  if (user.role === 'REPORTER') return { ownerId: user.id };
  if (user.role === 'ADMIN') return { id: { in: [] } };
  return {
    stage: { not: 'DRAFT' },
    conflicts: { none: { userId: user.id } },
    access: { some: { userId: user.id, revokedAt: null } },
  };
}
