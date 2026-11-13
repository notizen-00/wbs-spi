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
      fail(404, 'Laporan tidak ditemukan. Periksa kembali nomor tiket.');
    const report = await this.prisma.report.findFirst({
      where: { trackingCode: code, stage: { not: 'DRAFT' } },
    });
    if (!report) fail(404, 'Laporan tidak ditemukan. Periksa kembali nomor tiket.');
    const events = await this.prisma.caseEvent.findMany({
      where: { reportId: report.id, visibility: 'PUBLIC' },
      orderBy: { id: 'desc' },
      select: { action: true, reason: true, createdAt: true },
    });
    const officialResponses = await this.prisma.officialResponse.findMany({
      where: { reportId: report.id },
      orderBy: { createdAt: 'desc' },
      select: { content: true, outcome: true, createdAt: true },
    });
    return {
      stage: report.stage,
      label: stageLabels[report.stage as Stage],
      lifecycle: report.lifecycle,
      updatedAt: report.updatedAt,
      report: {
        id: report.id,
        number: report.number,
        stage: report.stage,
        lifecycle: report.lifecycle,
        version: report.version,
        payload: report.payload,
        clarification: report.clarification,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        events,
      },
      officialResponses,
    };
  }
}
