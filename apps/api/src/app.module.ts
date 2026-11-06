import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ReportsModule } from './reports/reports.module';
import { EvidenceModule } from './evidence/evidence.module';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { AdminModule } from './admin/admin.module';
@Module({
  imports: [PrismaModule, AuthModule, ReportsModule, EvidenceModule, AdminModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
