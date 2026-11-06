import { test, expect } from '@playwright/test';

test('timeline menampilkan urutan terbaru, label tindakan dan waktu lengkap WIB tanpa overflow', async ({
  page,
}) => {
  const report = {
    id: 'timeline-report',
    number: 'WBS/TEST/00001',
    stage: 'INITIAL_REVIEW',
    lifecycle: 'ACTIVE',
    version: 4,
    payload: { title: 'Laporan simulasi timeline', category: 'Lainnya' },
    createdAt: '2026-11-06T01:02:03Z',
    updatedAt: '2026-11-06T02:04:05Z',
    events: [
      {
        action: 'SUBMIT',
        reason: 'Laporan dikirim untuk pemeriksaan.',
        createdAt: '2026-11-06T01:02:03Z',
      },
      {
        action: 'CLARIFY',
        reason: 'Mohon lengkapi keterangan bukti.\nSertakan sumber informasi.',
        createdAt: '2026-11-06T02:04:05Z',
      },
    ],
  };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: path.endsWith('/me')
        ? { id: 'timeline-user', name: 'Pelapor Uji', role: 'REPORTER', verified: true }
        : path.endsWith('/reports')
          ? [report]
          : path.endsWith('/timeline-report')
            ? report
            : path.endsWith('/workspace')
              ? { officialResponses: [], reopenRequests: [] }
              : [],
    });
  });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page
      .getByRole('button', { name: /Laporan simulasi timeline/ })
      .first()
      .click();
    const timeline = page.getByRole('complementary', { name: 'Timeline perkembangan laporan' });
    await expect(timeline).toBeVisible();
    await expect(timeline.locator('li').first()).toContainText('Klarifikasi diminta');
    await expect(timeline.locator('li').first()).toContainText('Terbaru');
    await expect(timeline.locator('time').first()).toHaveText(
      '06 November 2026 pukul 09.04.05 WIB',
    );
    await expect(timeline.locator('time').last()).toHaveAttribute(
      'datetime',
      '2026-11-06T01:02:03Z',
    );
    await expect(timeline).toContainText('2 aktivitas tercatat');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
