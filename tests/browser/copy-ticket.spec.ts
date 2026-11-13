import { test, expect } from '@playwright/test';
test.use({ baseURL: 'http://127.0.0.1:3000' });
for (const legacy of [false, true]) {
  test(`salin tiket hanya menyalin kode (${legacy ? 'HTTP LAN' : 'Clipboard API'})`, async ({
    page,
  }) => {
    const code = 'WBS-' + 'A'.repeat(32);
    await page.addInitScript(
      ({ legacy }) => {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: legacy
            ? undefined
            : {
                writeText: async (value: string) => {
                  (window as any).copiedTicket = value;
                },
              },
        });
        document.execCommand = (command: string) => {
          if (command !== 'copy') return false;
          (window as any).copiedTicket = (document.activeElement as HTMLTextAreaElement).value;
          return true;
        };
      },
      { legacy },
    );
    const report = {
      id: '00000000-0000-4000-8000-000000000001',
      number: 'WBS/2026/001',
      trackingCode: code,
      stage: 'SUBMITTED',
      lifecycle: 'ACTIVE',
      version: 1,
      payload: { title: 'Laporan uji salin tiket' },
      createdAt: '2026-11-13T01:00:00Z',
      updatedAt: '2026-11-13T01:00:00Z',
      events: [],
    };
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/public/statistics')) return route.fulfill({ json: { total: 0, active: 0, completed: 0, closed: 0, categories: [], monthly: [] } });
      return route.fulfill({
        json: path.endsWith('/me')
          ? { id: 'reporter', name: 'Pelapor', role: 'REPORTER', verified: true }
          : path.endsWith('/' + report.id)
            ? report
            : path.endsWith('/workspace')
              ? { officialResponses: [], reopenRequests: [] }
              : path.endsWith('/notifications/summary')
                ? { unreadCount: 0 }
                : [],
      });
    });
    await page.goto('/reports/' + report.id);
    await page.getByRole('button', { name: 'Salin tiket', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Tersalin', exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as any).copiedTicket)).toBe(code);
    await expect(page.locator('textarea[readonly]')).toHaveCount(0);
  });
}
