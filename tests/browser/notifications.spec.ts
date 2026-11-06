import { test, expect } from '@playwright/test';

test('notifikasi realtime menambah badge, deduplikasi, sinkronisasi reconnect dan bersih saat logout', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let history: any[] = [];
  let connections = 0;
  let live: any;
  const reportId = '12345678-1234-4123-8123-123456789012';
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/notifications/read-all')) {
      const readAt = new Date().toISOString();
      history.forEach((item) => {
        item.read_at = readAt;
      });
      return route.fulfill({ json: { unreadCount: 0, readAt, before: readAt } });
    }
    if (/\/notifications\/[^/]+\/read$/.test(path)) {
      const item = history.find((item) => path.includes(item.id));
      if (item) item.read_at = new Date().toISOString();
      return route.fulfill({
        json: { unreadCount: history.filter((item) => !item.read_at).length },
      });
    }
    if (path.endsWith('/notifications/summary'))
      return route.fulfill({
        json: { unreadCount: history.filter((item) => !item.read_at).length },
      });
    if (path.endsWith('/reports/' + reportId))
      return route.fulfill({
        json: {
          id: reportId,
          number: 'WBS/TEST/00001',
          stage: 'INITIAL_REVIEW',
          lifecycle: 'ACTIVE',
          version: 2,
          payload: { title: 'Perkara dari notifikasi', category: 'Etika' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          events: [],
        },
      });
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
    title: 'Klarifikasi laporan diperlukan',
    subject: 'Laporan WBS/2026/00042: Klarifikasi laporan diperlukan',
    message: 'Buka laporan dan jawab permintaan klarifikasi pengelola.',
    created_at: new Date().toISOString(),
    kind: 'CLARIFY',
    targetPath: '/reports/' + reportId,
    read_at: null as string | null,
  };
  history = [first];
  const push = () => live.send('42/notifications,' + JSON.stringify(['notification:new', first]));
  await expect(page.getByRole('heading', { name: 'Selamat datang, Pelapor.' })).toBeVisible();
  push();
  await expect(page.locator('.notification-count')).toHaveText('1');
  push();
  await expect(page.locator('.notification-count')).toHaveText('1');
  await page.getByRole('button', { name: /Notifikasi/ }).click();
  await expect(page.locator('.notification-panel')).toContainText(first.message);
  await expect(page.locator('.notification-panel')).toContainText(first.title);
  await expect(page.locator('.notification-panel')).toContainText(first.subject);
  await expect(page.locator('.notification-count')).toHaveText('1');
  const modal = page.getByRole('dialog', { name: /Notifikasi/ });
  const box = await modal.boundingBox();
  expect(box!.width).toBe(390);
  expect(box!.height).toBe(844);
  await modal.screenshot({ path: test.info().outputPath('notifications-mobile.png') });
  await modal.getByRole('button', { name: 'Tandai semua dibaca' }).click();
  await expect(page.locator('.notification-count')).toHaveCount(0);
  await expect(page.locator('.notification-panel')).toContainText('Pembaruan langsung aktif');
  await page.getByRole('button', { name: 'Tutup notifikasi' }).click();
  history = [
    first,
    {
      id: 'notification-two',
      title: 'Hasil pemeriksaan tersedia',
      targetPath: '/reports/' + reportId,
      kind: 'FINDING',
      read_at: null,
      message: 'Ada pembaruan lain di portal WBS.',
      created_at: new Date(Date.now() + 1000).toISOString(),
    },
  ];
  live.close({ code: 1001, reason: 'Synthetic network interruption' });
  await expect.poll(() => connections).toBeGreaterThan(1);
  await expect(page.locator('.notification-count')).toHaveText('1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: /Notifikasi/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Hasil pemeriksaan tersedia/ })
    .click();
  await expect(page).toHaveURL(new RegExp('/reports/' + reportId + '$'));
  await expect(page.getByRole('heading', { name: 'Perkara dari notifikasi' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.notification-count')).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Perkara dari notifikasi' })).toBeVisible();
  await expect(page.locator('.notification-count')).toHaveCount(0);
  await page.getByRole('button', { name: /Notifikasi/ }).click();
  const desktop = page.getByRole('dialog', { name: /Notifikasi/ });
  await expect(desktop).toBeVisible();
  expect((await desktop.boundingBox())!.width).toBe(460);
  await desktop.screenshot({ path: test.info().outputPath('notifications-desktop.png') });
  await expect(desktop.locator('.inbox-type svg').first()).toBeVisible();
  await desktop.getByRole('button', { name: 'Belum dibaca', exact: true }).click();
  await expect(desktop).toContainText('Tidak ada notifikasi belum dibaca');
  await expect(desktop.getByRole('button', { name: 'Tandai semua dibaca' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(desktop).toHaveCount(0);
  history.push({
    id: 'account-note',
    title: 'Verifikasi alamat email',
    message: 'Periksa email Anda.',
    kind: 'VERIFY',
    targetPath: '/help',
    created_at: new Date().toISOString(),
    read_at: null,
  });
  await page.getByRole('button', { name: /Notifikasi/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Verifikasi alamat email/ })
    .click();
  await expect(page.getByRole('dialog').getByLabel('Keperluan')).toHaveValue('VERIFY');
  await page.getByRole('button', { name: 'Tutup pemulihan akun' }).click();
  await page.getByRole('button', { name: 'Keluar', exact: true }).click();
  await expect(page.locator('.notification-count')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Masuk', exact: true })).toBeVisible();
});
