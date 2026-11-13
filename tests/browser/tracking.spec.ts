import { test, expect } from '@playwright/test';
import { stubRecaptcha } from './captcha-fixture';
test.use({ baseURL: 'http://127.0.0.1:3000' });

test('API sesi tidak merespons tetap menampilkan beranda dan pesan koneksi', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/me')) return;
    if (path.endsWith('/public/statistics'))
      return route.fulfill({
        json: {
          total: 0,
          active: 0,
          completed: 0,
          closed: 0,
          categories: [],
          monthly: [],
          updatedAt: '2026-11-06T01:02:03Z',
        },
      });
    return route.fulfill({ status: 503, json: { message: 'API tidak tersedia' } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Ada yang perlu/ })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole('alert')).toContainText('Tidak dapat terhubung');
  await expect(page.locator('.session-loading')).toHaveCount(0);
});

test('Laporkan membuka formulir tamu tanpa login atau pendaftaran', async ({ page }) => {
  let guests = 0;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/public/statistics'))
      return route.fulfill({
        json: {
          total: 0,
          active: 0,
          completed: 0,
          closed: 0,
          categories: [],
          monthly: [],
          updatedAt: '2026-11-06T01:02:03Z',
        },
      });
    if (path.endsWith('/me')) return route.fulfill({ status: 401, json: {} });
    if (path.endsWith('/auth/guest')) {
      guests++;
      return route.fulfill({
        json: {
          id: 'guest',
          name: 'Pelapor tamu',
          email: 'guest@guest.invalid',
          role: 'REPORTER',
          verified: true,
        },
      });
    }
    if (path.endsWith('/notifications/summary')) return route.fulfill({ json: { unreadCount: 0 } });
    return route.fulfill({ json: [] });
  });
  await page.goto('/');
  await page.getByRole('link', { name: 'Laporkan', exact: true }).first().click();
  await expect(page).toHaveURL(/\/reports\/new$/);
  await expect(page.getByLabel('Bidang', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Sub kategori pelanggaran', { exact: false })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.locator('.sidebar, .topbar, .steps, .form-aside')).toHaveCount(0);
  await expect(page.getByLabel('Apa yang terjadi?', { exact: false })).toBeVisible();
  await expect(
    page.getByLabel('Sumber bukti atau alasan belum menyertakan bukti', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lanjutkan', exact: true })).toHaveCount(0);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    const explanation = await page.locator('.wbs-explanation').boundingBox();
    const form = await page.locator('.form-panel').boundingBox();
    expect(explanation).not.toBeNull();
    expect(form).not.toBeNull();
    if (width > 1000) {
      expect(explanation!.x + explanation!.width).toBeLessThan(form!.x);
      expect(Math.abs(explanation!.y - form!.y)).toBeLessThan(2);
    } else {
      expect(explanation!.y + explanation!.height).toBeLessThan(form!.y);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(guests).toBe(1);
});
test('pelacakan publik membutuhkan CAPTCHA dan menampilkan rincian dan timeline melalui tiket rahasia', async ({
  page,
}) => {
  const code = 'WBS-' + 'A'.repeat(32);
  let lookups = 0;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/public/statistics'))
      return route.fulfill({
        json: {
          total: 0,
          active: 0,
          completed: 0,
          closed: 0,
          categories: [],
          monthly: [],
          updatedAt: '2026-11-06T01:02:03Z',
        },
      });
    if (path.endsWith('/me'))
      return route.fulfill({ status: 401, json: { message: 'Silakan masuk' } });
    if (path.endsWith('/public/reports/status')) {
      lookups++;
      assertPayload(route.request().postDataJSON());
      return route.fulfill({
        json: {
          report: {
            id: 'test-report',
            number: 'WBS/2026/001',
            stage: 'INITIAL_REVIEW',
            lifecycle: 'ACTIVE',
            version: 1,
            payload: { title: 'Aduan uji', category: 'Akademik', subcategory: 'Pelanggaran ujian' },
            createdAt: '2026-11-06T01:02:03Z',
            updatedAt: '2026-11-06T01:02:03Z',
            events: [
              { action: 'SUBMIT', reason: 'Laporan diterima', createdAt: '2026-11-06T01:02:03Z' },
            ],
          },
          officialResponses: [],
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
  await tracking.getByLabel('Nomor tiket', { exact: true }).fill(code);
  await expect(tracking.getByRole('button', { name: 'Cek status', exact: true })).toBeDisabled();
  expect(lookups).toBe(0);
  await tracking.getByRole('button', { name: 'Verifikasi CAPTCHA', exact: true }).click();
  await tracking.getByRole('button', { name: 'Cek status', exact: true }).click();
  await expect(tracking.getByRole('status')).toContainText('Verifikasi awal');
  await expect(tracking.getByRole('status')).toContainText('08.02.03 WIB');
  await expect(tracking.getByRole('status')).toContainText('Aduan uji');
  await expect(tracking.getByRole('status')).toContainText('Laporan diterima');
  expect(lookups).toBe(1);
  await expect(tracking.getByRole('button', { name: 'Cek status', exact: true })).toBeDisabled();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
