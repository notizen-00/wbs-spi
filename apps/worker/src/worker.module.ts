import { Module } from '@nestjs/common';
import { PrismaModule } from '../../api/src/prisma/prisma.module';
import { OutboxService } from './outbox.service';
import { ScannerService } from './scanner.service';
import { StorageModule } from '../../api/src/storage/storage.module';
import { NotificationPublisher } from '../../api/src/notifications/notification-publisher';
@Module({
  imports: [PrismaModule, StorageModule],
  providers: [OutboxService, ScannerService, NotificationPublisher],
})
export class WorkerModule {}
