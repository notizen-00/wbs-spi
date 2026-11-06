import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
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
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: body,
        ContentType: mime,
      }),
    );
  }
  async retrieve(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
    );
    if (!result.Body) throw new Error('MinIO object body is missing.');
    return Buffer.from(await result.Body.transformToByteArray());
  }
  async check() {
    await this.client.send(new HeadBucketCommand({ Bucket: this.options.bucket }));
  }
  onModuleDestroy() {
    this.client.destroy();
  }
}
