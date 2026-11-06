import { test, expect } from '@playwright/test';

test('super admin mengelola kategori dan logo, pengaturan tersimpan dan responsif', async ({
  page,
}) => {
  let categories = [
    {
      id: 'category-one',
      name: 'Kategori awal',
      description: '',
      active: true,
      sortOrder: 10,
      version: 1,
    },
  ];
  let settings = {
    id: 'main',
    appName: 'WBS',
    institutionName: 'Universitas Jember',
    tagline: 'Whistleblowing System',
    helpEmail: '',
    helpPhone: '',
    helpAddress: '',
    logoDataUrl: null as string | null,
    version: 1,
  };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    let result: any = [];
    if (path.endsWith('/me'))
      result = {
        id: 'super-admin',
        name: 'Super Admin',
        email: 'superadmin@example.test',
        role: 'SUPER_ADMIN',
        verified: true,
      };
    else if (path.endsWith('/public/settings'))
      result = { ...settings, categories: categories.filter((c) => c.active).map((c) => c.name) };
    else if (path.endsWith('/admin/settings')) {
      if (request.method() === 'PATCH') {
        const body = request.postDataJSON();
        expect(body.expectedVersion).toBe(settings.version);
        settings = { ...settings, ...body, version: settings.version + 1 };
      }
      result = settings;
    } else if (path.endsWith('/admin/categories')) {
      if (request.method() === 'POST')
        categories.push({ ...request.postDataJSON(), id: 'category-new', version: 1 });
      result = request.method() === 'POST' ? categories.at(-1) : categories;
    } else if (path.includes('/admin/categories/')) {
      const id = path.split('/').at(-1);
      if (request.method() === 'DELETE') categories = categories.filter((c) => c.id !== id);
      else
        categories = categories.map((c) =>
          c.id === id ? { ...c, ...request.postDataJSON(), version: c.version + 1 } : c,
        );
      result = { ok: true };
    }
    await route.fulfill({ json: result });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard super admin' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Antrean perkara|Buat laporan/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Kategori laporan', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/categories$/);
  await page.getByRole('button', { name: 'Tambah kategori' }).click();
  await page.getByLabel('Nama kategori', { exact: true }).fill('Kategori baru');
  await page.getByLabel('Deskripsi', { exact: true }).fill('Deskripsi pengujian kategori');
  await page.getByRole('button', { name: 'Simpan kategori', exact: true }).click();
  await expect(page.locator('.alert.success')).toContainText('Kategori berhasil disimpan.');
  await page.getByRole('button', { name: 'Ubah kategori Kategori baru', exact: true }).click();
  await page.getByLabel('Aktif untuk laporan baru').uncheck();
  await page.getByRole('button', { name: 'Simpan kategori', exact: true }).click();
  await expect(
    page.locator('.admin-category-row').filter({ hasText: 'Kategori baru' }),
  ).toContainText('Nonaktif');
  await page.getByRole('button', { name: 'Hapus kategori Kategori baru', exact: true }).click();
  await page.getByRole('button', { name: 'Ya, hapus kategori', exact: true }).click();
  await expect(
    page.locator('.admin-category-row').filter({ hasText: 'Kategori baru' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Pengaturan situs', exact: true }).click();
  await page.getByLabel('Nama aplikasi', { exact: true }).fill('WBS Uji');
  await page.getByLabel('Email bantuan', { exact: true }).fill('help@example.test');
  await page.getByLabel('Unggah logo', { exact: true }).setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByRole('img', { name: 'Pratinjau logo situs' })).toBeVisible();
  await page.getByRole('button', { name: 'Simpan pengaturan', exact: true }).click();
  await expect(page.locator('.alert.success')).toContainText('Pengaturan situs berhasil disimpan.');
  await expect(page.locator('.sidebar .site-brand')).toContainText('WBS Uji');
  await expect(page.locator('.sidebar .site-brand img')).toHaveAttribute('src', /^data:image\/png/);
  await page.reload();
  await expect(page.getByLabel('Nama aplikasi', { exact: true })).toHaveValue('WBS Uji');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test('identitas dan kontak publik mengikuti pengaturan situs', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/me'))
      return route.fulfill({ status: 401, json: { message: 'Silakan masuk' } });
    if (path.endsWith('/public/settings'))
      return route.fulfill({
        json: {
          appName: 'Portal Pelaporan',
          institutionName: 'Institusi Uji',
          tagline: 'Layanan Uji',
          helpEmail: 'help@example.test',
          helpPhone: '+62 123456',
          helpAddress: 'Kantor layanan uji',
          logoDataUrl: null,
          categories: ['Kategori uji'],
        },
      });
    return route.fulfill({ json: [] });
  });
  await page.goto('/');
  await expect(page.locator('.public-brand')).toContainText('Portal Pelaporan');
  await expect(page.locator('.public-brand')).toContainText('Institusi Uji');
  await expect(page.getByRole('link', { name: 'help@example.test', exact: true })).toHaveAttribute(
    'href',
    'mailto:help@example.test',
  );
  await expect(page.getByRole('link', { name: '+62 123456', exact: true })).toHaveAttribute(
    'href',
    'tel:+62123456',
  );
  await expect(page.locator('.configured-contact')).toContainText('Kantor layanan uji');
});
