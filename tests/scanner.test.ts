import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { scan, ScanError } from '../apps/api/src/storage';

test('ClamAV INSTREAM: berkas besar, ancaman, batas ukuran dan layanan mati', async (t) => {
  const oldHost = process.env.CLAMAV_HOST,
    oldPort = process.env.CLAMAV_PORT;
  t.after(() => {
    if (oldHost === undefined) delete process.env.CLAMAV_HOST;
    else process.env.CLAMAV_HOST = oldHost;
    if (oldPort === undefined) delete process.env.CLAMAV_PORT;
    else process.env.CLAMAV_PORT = oldPort;
  });
  process.env.CLAMAV_HOST = '127.0.0.1';
  for (const [response, expected] of [
    ['stream: OK', 'READY'],
    ['stream: Test FOUND', 'REJECTED'],
    ['INSTREAM size limit exceeded. ERROR', 'SCAN_SIZE_LIMIT'],
    ['unexpected', 'SCAN_FAILED'],
  ]) {
    await t.test(response, async () => {
      let received = Buffer.alloc(0),
        count = 0,
        command = false;
      const server = createServer((socket) =>
        socket.on('data', (data) => {
          received = Buffer.concat([received, data]);
          if (!command) {
            if (received.length < 10) return;
            assert.equal(received.subarray(0, 10).toString(), 'zINSTREAM\0');
            received = received.subarray(10);
            command = true;
          }
          while (received.length >= 4) {
            const size = received.readUInt32BE();
            if (received.length < size + 4) return;
            received = received.subarray(size + 4);
            count += size;
            if (!size) {
              socket.end(response + '\0');
              return;
            }
          }
        }),
      );
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      process.env.CLAMAV_PORT = String((server.address() as { port: number }).port);
      try {
        const bytes = Buffer.alloc(10 * 1024 * 1024, 1);
        if (expected.startsWith('SCAN_'))
          await assert.rejects(
            scan(bytes),
            (e: unknown) => e instanceof ScanError && e.code === expected,
          );
        else assert.equal(await scan(bytes), expected);
        assert.equal(count, bytes.length);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  }
  await assert.rejects(
    scan(Buffer.from('test')),
    (e: unknown) => e instanceof ScanError && e.code === 'SCANNER_UNAVAILABLE',
  );
});
