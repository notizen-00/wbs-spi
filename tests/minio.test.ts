import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { minioOptions } from '../apps/api/src/storage/minio.config';
import { MinioStorageService } from '../apps/api/src/storage/minio-storage.service';

test('konfigurasi MinIO memprioritaskan MINIO_* dan mendukung S3_* lama', () => {
  const legacy = minioOptions({
    S3_ENDPOINT: 'http://legacy.test:9000',
    S3_BUCKET: 'legacy-bucket',
    S3_ACCESS_KEY: 'legacy-key',
    S3_SECRET_KEY: 'legacy-secret',
  });
  assert.equal(legacy.bucket, 'legacy-bucket');
  assert.equal(legacy.accessKey, 'legacy-key');
  const current = minioOptions({
    S3_BUCKET: 'legacy-bucket',
    MINIO_BUCKET: 'current-bucket',
    MINIO_ENDPOINT: 'https://objects.example.test',
  });
  assert.equal(current.bucket, 'current-bucket');
  assert.equal(current.endpoint, 'https://objects.example.test');
  assert.throws(() => minioOptions({ MINIO_ENDPOINT: 'http://localhost:9000/console' }));
  assert.throws(() => minioOptions({ MINIO_ENDPOINT: 'http://user:password@localhost:9000' }));
  assert.throws(() => minioOptions({ MINIO_BUCKET: 'Invalid_Bucket' }));
});

test('client MinIO memakai signature S3, path bucket, dan roundtrip konten biner', async (t) => {
  const objects = new Map<string, Buffer>();
  const requests: { method: string; path: string; signed: boolean }[] = [];
  const server = createServer(async (req, res) => {
    const path = req.url ?? '';
    requests.push({
      method: req.method ?? '',
      path,
      signed: req.headers.authorization?.startsWith('AWS4-HMAC-SHA256 ') ?? false,
    });
    if (req.method === 'HEAD' && path === '/wbs-test/') {
      res.writeHead(200).end();
      return;
    }
    if (req.method === 'PUT') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      objects.set(path.split('?')[0]!, Buffer.concat(chunks));
      res.writeHead(200, { ETag: '"test-etag"' }).end();
      return;
    }
    if (req.method === 'GET' && objects.has(path.split('?')[0]!)) {
      const body = objects.get(path.split('?')[0]!)!;
      res
        .writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': body.length,
        })
        .end(body);
      return;
    }
    res
      .writeHead(404, { 'Content-Type': 'application/xml' })
      .end('<Error><Code>NoSuchKey</Code><Message>Not found</Message></Error>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const client = new MinioStorageService({
    endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    region: 'us-east-1',
    bucket: 'wbs-test',
    accessKey: 'synthetic-access-key',
    secretKey: 'synthetic-secret-key',
  });
  t.after(async () => {
    client.onModuleDestroy();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  await client.check();
  const body = Buffer.from([0, 1, 255, 10, 13, 0, 200]);
  await client.store('quarantine/synthetic.bin', body, 'application/octet-stream');
  assert.deepEqual(await client.retrieve('quarantine/synthetic.bin'), body);
  await assert.rejects(client.retrieve('quarantine/missing.bin'));
  assert.ok(requests.every((r) => r.signed));
  assert.ok(
    requests.some(
      (r) => r.method === 'PUT' && r.path.startsWith('/wbs-test/quarantine/synthetic.bin'),
    ),
  );
});
