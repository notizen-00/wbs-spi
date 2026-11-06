import './db';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createConnection } from 'node:net';
export const storage = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  region: process.env.S3_REGION || 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || 'wbs_local',
    secretAccessKey: process.env.S3_SECRET_KEY || 'wbs_local_secret_only',
  },
});
const bucket = process.env.S3_BUCKET || 'wbs-private';
export async function store(key: string, body: Buffer, mime: string) {
  await storage.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: mime }),
  );
}
export async function retrieve(key: string) {
  const r = await storage.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!r.Body) throw new Error('Missing object');
  return Buffer.from(await r.Body.transformToByteArray());
}
export function detectMime(b: Buffer): string | null {
  if (b.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  return null;
}
export function scan(body: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({
      host: process.env.CLAMAV_HOST || 'localhost',
      port: Number(process.env.CLAMAV_PORT || 3310),
    });
    let output = '';
    socket.setTimeout(60000);
    socket.on('timeout', () => socket.destroy(new Error('Scanner timeout')));
    socket.on('error', reject);
    socket.on('data', (chunk) => {
      output += chunk.toString();
    });
    socket.on('end', () => {
      if (output.includes('FOUND')) resolve('REJECTED');
      else if (output.includes('stream: OK')) resolve('READY');
      else reject(new Error('Scan failed'));
    });
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      for (let i = 0; i < body.length; i += 65536) {
        const chunk = body.subarray(i, i + 65536),
          size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}
