import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../api/src/prisma/prisma.service';
import { scan } from '../../api/src/storage';
import { MinioStorageService } from '../../api/src/storage/minio-storage.service';
import { hash } from '../../api/src/security';
@Injectable()
export class ScannerService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MinioStorageService) private readonly storage: MinioStorageService,
  ) {}
  async tick() {
    await this.prisma.$transaction(async (tx) => {
      const [candidate] = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM evidence WHERE scan_status IN ('PENDING','ERROR') AND attempts<5 ORDER BY attempts,created_at FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!candidate) return;
      const evidence = await tx.evidence.findUniqueOrThrow({ where: { id: candidate.id } });
      let status = 'ERROR';
      try {
        const bytes = await this.storage.retrieve(evidence.storageKey);
        status = hash(bytes) === evidence.checksum ? await scan(bytes) : 'REJECTED';
      } catch {
        /* Infrastructure failure keeps evidence locked. */
      }
      await tx.evidence.update({
        where: { id: evidence.id },
        data: { scanStatus: status, scanVersion: 'clamav-instream-v1', attempts: { increment: 1 } },
      });
    });
  }
}
