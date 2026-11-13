import { test, expect } from '@playwright/test';
test.use({ baseURL: 'http://127.0.0.1:3000' });

test('super admin membuat petugas dengan peran dan mengosongkan kata sandi setelah berhasil', async ({
  page,
}) => {
  let users: any[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/me'))
      return route.fulfill({
        json: {
          id: 'admin',
          name: 'Super Admin',
          email: 'admin@example.test',
          role: 'SUPER_ADMIN',
          verified: true,
        },
      });
    if (path.endsWith('/admin/users')) {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        expect(body.role).toBe('INVESTIGATOR');
        expect(body.password).toBe('Abc123');
        if (users.some((user) => user.email === body.email))
          return route.fulfill({
            status: 409,
            json: { message: 'Email sudah digunakan pengguna lain.' },
          });
        const created = {
          id: 'new-staff',
          authVersion: 1,
          name: body.name,
          email: body.email,
          role: body.role,
          active: true,
          verified: true,
        };
        users.push(created);
        return route.fulfill({ json: created });
      }
      return route.fulfill({ json: users });
    }
    if (path.endsWith('/admin/users/new-staff')) {
      const body = route.request().postDataJSON();
      expect(body.expectedVersion).toBe(users[0].authVersion);
      if (route.request().method() === 'PATCH') {
        expect(body.password).toBe('');
        expect(body.role).toBe('EXECUTOR');
        users[0] = {
          ...users[0],
          name: body.name,
          email: body.email,
          active: body.active,
          role: body.role,
          authVersion: users[0].authVersion + 1,
        };
        return route.fulfill({ json: users[0] });
      }
      users = [];
      return route.fulfill({ json: { ok: true } });
    }
    if (path.endsWith('/notifications/summary')) return route.fulfill({ json: { unreadCount: 0 } });
    return route.fulfill({ json: [] });
  });
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Pengguna & peran', exact: true })).toBeVisible();
  await expect(page.getByLabel('Peran', { exact: true }).locator('option')).toHaveText([
    'Verifikator / Pemeriksa',
    'Pejabat',
    'Pelaksana',
    'Super Admin',
  ]);
  await page.getByLabel('Nama lengkap', { exact: true }).fill('Verifikator Baru');
  await page.getByLabel('Email pengguna', { exact: true }).fill('verifikator@example.test');
  await page.getByLabel('Kata sandi awal', { exact: false }).fill('Abc123');
  await page.getByRole('button', { name: 'Buat pengguna', exact: true }).click();
  await expect(page.locator('.alert.success')).toContainText('berhasil dibuat');
  await expect(page.locator('.staff-row')).toContainText('verifikator@example.test');
  await expect(page.getByLabel('Kata sandi awal', { exact: false })).toHaveValue('');
  await page.getByLabel('Nama lengkap', { exact: true }).fill('Duplikat');
  await page.getByLabel('Email pengguna', { exact: true }).fill('verifikator@example.test');
  await page.getByLabel('Kata sandi awal', { exact: false }).fill('Abc123');
  await page.getByRole('button', { name: 'Buat pengguna', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email sudah digunakan');
  expect(users).toHaveLength(1);
  await page.getByRole('button', { name: 'Ubah pengguna Verifikator Baru', exact: true }).click();
  await page.getByLabel('Nama lengkap', { exact: true }).fill('Pelaksana Baru');
  await page.getByLabel('Peran', { exact: true }).selectOption('EXECUTOR');
  await page.getByLabel('Akun aktif', { exact: false }).uncheck();
  await page.getByRole('button', { name: 'Simpan perubahan', exact: true }).click();
  await expect(page.locator('.alert.success')).toContainText('berhasil diperbarui');
  await expect(page.locator('.staff-row')).toContainText('Pelaksana Baru');
  await expect(page.locator('.staff-row')).toContainText('Nonaktif');
  await page.getByRole('button', { name: 'Hapus pengguna Pelaksana Baru', exact: true }).click();
  await page.getByRole('button', { name: 'Batal hapus', exact: true }).click();
  await expect(page.locator('.staff-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Hapus pengguna Pelaksana Baru', exact: true }).click();
  await page.getByRole('button', { name: 'Ya, hapus pengguna', exact: true }).click();
  await expect(page.locator('.alert.success')).toContainText('berhasil dihapus');
  await expect(page.locator('.staff-row')).toHaveCount(0);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
