import './config/environment';
import { createConnection } from 'node:net';
export class ScanError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function scan(body: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({
      host: process.env.CLAMAV_HOST || 'localhost',
      port: Number(process.env.CLAMAV_PORT || 3310),
    });
    let output = '';
    const fail = (error: ScanError) => {
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(60000);
    socket.on('timeout', () =>
      fail(
        new ScanError(
          'SCAN_TIMEOUT',
          'Pemindaian melewati batas waktu. Coba ulang atau hubungi administrator.',
        ),
      ),
    );
    socket.on('error', () =>
      fail(
        new ScanError(
          'SCANNER_UNAVAILABLE',
          'Layanan antivirus tidak dapat dihubungi. Administrator perlu menjalankan ClamAV dan memeriksa koneksinya.',
        ),
      ),
    );
    socket.on('data', (chunk) => {
      output += chunk.toString();
    });
    socket.on('end', () => {
      const result = output.replace(/\0/g, '').trim();
      if (/^stream: .+ FOUND$/.test(result)) resolve('REJECTED');
      else if (result === 'stream: OK') resolve('READY');
      else if (/size limit|INSTREAM size/i.test(result))
        reject(
          new ScanError(
            'SCAN_SIZE_LIMIT',
            'Batas ukuran antivirus terlalu kecil. Administrator perlu mengatur StreamMaxLength minimal 25M.',
          ),
        );
      else
        reject(
          new ScanError(
            'SCAN_FAILED',
            'Antivirus gagal menyelesaikan pemindaian. Administrator perlu memeriksa layanan dan database definisi virus.',
          ),
        );
    });
    socket.on('connect', () => {
      // Respect socket backpressure when sending large videos.
      void (async () => {
        const write = async (data: Buffer | string) => {
          if (!socket.write(data))
            await new Promise<void>((ok, bad) => {
              const cleanup = () => {
                socket.off('drain', drained);
                socket.off('close', closed);
              };
              const drained = () => {
                cleanup();
                ok();
              };
              const closed = () => {
                cleanup();
                bad(new Error('Scanner closed'));
              };
              socket.once('drain', drained);
              socket.once('close', closed);
            });
        };
        await write('zINSTREAM\0');
        for (let i = 0; i < body.length; i += 65536) {
          const chunk = body.subarray(i, i + 65536),
            size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.length);
          await write(size);
          await write(chunk);
        }
        await write(Buffer.alloc(4));
      })().catch(() =>
        fail(
          new ScanError(
            'SCAN_FAILED',
            'Koneksi antivirus terputus saat mengirim berkas. Coba ulang pemindaian.',
          ),
        ),
      );
    });
  });
}
