import { test, expect } from '@playwright/test';

test('pratinjau bukti PDF, gambar, video dan MP3 memakai unduhan terotorisasi serta membersihkan URL', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const types = [
    ['pdf', 'dokumen.pdf', 'application/pdf'],
    ['image', 'gambar.png', 'image/png'],
    ['video', 'rekaman.webm', 'video/webm'],
    ['audio', 'suara.mp3', 'audio/mpeg'],
  ];
  const report = {
    id: 'preview-report',
    number: 'WBS/TEST/00001',
    stage: 'SUBMITTED',
    lifecycle: 'ACTIVE',
    version: 2,
    payload: { title: 'Laporan preview sintetis', category: 'Lainnya' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    events: [],
  };
  let denied = false;
  let videoBytes = Buffer.alloc(0);
  // Synthetic silent MPEG-1 Layer III frames, rather than a different file format.
  const mp3 = Buffer.concat(
    Array.from({ length: 20 }, () => Buffer.from([255, 251, 144, 100, ...Array(413).fill(0)])),
  );
  const downloads: string[] = [];
  await page.addInitScript(() => {
    const revoke = URL.revokeObjectURL.bind(URL);
    (window as any).revoked = [];
    URL.revokeObjectURL = (url) => {
      (window as any).revoked.push(url);
      revoke(url);
    };
  });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/download')) {
      downloads.push(path);
      if (denied)
        return route.fulfill({
          status: 403,
          json: { message: 'Anda tidak memiliki akses ke bukti ini.' },
        });
      const type = types.find((t) => path.includes(`/evidence/${t[0]}/`))!;
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
        'base64',
      );
      return route.fulfill({
        contentType: type[2],
        body:
          type[0] === 'image'
            ? png
            : type[0] === 'video'
              ? videoBytes
              : type[0] === 'audio'
                ? mp3
                : Buffer.from('%PDF-1.4\nSynthetic media fixture\n%%EOF'),
      });
    }
    const data = path.endsWith('/me')
      ? { id: 'preview-user', name: 'Pelapor Uji', role: 'REPORTER', verified: true }
      : path.endsWith('/reports')
        ? [report]
        : path.endsWith('/preview-report')
          ? report
          : path.endsWith('/workspace')
            ? { officialResponses: [], reopenRequests: [] }
            : path.endsWith('/evidence')
              ? [
                  ...types.map(([id, name, mime]) => ({
                    id,
                    name,
                    mime,
                    bytes: 100,
                    status: 'READY',
                  })),
                  {
                    id: 'locked',
                    name: 'terkunci.pdf',
                    mime: 'application/pdf',
                    bytes: 100,
                    status: 'REJECTED',
                  },
                ]
              : [];
    await route.fulfill({ json: data });
  });
  await page.goto('/');
  // Produce an actual playable WebM locally without external fixtures or downloads.
  videoBytes = Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const stream = canvas.captureStream(10);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => chunks.push(event.data);
      const done = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks));
      });
      recorder.start();
      const drawing = setInterval(() => {
        const context = canvas.getContext('2d')!;
        context.fillStyle = `rgb(${Date.now() % 255}, 80, 60)`;
        context.fillRect(0, 0, 64, 64);
      }, 30);
      await new Promise((resolve) => setTimeout(resolve, 500));
      clearInterval(drawing);
      recorder.stop();
      const blob = await done;
      stream.getTracks().forEach((track) => track.stop());
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }),
  );
  await page
    .getByRole('button', { name: /Laporan preview sintetis/ })
    .first()
    .click();
  const preview = page.getByRole('region', { name: 'Pratinjau bukti' });
  for (const [id, name] of types) {
    await page.getByRole('button', { name: `Lihat bukti ${name}`, exact: true }).click();
    await expect(preview).toBeVisible();
    await expect(preview.getByRole('heading', { name })).toBeVisible();
    if (id === 'pdf') await expect(preview.locator('iframe')).toHaveAttribute('src', /^blob:/);
    if (id === 'image') await expect(preview.getByRole('img', { name })).toBeVisible();
    if (id === 'video' || id === 'audio')
      await expect(preview.locator(id)).toHaveAttribute('controls', '');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await preview.locator('audio').dispatchEvent('error');
  await expect(preview).toContainText('Browser ini tidak dapat menampilkan');
  await preview.getByRole('button', { name: 'Tutup pratinjau bukti' }).click();
  await expect(preview).toHaveCount(0);
  expect(downloads.length).toBe(4);
  expect(await page.evaluate(() => (window as any).revoked.length)).toBe(4);
  await expect(page.getByRole('button', { name: 'Lihat bukti terkunci.pdf' })).toHaveCount(0);
  denied = true;
  await page.getByRole('button', { name: 'Lihat bukti dokumen.pdf', exact: true }).click();
  await expect(preview.getByRole('alert')).toContainText('Anda tidak memiliki akses');
  await expect(preview.locator('iframe')).toHaveCount(0);
});
