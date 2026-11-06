import { test, expect } from '@playwright/test';

test('pemilih bukti mobile menerima MP3/video dan memperbarui status unggahan', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const report = {
    id: 'synthetic-report',
    number: 'WBS/TEST/00001',
    stage: 'SUBMITTED',
    lifecycle: 'ACTIVE',
    version: 2,
    payload: { title: 'Laporan upload sintetis', category: 'Lainnya' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    events: [],
  };
  let uploaded = false;
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    let result: any = [];
    if (path.endsWith('/me'))
      result = {
        id: 'synthetic-user',
        name: 'Pelapor Uji',
        email: 'test@example.test',
        role: 'REPORTER',
        verified: true,
      };
    else if (path.endsWith('/evidence')) {
      if (req.method() === 'POST') {
        expect(req.postDataJSON().name).toBe('rekaman.mp3');
        uploaded = true;
        result = { id: 'synthetic-evidence', status: 'PENDING' };
      } else
        result = uploaded
          ? [{ id: 'synthetic-evidence', name: 'rekaman.mp3', bytes: 417, status: 'PENDING' }]
          : [];
    } else if (path.endsWith('/workspace')) result = { officialResponses: [], reopenRequests: [] };
    else if (path.endsWith('/reports')) result = [report];
    else if (path.endsWith('/synthetic-report')) result = report;
    await route.fulfill({ json: result });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Laporan upload sintetis/ }).click();
  const input = page.locator('input[type=file]');
  await expect(input).toHaveAttribute('accept', /\.mp3/);
  await expect(input).toHaveAttribute('accept', /\.mp4/);
  await expect(input).toHaveAttribute('accept', /\.pdf/);
  await input.setInputFiles({
    name: 'rekaman.mp3',
    mimeType: 'audio/mpeg',
    buffer: Buffer.from([255, 251, 144, 100, ...Array(413).fill(0)]),
  });
  await expect(page.getByText('rekaman.mp3', { exact: true })).toBeVisible();
  await expect(page.getByText(/Menunggu pemindaian/)).toBeVisible();
  expect(uploaded).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
