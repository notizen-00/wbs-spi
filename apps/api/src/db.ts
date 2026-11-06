import { config } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { Pool } from 'pg';
const envPath = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
  resolve(__dirname, '../../../.env'),
].find((p) => existsSync(p));
if (envPath) config({ path: envPath, quiet: true });
export const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://wbs:wbs_local_only@localhost:5432/wbs',
});
