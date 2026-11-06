import { stubRecaptcha } from './captcha-fixture';
import { test, expect } from '@playwright/test';

test('pengunjung mendapat landing, login terpisah, guard dashboard, dan login/logout berpindah path', async ({
  page,
}) => {
  let signedIn = false;
  let reportRequests = 0;
  const user = {
    id: 'public-test-user',
    name: 'Pelapor Uji',
    email: 'pelapor@example.test',
    role: 'REPORTER',
    verified: true,
  };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/login')) {
      const credentials = route.request().postDataJSON();
      expect(credentials.email).toBe(user.email);
      signedIn = true;
      return route.fulfill({ json: user });
    }
    if (path.endsWith('/auth/logout')) {
      signedIn = false;
      return route.fulfill({ json: { ok: true } });
    }
    if (path.endsWith('/me'))
      return route.fulfill(
        signedIn
          ? { json: user }
          : { status: 401, json: { message: 'Silakan masuk terlebih dahulu.' } },
      );
    if (path.endsWith('/reports')) reportRequests++;
    return route.fulfill({ json: [] });
  });
  await stubRecaptcha(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Ada yang perlu/ })).toBeVisible();
  await expect(page.locator('.sidebar, .stats-grid, .reports-panel')).toHaveCount(0);
  expect(reportRequests).toBe(0);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page
    .getByRole('navigation', { name: 'Navigasi publik' })
    .getByRole('link', { name: 'Pusat bantuan' })
    .click();
  await expect(page).toHaveURL(/\/help$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('link', { name: 'Buat laporan' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Masuk ke akun', exact: true })).toBeVisible();
  await expect(page.locator('[role=dialog]')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Daftar sekarang' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByLabel('Nama lengkap')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Nama lengkap')).toHaveCount(0);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Kata sandi', { exact: true }).fill('Synthetic-Test-Password');
  await page
    .locator('.public-auth-card')
    .getByRole('button', { name: 'Verifikasi CAPTCHA', exact: true })
    .click();
  await page.getByRole('button', { name: 'Masuk ke akun', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Selamat datang, Pelapor.' })).toBeVisible();
  await expect(page.locator('.public-portal')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Selamat datang, Pelapor.' })).toBeVisible();
  await page.goto('/login');
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('button', { name: 'Keluar', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: /Ada yang perlu/ })).toBeVisible();
  await expect(page.locator('.sidebar')).toHaveCount(0);
});

test('tautan verifikasi dan reset akun tetap tersedia dari halaman publik', async ({ page }) => {
  let verified = false;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/me'))
      return route.fulfill({ status: 401, json: { message: 'Silakan masuk' } });
    if (path.endsWith('/auth/verify')) {
      verified = true;
      return route.fulfill({ json: { message: 'Email berhasil diverifikasi.' } });
    }
    return route.fulfill({ json: [] });
  });
  await stubRecaptcha(page);
  await page.goto('/?verify=synthetic-token');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status')).toContainText('Email berhasil diverifikasi.');
  expect(verified).toBe(true);
  await page.goto('/?reset=synthetic-token');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Kata sandi');
});
