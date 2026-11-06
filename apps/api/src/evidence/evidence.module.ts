import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';
import { StorageModule } from '../storage/storage.module';
@Module({
  imports: [ReportsModule, StorageModule],
  controllers: [EvidenceController],
  providers: [EvidenceService],
})
export class EvidenceModule {}
