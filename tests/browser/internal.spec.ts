import { test, expect } from '@playwright/test';
for (const role of ['INVESTIGATOR', 'OFFICIAL', 'EXECUTOR']) {
  test(`portal internal ${role} tidak menampilkan fitur pelapor`, async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      await route.fulfill({
        json: path.endsWith('/me')
          ? {
              id: 'internal-test',
              name: 'Petugas Uji',
              email: 'staff@example.test',
              role,
              verified: true,
            }
          : path.endsWith('/reports') &&
              new URL(route.request().url()).searchParams.get('paginated') === 'true'
            ? { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 }
            : [],
      });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Buat laporan|Panduan pelaporan|Pelajari alur/ }),
    ).toHaveCount(0);
    await expect(page.locator('.hero, .how-panel')).toHaveCount(0);
    await page.getByRole('button', { name: 'Buka antrean' }).click();
    await expect(page.getByRole('heading', { name: 'Antrean perkara' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Buat laporan|Draf/ })).toHaveCount(0);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 850 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
    }
    await page.getByRole('button', { name: 'Buka navigasi' }).click();
    await expect(page.getByRole('button', { name: 'Panduan pelaporan' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible();
  });
}
