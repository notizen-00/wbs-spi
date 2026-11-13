import { test, expect } from '@playwright/test';
import { stubRecaptcha } from './captcha-fixture';
test.use({ baseURL: 'http://127.0.0.1:3000' });

test('API sesi tidak merespons tetap menampilkan beranda dan pesan koneksi', async ({ page }) => {
  test.setTimeout(40000);
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/me')) return;
    if (path.endsWith('/public/statistics'))
      return route.fulfill({
        json: {
          total: 0,
          active: 0,
          completed: 0,
          closed: 0,
          categories: [],
          monthly: [],
          updatedAt: '2026-11-06T01:02:03Z',
        },
      });
    return route.fulfill({ status: 503, json: { message: 'API tidak tersedia' } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Ada yang perlu/ })).toBeVisible({
    timeout: 25000,
  });
  await expect(page.getByRole('alert')).toContainText('Tidak dapat terhubung');
  await expect(page.locator('.session-loading')).toHaveCount(0);
});

test('Laporkan membuka formulir tamu tanpa login atau pendaftaran', async ({ page }) => {
  let storedReport: any = null;
  let guests = 0,
    draftRequests = 0,
    uploads = 0;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/public/statistics'))
      return route.fulfill({
        json: {
          total: 0,
          active: 0,
          completed: 0,
          closed: 0,
          categories: [],
          monthly: [],
          updatedAt: '2026-11-06T01:02:03Z',
        },
      });
    if (path.endsWith('/public/settings'))
      return route.fulfill({
        json: {
          appName: 'WBS',
          institutionName: 'Universitas Jember',
          tagline: '',
          helpEmail: '',
          helpPhone: '',
          helpAddress: '',
          logoDataUrl: null,
          categories: ['Pelanggaran BMN', 'Divisi SDM'],
          subcategories: {
            'Pelanggaran BMN': ['Pelanggaran Pengamanan dan Pemeliharaan'],
            'Divisi SDM': ['Ketidakhadiran dan jam kerja', 'Kenaikan pangkat dan jabatan'],
          },
        },
      });
    if (path.endsWith('/me')) return route.fulfill({ status: 401, json: {} });
    if (path.endsWith('/auth/guest')) {
      guests++;
      return route.fulfill({
        json: {
          id: 'guest',
          name: 'Pelapor tamu',
          email: 'guest@guest.invalid',
          role: 'REPORTER',
          verified: true,
        },
      });
    }
    if (path.endsWith('/reports/drafts')) {
      draftRequests++;
      storedReport = {
        id: 'test-upload',
        number: null,
        stage: 'DRAFT',
        version: 1,
        payload: route.request().postDataJSON().payload,
      };
      return route.fulfill({ json: storedReport });
    }
    if (path.endsWith('/reports/test-upload/draft')) {
      storedReport.payload = route.request().postDataJSON().payload;
      storedReport.version++;
      return route.fulfill({ json: storedReport });
    }
    if (path.endsWith('/reports/test-upload/commands')) {
      storedReport.stage = 'SUBMITTED';
      storedReport.number = 'WBS/2026/001';
      storedReport.trackingCode = 'WBS-' + 'A'.repeat(32);
      storedReport.version++;
      return route.fulfill({ json: storedReport });
    }
    if (path.endsWith('/reports/test-upload')) return route.fulfill({ json: storedReport });
    if (path.endsWith('/workspace'))
      return route.fulfill({ json: { officialResponses: [], reopenRequests: [] } });
    if (path.endsWith('/reports/test-upload/evidence')) {
      if (route.request().method() === 'POST') {
        uploads++;
        return route.fulfill({ json: { id: 'evidence-1', status: 'READY' } });
      }
      return route.fulfill({
        json: uploads ? [{ id: 'evidence-1', name: 'bukti.pdf', bytes: 20, status: 'READY' }] : [],
      });
    }
    if (path.endsWith('/notifications/summary')) return route.fulfill({ json: { unreadCount: 0 } });
    return route.fulfill({ json: [] });
  });
  await stubRecaptcha(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Laporkan', exact: true }).first().click();
  await expect(page).toHaveURL(/\/reports\/new$/);
  await expect(page.getByRole('button', { name: /Simpan.*draf/i })).toHaveCount(0);
  const email = page.getByLabel('Email yang dapat dihubungi', { exact: false });
  await expect(email).toHaveCount(0);
  await page.getByRole('radio', { name: /Bersedia dihubungi/ }).check();
  await expect(email).toBeVisible();
  await email.fill('pelapor@example.test');
  await page.getByRole('radio', { name: /Identitas terlindungi/ }).check();
  await expect(email).toHaveCount(0);
  expect(draftRequests).toBe(0);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'bukti.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 test'),
  });
  await expect(page.locator('.evidence-file')).toContainText('bukti.pdf');
  expect(draftRequests).toBe(1);
  expect(uploads).toBe(1);
  await expect(page.locator('.wbs-explanation')).toContainText('saluran resmi terkait penyampaian');
  await expect(page.locator('.wbs-report-elements dt')).toHaveCount(6);
  await expect(page.locator('.wbs-complaint-types > li')).toHaveCount(9);
  await expect(page.locator('.wbs-complaint-types')).toContainText('cyberbullying');
  await expect(page.getByLabel(/^Kategori/)).toBeVisible();
  await expect(page.getByLabel('Subkategori', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Subkategori', { exact: false })).toBeDisabled();
  await page.getByLabel(/^Kategori/).selectOption('Pelanggaran BMN');
  const subcategory = page.getByLabel('Subkategori', { exact: false });
  await subcategory.selectOption('Pelanggaran Pengamanan dan Pemeliharaan');
  await page.getByLabel(/^Kategori/).selectOption('Divisi SDM');
  await expect(subcategory).toHaveValue('');
  await expect(subcategory.locator('option')).toHaveText([
    'Pilih subkategori',
    'Ketidakhadiran dan jam kerja',
    'Kenaikan pangkat dan jabatan',
  ]);
  await subcategory.selectOption('Kenaikan pangkat dan jabatan');
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.locator('.sidebar, .topbar, .steps, .form-aside')).toHaveCount(0);
  await expect(page.getByLabel('Apa yang terjadi?', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Keterangan bukti pelanggaran', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lanjutkan', exact: true })).toHaveCount(0);
  await page.getByLabel('Judul laporan', { exact: false }).fill('Uji tampilan formulir');
  await page.getByRole('button', { name: 'Maximize formulir', exact: true }).click();
  await expect(page.locator('.wbs-explanation')).toBeHidden();
  await expect(page.locator('.form-layout')).toHaveClass(/form-layout-wide/);
  await page.getByRole('button', { name: 'Layar penuh formulir', exact: true }).click();
  await expect(page.locator('.form-panel')).toHaveClass(/form-panel-fullscreen/);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  const fullscreen = await page.locator('.form-panel').boundingBox();
  expect(fullscreen!.x).toBe(0);
  expect(fullscreen!.y).toBe(0);
  expect(fullscreen!.height).toBe(await page.evaluate(() => innerHeight));
  await page.keyboard.press('Escape');
  await expect(page.locator('.form-panel')).not.toHaveClass(/form-panel-fullscreen/);
  await expect(page.locator('.form-layout')).toHaveClass(/form-layout-wide/);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await page.getByRole('button', { name: 'Minimize formulir', exact: true }).click();
  await expect(page.locator('.wbs-explanation')).toBeVisible();
  await expect(page.getByLabel('Judul laporan', { exact: false })).toHaveValue(
    'Uji tampilan formulir',
  );
  await expect(page.locator('.evidence-file')).toContainText('bukti.pdf');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    const explanation = await page.locator('.wbs-explanation').boundingBox();
    const form = await page.locator('.form-panel').boundingBox();
    expect(explanation).not.toBeNull();
    expect(form).not.toBeNull();
    if (width > 1000) {
      expect(explanation!.x + explanation!.width).toBeLessThan(form!.x);
      expect(Math.abs(explanation!.y - form!.y)).toBeLessThan(2);
    } else {
      expect(form!.y + form!.height).toBeLessThan(explanation!.y);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByLabel('Tanggal kejadian', { exact: false }).fill('2026-11-13');
  await page.getByLabel('Lokasi kejadian', { exact: false }).fill('Kampus');
  await page.getByLabel('Apa yang terjadi?', { exact: false }).fill('Kejadian uji');
  await page.getByLabel('Siapa yang terlibat?', { exact: false }).fill('Pihak uji');
  await page.locator('textarea').nth(2).fill('Dasar laporan uji');
  await page.locator('textarea').nth(3).fill('Kronologi uji');
  await page.getByLabel('Keterangan bukti pelanggaran', { exact: false }).fill('Dokumen pendukung');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Verifikasi CAPTCHA', exact: true }).click();
  await page.getByRole('button', { name: 'Kirim laporan', exact: true }).click();
  const ticket = page.getByRole('region', { name: 'Nomor tiket laporan', exact: true });
  await expect(ticket).toContainText('Mohon simpan tiket ini baik-baik.');
  await expect(ticket.locator('code')).toHaveText('WBS-' + 'A'.repeat(32));
  await expect(ticket).toBeFocused();
  await expect(ticket).toBeInViewport();
  expect(guests).toBe(1);
  await expect(
    page
      .getByRole('navigation', { name: 'Navigasi pelaporan' })
      .getByRole('link', { name: 'Login petugas', exact: true }),
  ).toHaveCount(0);
  await page.goto('/login');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Login petugas', exact: true })).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Kata sandi', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Daftar sekarang' })).toHaveCount(0);
});
test('pelacakan publik membutuhkan CAPTCHA dan menampilkan rincian dan timeline melalui tiket rahasia', async ({
  page,
}) => {
  const code = 'WBS-' + 'A'.repeat(32);
  let lookups = 0;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/public/statistics'))
      return route.fulfill({
        json: {
          total: 0,
          active: 0,
          completed: 0,
          closed: 0,
          categories: [],
          monthly: [],
          updatedAt: '2026-11-06T01:02:03Z',
        },
      });
    if (path.endsWith('/me'))
      return route.fulfill({ status: 401, json: { message: 'Silakan masuk' } });
    if (path.endsWith('/public/reports/status')) {
      lookups++;
      assertPayload(route.request().postDataJSON());
      return route.fulfill({
        json: {
          report: {
            id: 'test-report',
            number: 'WBS/2026/001',
            stage: 'INITIAL_REVIEW',
            lifecycle: 'ACTIVE',
            version: 1,
            payload: { title: 'Aduan uji', category: 'Akademik', subcategory: 'Pelanggaran ujian' },
            createdAt: '2026-11-06T01:02:03Z',
            updatedAt: '2026-11-06T01:02:03Z',
            events: [
              { action: 'SUBMIT', reason: 'Laporan diterima', createdAt: '2026-11-06T01:02:03Z' },
            ],
          },
          officialResponses: [],
          stage: 'INITIAL_REVIEW',
          label: 'Verifikasi awal',
          lifecycle: 'ACTIVE',
          updatedAt: '2026-11-06T01:02:03Z',
        },
      });
    }
    return route.fulfill({ json: [] });
  });
  function assertPayload(body: any) {
    expect(body.code).toBe(code);
    expect(body.captchaToken).toBe('synthetic-captcha-token');
  }
  await stubRecaptcha(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Ada yang perlu/ })).toBeVisible();
  await expect(page.locator('.public-hero-copy')).toContainText(
    'saluran resmi terkait penyampaian',
  );
  await expect(page.locator('.report-elements > div')).toHaveCount(6);
  await expect(page.locator('.report-types-list > li')).toHaveCount(0);
  await page
    .getByRole('navigation', { name: 'Navigasi publik' })
    .getByRole('link', { name: 'Jenis aduan', exact: true })
    .click();
  await expect(page).toHaveURL(/\/jenis-aduan$/);
  await expect(page.locator('.public-hero')).toHaveCount(0);
  await expect(page.locator('.report-types-list > li')).toHaveCount(9);
  await page.reload();
  await expect(page.locator('.report-types-list > li')).toHaveCount(9);
  await expect(page.locator('.report-types-list')).toContainText('cyberbullying');
  await page.getByRole('link', { name: 'Kembali ke beranda', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Ada yang perlu/ })).toBeVisible();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 1440, height: 950 });
  await expect(page.locator('#tracking')).toHaveCount(0);
  await expect(page.locator('.captcha-field')).toHaveCount(0);
  await page
    .getByRole('navigation', { name: 'Navigasi publik' })
    .getByRole('link', { name: 'Cek status', exact: true })
    .click();
  await expect(page).toHaveURL(/\/tracking$/);
  await expect(page.locator('.public-hero, .public-values')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Halaman pelacakan laporan' })).toBeVisible();
  const tracking = page.locator('#tracking');
  await tracking.getByLabel('Nomor tiket', { exact: true }).fill(code);
  await expect(tracking.getByRole('button', { name: 'Cek status', exact: true })).toBeDisabled();
  expect(lookups).toBe(0);
  await tracking.getByRole('button', { name: 'Verifikasi CAPTCHA', exact: true }).click();
  await tracking.getByRole('button', { name: 'Cek status', exact: true }).click();
  await expect(tracking.getByRole('status')).toContainText('Verifikasi awal');
  await expect(tracking.getByRole('status')).toContainText('08.02.03 WIB');
  await expect(tracking.getByRole('status')).toContainText('Aduan uji');
  await expect(tracking.getByRole('status')).toContainText('Laporan diterima');
  expect(lookups).toBe(1);
  await expect(tracking.getByRole('button', { name: 'Cek status', exact: true })).toBeDisabled();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    const resultBox = await tracking.locator('.tracking-result').boundingBox();
    const sectionBox = await tracking.boundingBox();
    expect(Math.abs(resultBox!.width - sectionBox!.width)).toBeLessThan(2);
    if (width === 1440) expect(resultBox!.width).toBeGreaterThan(width * 0.9);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
