import { Module } from '@nestjs/common';
import { PrismaModule } from '../../api/src/prisma/prisma.module';
import { OutboxService } from './outbox.service';
import { ScannerService } from './scanner.service';
import { StorageModule } from '../../api/src/storage/storage.module';
@Module({ imports: [PrismaModule, StorageModule], providers: [OutboxService, ScannerService] })
export class WorkerModule {}
