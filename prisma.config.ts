import { defineConfig } from 'prisma/config';
import './apps/api/src/config/environment';

export default defineConfig({
  schema: 'database/prisma/schema.prisma',
  migrations: { path: 'database/prisma/migrations', seed: 'tsx apps/api/src/seed.ts' },
  datasource: {
    url: process.env.DATABASE_URL!,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
