import { Inject, Injectable } from '@nestjs/common';
import type { User } from '@wbs/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsRepository } from '../reports/reports.repository';
import { detectMime } from '../storage';
import { MinioStorageService } from '../storage/minio-storage.service';
import { hash, token } from '../security';
import { fail, validId, object } from '../common/validation';

@Injectable()
export class EvidenceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReportsRepository) private readonly reports: ReportsRepository,
    @Inject(MinioStorageService) private readonly storage: MinioStorageService,
  ) {}
  async list(id: string, user: User) {
    await this.reports.authorized(id, user);
    const rows = await this.prisma.evidence.findMany({
      where: { reportId: id, ...(user.role === 'EXECUTOR' ? { uploaderId: user.id } : {}) },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        originalName: true,
        mime: true,
        bytes: true,
        scanStatus: true,
        createdAt: true,
      },
    });
    return rows.map((e) => ({
      id: e.id,
      name: e.originalName,
      mime: e.mime,
      bytes: e.bytes,
      status: e.scanStatus,
      created_at: e.createdAt,
    }));
  }
  async upload(id: string, user: User, input: unknown) {
    const b = object(input);
    if (
      typeof b.name !== 'string' ||
      typeof b.data !== 'string' ||
      !b.data.length ||
      b.data.length > 27962030 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(b.data)
    )
      fail(422, 'Berkas tidak valid atau melebihi 20 MiB.');
    const bytes = Buffer.from(b.data, 'base64');
    if (!bytes.length || bytes.length > 20971520) fail(422, 'Batas berkas 20 MiB.');
    const mime = detectMime(bytes);
    const extensions: Record<string, RegExp> = {
      'application/pdf': /\.pdf$/i,
      'image/png': /\.png$/i,
      'image/jpeg': /\.jpe?g$/i,
    };
    if (!mime || !extensions[mime]?.test(b.name))
      fail(422, 'Hanya PDF, JPEG, dan PNG dengan format sesuai yang diterima.');
    return this.prisma.$transaction(async (tx) => {
      const report = await this.reports.authorized(id, user, tx, true);
      if (['COMPLETED', 'CLOSED'].includes(report.stage) || report.lifecycle === 'SUSPENDED')
        fail(409, 'Perkara tidak menerima bukti pada tahap ini.');
      if ((await tx.evidence.count({ where: { reportId: id } })) >= 10)
        fail(422, 'Maksimal 10 berkas per laporan pada versi kebijakan awal.');
      const key = `quarantine/${token()}`;
      await this.storage.store(key, bytes, mime);
      const evidence = await tx.evidence.create({
        data: {
          reportId: id,
          uploaderId: user.id,
          storageKey: key,
          originalName: b.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(-150),
          mime,
          bytes: bytes.length,
          checksum: hash(bytes),
        },
      });
      await tx.sensitiveAccessEvent.create({
        data: { actorId: user.id, reportId: id, evidenceId: evidence.id, action: 'UPLOAD' },
      });
      return { id: evidence.id, status: evidence.scanStatus };
    });
  }
  async download(id: string, user: User) {
    validId(id);
    return this.prisma.$transaction(async (tx) => {
      const metadata = await tx.evidence.findUnique({ where: { id }, select: { reportId: true } });
      if (!metadata) fail(404, 'Bukti tidak ditemukan.');
      await this.reports.authorized(metadata.reportId, user, tx, true);
      const e = await tx.evidence.findUniqueOrThrow({ where: { id } });
      if (user.role === 'EXECUTOR' && e.uploaderId !== user.id) fail(404, 'Bukti tidak ditemukan.');
      if (e.scanStatus !== 'READY') fail(409, 'Bukti belum lolos pemindaian keamanan.');
      const bytes = await this.storage.retrieve(e.storageKey);
      if (hash(bytes) !== e.checksum) fail(409, 'Integritas bukti tidak sesuai.');
      await tx.sensitiveAccessEvent.create({
        data: { actorId: user.id, reportId: e.reportId, evidenceId: id, action: 'DOWNLOAD' },
      });
      return { bytes, mime: e.mime, name: e.originalName };
    });
  }
}
