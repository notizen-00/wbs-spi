import { test, expect } from '@playwright/test';
for (const role of ['MANAGER', 'INVESTIGATOR', 'OFFICIAL', 'EXECUTOR', 'ADMIN']) {
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
          : [],
      });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Ruang kerja internal' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Buat laporan|Panduan pelaporan|Pelajari alur/ }),
    ).toHaveCount(0);
    await expect(page.locator('.hero, .how-panel')).toHaveCount(0);
    if (role !== 'ADMIN') {
      await page.getByRole('button', { name: 'Buka antrean' }).click();
      await expect(page.getByRole('heading', { name: 'Antrean perkara' })).toBeVisible();
      await expect(page.getByRole('button', { name: /Buat laporan|Draf/ })).toHaveCount(0);
    } else {
      await expect(page.getByRole('button', { name: /Antrean perkara|Buka antrean/ })).toHaveCount(
        0,
      );
    }
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 850 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
    }
    await page.getByRole('button', { name: 'Buka navigasi' }).click();
    await expect(page.getByRole('button', { name: 'Panduan pelaporan' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ruang kerja', exact: true })).toBeVisible();
  });
}
