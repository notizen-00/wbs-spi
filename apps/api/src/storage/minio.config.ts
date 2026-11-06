import '../config/environment';

export interface MinioOptions {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

export function minioOptions(env: NodeJS.ProcessEnv = process.env): MinioOptions {
  const endpoint = env.MINIO_ENDPOINT || env.S3_ENDPOINT || 'http://localhost:9000';
  const url = new URL(endpoint);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['', '/'].includes(url.pathname)
  ) {
    throw new Error('MINIO_ENDPOINT harus berupa URL API HTTP/HTTPS tanpa path atau kredensial.');
  }
  const bucket = env.MINIO_BUCKET || env.S3_BUCKET || 'wbs-private';
  if (
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
    bucket.includes('..') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(bucket)
  ) {
    throw new Error('Nama MINIO_BUCKET tidak valid.');
  }
  return {
    endpoint: url.origin,
    region: env.MINIO_REGION || env.S3_REGION || 'us-east-1',
    bucket,
    accessKey: env.MINIO_ACCESS_KEY || env.S3_ACCESS_KEY || 'wbs_app',
    secretKey: env.MINIO_SECRET_KEY || env.S3_SECRET_KEY || 'wbs_app_secret_local_only',
  };
}
