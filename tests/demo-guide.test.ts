import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PublicController } from '../apps/api/src/reports/public.controller';

test('demo credentials are opt-in and unavailable outside development', (t) => {
  const keys = ['NODE_ENV', 'DEMO_PUBLIC_PASSWORD', 'SEED_PASSWORD', 'SUPER_ADMIN_PASSWORD'];
  const previous = keys.map((key) => process.env[key]);
  t.after(() =>
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    }),
  );
  const guide = () => PublicController.prototype.demoGuide();
  process.env.NODE_ENV = 'development';
  process.env.SEED_PASSWORD = 'private-seed-password';
  process.env.SUPER_ADMIN_PASSWORD = 'private-admin-password';
  delete process.env.DEMO_PUBLIC_PASSWORD;
  assert.deepEqual(guide(), { password: null });
  process.env.DEMO_PUBLIC_PASSWORD = 'public-demo-password';
  assert.deepEqual(guide(), { password: 'public-demo-password' });
  for (const mode of ['production', 'test', '']) {
    process.env.NODE_ENV = mode;
    assert.throws(guide, (error: any) => error.getStatus() === 404);
  }
  delete process.env.NODE_ENV;
  assert.throws(guide, (error: any) => error.getStatus() === 404);
});
