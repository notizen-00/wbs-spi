import { test, expect } from '@playwright/test';
import { stubRecaptcha } from './captcha-fixture';
test('pelacakan publik membutuhkan CAPTCHA dan menampilkan status tanpa rincian perkara', async ({
  page,
}) => {
  const code = 'WBS-' + 'A'.repeat(32);
  let lookups = 0;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/me'))
      return route.fulfill({ status: 401, json: { message: 'Silakan masuk' } });
    if (path.endsWith('/public/reports/status')) {
      lookups++;
      assertPayload(route.request().postDataJSON());
      return route.fulfill({
        json: {
          stage: 'INITIAL_REVIEW',
          label: 'Verifikasi awal',
          lifecycle: 'ACTIVE',
          updatedAt: '2026-11-06T01:02:03Z',
        },
      });
    }
    return route.fulfill({ json: [] });
  });
  function assertPayload(body: any) {
    expect(body.code).toBe(code);
    expect(body.captchaToken).toBe('synthetic-captcha-token');
  }
  await stubRecaptcha(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Ada yang perlu/ })).toBeVisible();
  await expect(page.locator('#tracking')).toHaveCount(0);
  await expect(page.locator('.captcha-field')).toHaveCount(0);
  await page
    .getByRole('navigation', { name: 'Navigasi publik' })
    .getByRole('link', { name: 'Cek status', exact: true })
    .click();
  await expect(page).toHaveURL(/\/tracking$/);
  await expect(page.locator('.public-hero, .public-values')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Halaman pelacakan laporan' })).toBeVisible();
  const tracking = page.locator('#tracking');
  await tracking.getByLabel('Kode pelacakan', { exact: true }).fill(code);
  await expect(tracking.getByRole('button', { name: 'Cek status', exact: true })).toBeDisabled();
  expect(lookups).toBe(0);
  await tracking.getByRole('button', { name: 'Verifikasi CAPTCHA', exact: true }).click();
  await tracking.getByRole('button', { name: 'Cek status', exact: true }).click();
  await expect(tracking.getByRole('status')).toContainText('Verifikasi awal');
  await expect(tracking.getByRole('status')).toContainText('08.02.03 WIB');
  expect(lookups).toBe(1);
  await expect(tracking.getByRole('button', { name: 'Cek status', exact: true })).toBeDisabled();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
