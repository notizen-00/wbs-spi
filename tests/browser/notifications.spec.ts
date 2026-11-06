import { test, expect } from '@playwright/test';

test('notifikasi realtime menambah badge, deduplikasi, sinkronisasi reconnect dan bersih saat logout', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let history: any[] = [];
  let connections = 0;
  let live: any;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: path.endsWith('/me')
        ? { id: 'synthetic-user', name: 'Pelapor Uji', role: 'REPORTER', verified: true }
        : path.endsWith('/notifications')
          ? history
          : [],
    });
  });
  await page.routeWebSocket('**/api/v1/socket.io/**', (ws) => {
    live = ws;
    connections++;
    ws.send(
      '0' +
        JSON.stringify({
          sid: `synthetic-${connections}`,
          upgrades: [],
          pingInterval: 25000,
          pingTimeout: 20000,
          maxPayload: 4096,
        }),
    );
    ws.onMessage((message) => {
      if (String(message).startsWith('40/notifications'))
        ws.send('40/notifications,' + JSON.stringify({ sid: `namespace-${connections}` }));
      if (message === '2') ws.send('3');
    });
  });
  await page.goto('/');
  await expect.poll(() => connections).toBe(1);
  const first = {
    id: 'notification-one',
    message: 'Ada pembaruan di portal WBS.',
    created_at: new Date().toISOString(),
  };
  const push = () => live.send('42/notifications,' + JSON.stringify(['notification:new', first]));
  await expect(page.getByRole('heading', { name: 'Selamat datang, Pelapor.' })).toBeVisible();
  push();
  await expect(page.locator('.notification-count')).toHaveText('1');
  push();
  await expect(page.locator('.notification-count')).toHaveText('1');
  await page.getByRole('button', { name: /Notifikasi/ }).click();
  await expect(page.locator('.notification-panel')).toContainText(first.message);
  await expect(page.locator('.notification-count')).toHaveCount(0);
  await expect(page.locator('.notification-panel')).toContainText('Pembaruan langsung aktif');
  await page.getByRole('button', { name: /Notifikasi/ }).click();
  history = [
    first,
    {
      id: 'notification-two',
      message: 'Ada pembaruan lain di portal WBS.',
      created_at: new Date(Date.now() + 1000).toISOString(),
    },
  ];
  live.close({ code: 1001, reason: 'Synthetic network interruption' });
  await expect.poll(() => connections).toBeGreaterThan(1);
  await expect(page.locator('.notification-count')).toHaveText('1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Keluar', exact: true }).click();
  await expect(page.locator('.notification-count')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Masuk', exact: true })).toBeVisible();
});
