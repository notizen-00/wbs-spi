import { test, expect } from '@playwright/test';
test.use({ baseURL: 'http://127.0.0.1:3000' });

test('daftar laporan memakai pagination server, filter, pencarian dan reset pada desktop/mobile', async ({
  page,
}) => {
  const requests: URLSearchParams[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    let data: any = [];
    if (url.pathname.endsWith('/public/settings'))
      data = {
        appName: 'WBS',
        categories: ['Pelanggaran BMN'],
        subcategories: { 'Pelanggaran BMN': ['Pengamanan BMN'] },
      };
    if (url.pathname.endsWith('/me'))
      data = { id: 'list-user', name: 'Pelapor Uji', role: 'INVESTIGATOR', verified: true };
    if (url.pathname.endsWith('/reports') && url.searchParams.get('paginated') === 'true') {
      requests.push(url.searchParams);
      const current = Number(url.searchParams.get('page')) || 1;
      const pageSize = Number(url.searchParams.get('pageSize')) || 10;
      data = {
        page: current,
        pageSize,
        total: 61,
        totalPages: Math.ceil(61 / pageSize),
        items: [
          {
            id: `report-${current}`,
            number: `WBS/TEST/${current}`,
            payload: { title: `Laporan halaman ${current}`, category: 'Pelanggaran etika' },
            stage: 'INITIAL_REVIEW',
            updatedAt: '2026-11-06T01:02:03Z',
          },
        ],
      };
    }
    await route.fulfill({ json: data });
  });
  await page.goto('/reports');
  const list = page.getByRole('region', { name: 'Daftar laporan', exact: true });
  await expect(list).toContainText('1–10 dari 61 laporan');
  await list.getByRole('button', { name: 'Halaman berikutnya' }).click();
  await expect(list).toContainText('Laporan halaman 2');
  await expect(list).toContainText('11–20 dari 61 laporan');
  await list.getByLabel('Tahap penanganan').selectOption('INITIAL_REVIEW');
  await expect(list).toContainText('Laporan halaman 1');
  await expect.poll(() => requests.at(-1)?.get('stage')).toBe('INITIAL_REVIEW');
  await list.getByLabel('Kondisi perkara').selectOption('SUSPENDED');
  await expect.poll(() => requests.at(-1)?.get('lifecycle')).toBe('SUSPENDED');
  await list.getByLabel('Kategori', { exact: true }).selectOption('Pelanggaran BMN');
  await expect.poll(() => requests.at(-1)?.get('category')).toBe('Pelanggaran BMN');
  await list.getByLabel('Subkategori', { exact: true }).selectOption('Pengamanan BMN');
  await expect.poll(() => requests.at(-1)?.get('subcategory')).toBe('Pengamanan BMN');
  await list.getByLabel('Cari laporan').fill('nomor uji');
  await expect.poll(() => requests.at(-1)?.get('q')).toBe('nomor uji');
  await list.getByLabel('Urutan pembaruan').selectOption('oldest');
  await expect.poll(() => requests.at(-1)?.get('sort')).toBe('oldest');
  await list.getByLabel('Per halaman').selectOption('25');
  await expect(list).toContainText('1–25 dari 61 laporan');
  await list.getByRole('button', { name: 'Selesai / ditutup', exact: true }).click();
  await expect(list.getByLabel('Tahap penanganan')).toHaveValue('');
  await expect(list.getByLabel('Kondisi perkara')).toHaveValue('');
  await expect(list.getByLabel('Kondisi perkara').locator('option[value=SUSPENDED]')).toHaveCount(
    0,
  );
  await list.getByRole('button', { name: 'Reset filter' }).click();
  await expect(list.getByLabel('Cari laporan')).toHaveValue('');
  await expect(list.getByLabel('Per halaman')).toHaveValue('10');
  await expect(list.getByLabel('Subkategori', { exact: true })).toHaveValue('');
  await expect(list.getByLabel('Subkategori', { exact: true })).toBeDisabled();
  await expect.poll(() => requests.at(-1)?.get('stage')).toBe('');
  await expect.poll(() => requests.at(-1)?.get('sort')).toBe('newest');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole('button', { name: 'Buka navigasi' }).click();
  await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible();
});
