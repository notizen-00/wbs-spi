import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { fail } from '../common/validation';
import { stageLabels, type Stage } from '@wbs/contracts';
@Injectable()
export class TrackingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async status(value: unknown) {
    const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (!/^WBS-[A-F0-9]{32}$/.test(code))
      fail(404, 'Laporan tidak ditemukan. Periksa kembali kode pelacakan.');
    const report = await this.prisma.report.findFirst({
      where: { trackingCode: code, stage: { not: 'DRAFT' } },
      select: { stage: true, lifecycle: true, updatedAt: true },
    });
    if (!report) fail(404, 'Laporan tidak ditemukan. Periksa kembali kode pelacakan.');
    return {
      stage: report.stage,
      label: stageLabels[report.stage as Stage],
      lifecycle: report.lifecycle,
      updatedAt: report.updatedAt,
    };
  }
}
