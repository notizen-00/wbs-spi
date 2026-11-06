import { createApplication } from './bootstrap';
async function main() {
  const app = await createApplication();
  await app.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1');
}
main().catch(() => {
  console.error('API startup failed. Check database availability and Prisma migrations.');
  process.exitCode = 1;
});
