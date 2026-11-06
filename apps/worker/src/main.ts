import 'reflect-metadata';
import '../../api/src/config/environment';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { OutboxService } from './outbox.service';
import { ScannerService } from './scanner.service';
async function main() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const outbox = app.get(OutboxService),
    scanner = app.get(ScannerService);
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    while (!stopping) {
      await Promise.all([
        scanner.tick().catch(() => console.error('Scanner unavailable; evidence remains locked.')),
        outbox.tick().catch(() => console.error('Outbox unavailable; retry scheduled.')),
      ]);
      if (!stopping) await new Promise((r) => setTimeout(r, 5000));
    }
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    await app.close();
  }
}
main().catch(() => {
  console.error('Worker startup failed. Check database availability.');
  process.exitCode = 1;
});
