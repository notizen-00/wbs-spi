import { Inject, Injectable } from '@nestjs/common';
import type { User } from '@wbs/contracts';
import { PrismaService, type TransactionClient } from '../prisma/prisma.service';
import { caseScope } from '../prisma/access-policy';
import { validId, fail } from '../common/validation';
@Injectable()
export class ReportsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async authorized(id: string, user: User, tx: TransactionClient = this.prisma, lock = false) {
    validId(id);
    if (lock) await tx.$queryRaw`SELECT id FROM reports WHERE id=${id}::uuid FOR UPDATE`;
    const report = await tx.report.findFirst({ where: { id, AND: caseScope(user) } });
    return report ?? fail(404, 'Laporan tidak ditemukan.');
  }
}
