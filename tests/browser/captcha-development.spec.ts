import { test, expect } from '@playwright/test';

test('mode development tidak memuat Google dan login tetap dapat diulang tanpa CAPTCHA', async ({
  page,
}) => {
  let attempts = 0,
    googleRequests = 0;
  await page.route('https://www.google.com/recaptcha/**', (route) => {
    googleRequests++;
    return route.abort();
  });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/public/captcha'))
      return route.fulfill({ json: { siteKey: '', configured: false, required: false } });
    if (path.endsWith('/me'))
      return route.fulfill({ status: 401, json: { message: 'Silakan masuk' } });
    if (path.endsWith('/auth/login')) {
      attempts++;
      return route.fulfill(
        attempts === 1
          ? { status: 401, json: { message: 'Kata sandi salah' } }
          : { json: { id: 'dev-user', name: 'Pelapor Uji', role: 'REPORTER', verified: true } },
      );
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('pelapor@example.test');
  await page.getByLabel('Kata sandi', { exact: true }).fill('Synthetic-Password');
  const submit = page.getByRole('button', { name: 'Masuk ke akun', exact: true });
  await expect(page.locator('.captcha-field')).toBeHidden();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('Kata sandi salah');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(attempts).toBe(2);
  expect(googleRequests).toBe(0);
});
