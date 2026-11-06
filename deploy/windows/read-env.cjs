const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const project = process.argv[2];
const filename = path.join(project, '.env');
if (!fs.existsSync(filename)) {
  console.error('Buat .env dari .env.example terlebih dahulu.');
  process.exit(1);
}
const env = { ...dotenv.parse(fs.readFileSync(filename)), ...process.env };
// stdout is captured by PowerShell; never print this object to the user or a log.
process.stdout.write(
  JSON.stringify({
    endpoint: env.MINIO_ENDPOINT || env.S3_ENDPOINT || 'http://localhost:9000',
    bucket: env.MINIO_BUCKET || env.S3_BUCKET || 'wbs-private',
    accessKey: env.MINIO_ACCESS_KEY || env.S3_ACCESS_KEY || 'wbs_app',
    secretKey: env.MINIO_SECRET_KEY || env.S3_SECRET_KEY || 'wbs_app_secret_local_only',
    rootUser: env.MINIO_ROOT_USER || 'wbs_local',
    rootPassword: env.MINIO_ROOT_PASSWORD || 'wbs_local_secret_only',
  }),
);
