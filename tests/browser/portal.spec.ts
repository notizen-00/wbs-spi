import { test, expect } from '@playwright/test';
test('desktop dan mobile dapat digunakan tanpa overflow horizontal', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Suara Anda berarti.' })).toBeVisible();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    if (width === 1440 || width === 390)
      await page.screenshot({
        path: `artifacts/portal-${width}.png`,
        fullPage: true,
        animations: 'disabled',
      });
  }
  await page.getByRole('button', { name: 'Buka navigasi' }).click();
  await page.getByRole('button', { name: 'Panduan pelaporan' }).click();
  await expect(page.getByRole('heading', { name: 'Panduan pelaporan', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Setiap laporan dimulai dari fakta.' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test('form pelapor bertahap, simpan draf dan kirim pada layar mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const user = {
    id: 'test-user',
    name: 'Pelapor Uji',
    email: 'pelapor@example.test',
    role: 'REPORTER',
    verified: true,
  };
  let report: any;
  let submitted = false;
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    let result: any = [];
    if (url.pathname.endsWith('/me')) result = user;
    else if (url.pathname.endsWith('/reports/drafts')) {
      report = {
        id: 'report-test',
        version: 1,
        stage: 'DRAFT',
        lifecycle: 'ACTIVE',
        payload: req.postDataJSON().payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      result = report;
    } else if (url.pathname.endsWith('/draft')) {
      report = { ...report, payload: req.postDataJSON().payload, version: report.version + 1 };
      result = report;
    } else if (url.pathname.endsWith('/commands')) {
      submitted = true;
      report = {
        ...report,
        stage: 'SUBMITTED',
        number: 'WBS/TEST/00001',
        version: report.version + 1,
      };
      result = report;
    } else if (url.pathname.endsWith('/reports')) result = report ? [report] : [];
    else if (url.pathname.endsWith('/reports/report-test')) result = report;
    else if (url.pathname.endsWith('/workspace'))
      result = { officialResponses: [], reopenRequests: [] };
    await route.fulfill({ json: result });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Selamat datang, Pelapor.' })).toBeVisible();
  await page.getByRole('button', { name: 'Buat laporan', exact: true }).click();
  await page.getByLabel('Judul laporan').fill('Laporan pengujian sintetis');
  await page.getByLabel('Kategori pelanggaran').selectOption('Pelanggaran akademik');
  await page.getByLabel('Tanggal kejadian').fill('2026-11-01');
  await page.getByLabel('Lokasi kejadian').fill('Lokasi sintetis');
  await page.getByRole('button', { name: 'Lanjutkan' }).click();
  await page.getByLabel('Apa yang terjadi?').fill('Kejadian sintetis untuk pengujian antarmuka.');
  await page.getByLabel('Siapa yang terlibat?').fill('Pihak sintetis');
  await page.getByLabel('Mengapa kejadian ini diduga melanggar?').fill('Dasar sintetis');
  await page.getByLabel('Bagaimana kejadiannya?').fill('Urutan kejadian sintetis');
  await page.getByRole('button', { name: 'Lanjutkan' }).click();
  await page.getByLabel('Sumber bukti atau alasan').fill('Bukti sintetis belum tersedia');
  await page.getByRole('button', { name: 'Lanjutkan' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Kirim laporan' }).click();
  await expect(
    page.getByText('Laporan berhasil dikirim. Simpan nomor penerimaan Anda.'),
  ).toBeVisible();
  expect(submitted).toBe(true);
  await expect(page.getByText('WBS/TEST/00001')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
