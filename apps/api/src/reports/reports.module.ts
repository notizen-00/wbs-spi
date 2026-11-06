import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsRepository } from './reports.repository';
import { ReportsController } from './reports.controller';
import { WorkflowService } from './workflow.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PublicController } from './public.controller';
@Module({
  imports: [NotificationsModule],
  controllers: [ReportsController, PublicController],
  providers: [ReportsService, ReportsRepository, WorkflowService],
  exports: [ReportsRepository],
})
export class ReportsModule {}
