import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')].find(
  existsSync,
);
if (envPath) config({ path: envPath, quiet: true });
process.env.DATABASE_URL ??= 'postgresql://wbs:wbs_local_only@localhost:5432/wbs';
