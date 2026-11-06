import './config/environment';
import { createConnection } from 'node:net';
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
