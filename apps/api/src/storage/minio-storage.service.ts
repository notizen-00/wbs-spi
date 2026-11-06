import {
  Inject,
  Injectable,
  OnModuleDestroy,
  Optional,
  ServiceUnavailableException,
  NotFoundException,
} from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { minioOptions, type MinioOptions } from './minio.config';

export const MINIO_OPTIONS = Symbol('MINIO_OPTIONS');

@Injectable()
export class MinioStorageService implements OnModuleDestroy {
  readonly options: MinioOptions;
  private readonly client: S3Client;
  constructor(@Optional() @Inject(MINIO_OPTIONS) options?: MinioOptions) {
    this.options = options ?? minioOptions();
    this.client = new S3Client({
      endpoint: this.options.endpoint,
      region: this.options.region,
      forcePathStyle: true,
      credentials: { accessKeyId: this.options.accessKey, secretAccessKey: this.options.secretKey },
      maxAttempts: 3,
    });
  }
  async store(key: string, body: Buffer, mime: string) {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.options.bucket,
          Key: key,
          Body: body,
          ContentType: mime,
        }),
      );
    } catch (error) {
      this.storageError(error);
    }
  }
  async retrieve(key: string): Promise<Buffer> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
      );
      if (!result.Body) throw new Error('MinIO object body is missing.');
      return Buffer.from(await result.Body.transformToByteArray());
    } catch (error) {
      this.storageError(error);
    }
  }
  async check() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.options.bucket }));
    } catch (error) {
      this.storageError(error);
    }
  }
  private storageError(error: unknown): never {
    const details = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (details?.name === 'NoSuchKey')
      throw new NotFoundException({
        code: 'EVIDENCE_OBJECT_MISSING',
        message: 'Berkas bukti tidak ditemukan di storage. Hubungi pengelola.',
      });
    if (details?.$metadata?.httpStatusCode === 403)
      throw new ServiceUnavailableException({
        code: 'STORAGE_ACCESS_DENIED',
        message:
          'Penyimpanan bukti menolak akses. Hubungi pengelola untuk memeriksa konfigurasi penyimpanan.',
      });
    if (details?.name === 'NoSuchBucket' || details?.$metadata?.httpStatusCode === 404)
      throw new ServiceUnavailableException({
        code: 'STORAGE_BUCKET_MISSING',
        message: 'Bucket bukti belum tersedia. Jalankan inisialisasi MinIO terlebih dahulu.',
      });
    throw new ServiceUnavailableException({
      code: 'STORAGE_UNAVAILABLE',
      message:
        'Penyimpanan MinIO belum dapat diakses. Pastikan MinIO berjalan dan konfigurasi endpoint sesuai.',
    });
  }
  onModuleDestroy() {
    this.client.destroy();
  }
}
