const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const dotenv = require('dotenv');
const root = process.argv[2];
const env = { ...dotenv.parse(fs.readFileSync(path.join(root, '.env'))), ...process.env };
const endpoint = env.MINIO_ENDPOINT || env.S3_ENDPOINT || 'http://localhost:9000';
const bucket = env.MINIO_BUCKET || env.S3_BUCKET || 'wbs-private';
const user = env.MINIO_ACCESS_KEY || env.S3_ACCESS_KEY || 'wbs_app';
const password = env.MINIO_SECRET_KEY || env.S3_SECRET_KEY || 'wbs_app_secret_local_only';
const admin = env.MINIO_ROOT_USER || 'wbs_local';
const adminPassword = env.MINIO_ROOT_PASSWORD || 'wbs_local_secret_only';
const runtime = path.join(root, '.local/windows');
const mc = path.join(runtime, 'bin/mc.exe');
fs.mkdirSync(runtime, { recursive: true });
const config = fs.mkdtempSync(path.join(runtime, 'mc-bootstrap-'));
const policy = path.join(config, 'evidence-policy.json');
const run = (...args) =>
  execFileSync(mc, ['--config-dir', config, ...args], {
    windowsHide: true,
    stdio: 'pipe',
    env: { ...process.env },
  });
try {
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('Invalid bucket');
  fs.mkdirSync(config, { recursive: true });
  run('alias', 'set', 'local', endpoint, admin, adminPassword);
  run('mb', '--ignore-existing', `local/${bucket}`);
  run('anonymous', 'set', 'none', `local/${bucket}`);
  if (user !== admin) {
    fs.writeFileSync(
      policy,
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['s3:GetBucketLocation', 's3:ListBucket'],
            Resource: [`arn:aws:s3:::${bucket}`],
          },
          {
            Effect: 'Allow',
            Action: ['s3:PutObject', 's3:GetObject'],
            Resource: [`arn:aws:s3:::${bucket}/quarantine/*`],
          },
        ],
      }),
    );
    run('admin', 'user', 'add', 'local', user, password);
    run('admin', 'policy', 'create', 'local', 'wbs-evidence', policy);
    run('admin', 'policy', 'attach', 'local', 'wbs-evidence', '--user', user);
  }
  console.log('Bucket privat dan akses aplikasi MinIO siap.');
} catch {
  console.error(
    'Bootstrap MinIO gagal. Periksa kredensial root/aplikasi dan konfigurasi endpoint.',
  );
  process.exitCode = 1;
} finally {
  if (fs.existsSync(policy)) fs.unlinkSync(policy);
  if (fs.existsSync(config)) {
    const resolvedBase = fs.realpathSync(runtime);
    const resolvedConfig = fs.realpathSync(config);
    if (
      path.dirname(resolvedConfig) !== resolvedBase ||
      !path.basename(resolvedConfig).startsWith('mc-bootstrap-')
    )
      throw new Error('Unsafe bootstrap cleanup path.');
    fs.rmSync(resolvedConfig, { recursive: true, force: true });
  }
}
