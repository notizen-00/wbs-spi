import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CaptchaService } from '../apps/api/src/auth/captcha.service';
test('reCAPTCHA memeriksa token, hostname, masa berlaku dan gagal tertutup tanpa konfigurasi', async (t) => {
  const keys = ['RECAPTCHA_SECRET_KEY', 'APP_ORIGIN', 'RECAPTCHA_ALLOWED_HOSTNAMES', 'NODE_ENV'];
  const old = keys.map((key) => process.env[key]);
  t.after(() =>
    keys.forEach((key, index) => {
      if (old[index] === undefined) delete process.env[key];
      else process.env[key] = old[index];
    }),
  );
  process.env.RECAPTCHA_SECRET_KEY = 'synthetic-secret';
  process.env.NODE_ENV = 'production';
  process.env.APP_ORIGIN = 'http://localhost:3000';
  delete process.env.RECAPTCHA_ALLOWED_HOSTNAMES;
  let response: Record<string, unknown> = {
    success: true,
    hostname: 'localhost',
    challenge_ts: new Date().toISOString(),
  };
  const service = new CaptchaService((async (url, options) => {
    assert.equal(url, 'https://www.google.com/recaptcha/api/siteverify');
    assert.equal((options!.body as URLSearchParams).get('secret'), 'synthetic-secret');
    return { ok: true, json: async () => response } as Response;
  }) as typeof fetch);
  await assert.rejects(
    () => service.verify(''),
    (error: any) => error.getStatus() === 422,
  );
  await service.verify('synthetic-token');
  for (const invalid of [
    { success: false, hostname: 'localhost', challenge_ts: new Date().toISOString() },
    { success: true, hostname: 'attacker.example', challenge_ts: new Date().toISOString() },
    {
      success: true,
      hostname: 'localhost',
      challenge_ts: new Date(Date.now() + 180000).toISOString(),
    },
    { success: true, hostname: 'localhost' },
  ]) {
    response = invalid;
    await assert.rejects(() => service.verify('synthetic-token'));
  }
  const unavailable = new CaptchaService((async () => {
    throw new Error('Network unavailable');
  }) as typeof fetch);
  await assert.rejects(
    () => unavailable.verify('synthetic-token'),
    (error: any) => error.getStatus() === 503,
  );
  delete process.env.RECAPTCHA_SECRET_KEY;
  await assert.rejects(
    () => service.verify('synthetic-token'),
    (error: any) => error.getStatus() === 503,
  );
  process.env.NODE_ENV = 'development';
  const development = new CaptchaService((async () => {
    throw new Error('Google must not be contacted in development');
  }) as typeof fetch);
  assert.equal(development.configuration().required, false);
  await development.verify(undefined);
  await development.verify('');
  for (const mode of ['production', 'test', '']) {
    process.env.NODE_ENV = mode;
    assert.equal(development.configuration().required, true);
    await assert.rejects(
      () => development.verify('development'),
      (error: any) => error.getStatus() === 503,
    );
  }
});
