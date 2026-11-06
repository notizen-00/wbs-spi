import { scan, ScanError } from '../storage';
scan(Buffer.from('WBS scanner connectivity check'))
  .then((status) => {
    if (status !== 'READY') throw new Error('Scanner rejected connectivity check.');
    console.log('ClamAV siap: koneksi dan pemindaian INSTREAM berhasil.');
  })
  .catch((error) => {
    console.error(error instanceof ScanError ? error.message : 'Pemeriksaan ClamAV gagal.');
    process.exitCode = 1;
  });
