import { MinioStorageService } from './minio-storage.service';
async function main() {
  let storage: MinioStorageService | undefined;
  try {
    storage = new MinioStorageService();
    await storage.check();
    console.log('MinIO terhubung dan bucket dapat diakses.');
  } catch {
    console.error(
      'Tidak dapat mengakses bucket MinIO. Periksa endpoint API, kredensial, bucket, dan layanan MinIO.',
    );
    process.exitCode = 1;
  } finally {
    storage?.onModuleDestroy();
  }
}
main();
