import type { User } from '@wbs/contracts';
import type { Prisma } from '../generated/prisma/client';
export function caseScope(user: User): Prisma.ReportWhereInput {
  return {
    OR: [
      { ownerId: user.id },
      ...(user.role === 'ADMIN'
        ? []
        : [
            {
              stage: { not: 'DRAFT' },
              conflicts: { none: { userId: user.id } },
              access: { some: { userId: user.id, revokedAt: null } },
            },
          ]),
    ],
  };
}
