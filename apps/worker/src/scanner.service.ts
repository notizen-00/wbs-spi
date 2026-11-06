import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../api/src/prisma/prisma.service';
import { scan, ScanError } from '../../api/src/storage';
import { MinioStorageService } from '../../api/src/storage/minio-storage.service';
import { hash } from '../../api/src/security';
@Injectable()
export class ScannerService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MinioStorageService) private readonly storage: MinioStorageService,
  ) {}
  async tick() {
    await this.prisma.$transaction(
      async (tx) => {
        const [candidate] = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM evidence WHERE scan_status IN ('PENDING','ERROR') AND attempts<5 AND next_scan_at<=now() ORDER BY attempts,created_at FOR UPDATE SKIP LOCKED LIMIT 1`;
        if (!candidate) return;
        const evidence = await tx.evidence.findUniqueOrThrow({ where: { id: candidate.id } });
        let status = 'ERROR';
        let reason: string | null = null;
        try {
          const bytes = await this.storage.retrieve(evidence.storageKey);
          if (hash(bytes) !== evidence.checksum) {
            status = 'REJECTED';
            reason = 'Integritas berkas tidak sesuai. Unggah kembali berkas asli.';
          } else {
            status = await scan(bytes);
            if (status === 'REJECTED')
              reason = 'Antivirus mendeteksi ancaman pada berkas. Berkas tetap dikarantina.';
          }
        } catch (error) {
          if (error instanceof ScanError) reason = error.message;
          else {
            const response = (error as { getResponse?: () => unknown })?.getResponse?.() as
              { message?: unknown } | undefined;
            reason =
              typeof response?.message === 'string'
                ? response.message
                : 'Berkas tidak dapat dibaca dari penyimpanan. Hubungi pengelola.';
          }
        }
        await tx.evidence.update({
          where: { id: evidence.id },
          data: {
            scanStatus: status,
            scanError: reason,
            nextScanAt: new Date(Date.now() + Math.min(300000, 15000 * 2 ** evidence.attempts)),
            scanVersion: 'clamav-instream-v1',
            attempts: { increment: 1 },
          },
        });
      },
      { timeout: 90000 },
    );
  }
}
