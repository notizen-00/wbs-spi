import { test, expect, type Page } from '@playwright/test';
test.use({ baseURL: 'http://127.0.0.1:3000' });

async function setup(page: Page, role: string, initialStage?: string) {
  const report = {
    id: '00000000-0000-4000-8000-000000000001',
    number: 'WBS/2026/001',
    stage: initialStage ?? (role === 'OFFICIAL' ? 'RESULT_APPROVAL' : 'RESULT_REVIEW'),
    lifecycle: 'ACTIVE',
    version: 1,
    payload: { title: 'Perkara tindak lanjut', category: 'Pelanggaran Umum (Zona Integritas)' },
    createdAt: '2026-11-13T01:00:00Z',
    updatedAt: '2026-11-13T01:00:00Z',
    events: [] as any[],
  };
  const commands: any[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/me'))
      return route.fulfill({
        json: { id: role, name: 'Petugas Uji', role, verified: true, email: 'staff@example.test' },
      });
    if (path.endsWith('/commands')) {
      const body = route.request().postDataJSON();
      commands.push({ ...body, requestKey: route.request().headers()['idempotency-key'] });
      report.version++;
      if (body.action === 'CLOSE_NO_FOLLOW_UP') {
        report.stage = 'CLOSED';
        report.lifecycle = 'CLOSED';
        report.events.push({
          action: body.action,
          reason: body.reason,
          createdAt: report.updatedAt,
        });
      } else if (body.action === 'ADVANCE') report.stage = 'INITIAL_REVIEW';
      else if (body.action === 'FORWARD_TO_OFFICIAL')
        report.stage =
          report.stage === 'INITIAL_REVIEW' ? 'ASSIGNMENT_APPROVAL' : 'RESULT_APPROVAL';
      else if (body.action === 'PROPOSE_ASSIGNMENT') report.stage = 'INVESTIGATION';
      else if (body.action === 'PROPOSE_RESULT') report.stage = 'FOLLOW_UP';
      else report.stage = 'FOLLOW_UP';
      return route.fulfill({ json: report });
    }
    if (path.endsWith('/workspace'))
      return route.fulfill({
        json: {
          officialResponses: [],
          reopenRequests: [],
          tasks: [],
          findings: [],
          users:
            role === 'OFFICIAL'
              ? [
                  { id: 'executor-selected', role: 'EXECUTOR', name: 'Pelaksana Pilihan Pejabat' },
                  {
                    id: 'investigator-selected',
                    role: 'INVESTIGATOR',
                    name: 'Pemeriksa Pilihan Pejabat',
                  },
                ]
              : [],
          proposals: [],
        },
      });
    if (path.endsWith('/' + report.id)) return route.fulfill({ json: report });
    if (path.endsWith('/reports')) return route.fulfill({ json: [report] });
    if (path.endsWith('/notifications/summary')) return route.fulfill({ json: { unreadCount: 0 } });
    return route.fulfill({ json: [] });
  });
  await page.goto('/reports/' + report.id);
  return { report, commands };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: undefined,
      configurable: true,
    }),
  );
});

test('mulai verifikasi tetap bekerja ketika randomUUID tidak tersedia pada HTTP LAN', async ({
  page,
}) => {
  const { report, commands } = await setup(page, 'INVESTIGATOR', 'SUBMITTED');
  await page.getByLabel('Catatan tindakan', { exact: false }).fill('Verifikasi awal dimulai.');
  await page.getByRole('button', { name: 'Mulai verifikasi', exact: true }).click();
  await expect.poll(() => commands.length).toBe(1);
  expect(commands[0].action).toBe('ADVANCE');
  expect(commands[0].requestKey).toMatch(
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  expect(report.stage).toBe('INITIAL_REVIEW');
  await expect(page.locator('.alert.success')).toContainText('Tindakan berhasil disimpan.');
  await expect(page.locator('.alert.error')).toHaveCount(0);
});

test('verifikator hanya meneruskan ke pejabat atau menolak laporan dengan alasan', async ({
  page,
}) => {
  const { report, commands } = await setup(page, 'INVESTIGATOR');
  await expect(page.locator('.workspace-actions button')).toHaveText([
    'Teruskan ke pejabat',
    'Tolak laporan',
  ]);
  await expect(page.getByRole('button', { name: 'Tolak laporan', exact: true })).toHaveCSS(
    'color',
    'rgb(165, 29, 40)',
  );
  await expect(page.getByRole('button', { name: 'Teruskan ke pejabat', exact: true })).toHaveClass(
    /positive/,
  );
  await page.getByRole('button', { name: 'Teruskan ke pejabat', exact: true }).click();
  await expect(page.getByLabel('Pelaksana tindak lanjut', { exact: true })).toHaveCount(0);
  await expect(
    page.getByLabel('Rencana & bukti pelaksanaan yang dibutuhkan', { exact: false }),
  ).toHaveCount(0);
  await page
    .getByLabel('Catatan penerusan (ditampilkan kepada pelapor)', { exact: false })
    .fill('Hasil telah diverifikasi dan diteruskan.');
  await page.getByRole('button', { name: 'Simpan tindakan', exact: true }).click();
  await expect.poll(() => commands.length).toBe(1);
  expect(commands[0].action).toBe('FORWARD_TO_OFFICIAL');
  expect(commands[0].executorId).toBe('');
  expect(report.stage).toBe('RESULT_APPROVAL');
  report.stage = 'RESULT_REVIEW';
  await page.reload();
  await page.getByRole('button', { name: 'Tolak laporan', exact: true }).click();
  await page
    .getByLabel('Alasan penolakan (ditampilkan kepada pelapor)', { exact: false })
    .fill('Tidak ditemukan indikasi pelanggaran.');
  await expect(
    page.getByRole('button', { name: 'Tolak dan tutup laporan', exact: true }),
  ).toHaveCSS('background-color', 'rgb(180, 35, 50)');
  await expect(page.getByRole('button', { name: 'Batal', exact: true })).toHaveClass(/neutral/);
  await page.getByRole('button', { name: 'Tolak dan tutup laporan', exact: true }).click();
  await expect.poll(() => commands.length).toBe(2);
  expect(commands[1].action).toBe('CLOSE_NO_FOLLOW_UP');
  await expect(
    page.getByRole('complementary', { name: 'Timeline perkembangan laporan' }),
  ).toContainText('Tidak ditemukan indikasi pelanggaran.');
});

test('pejabat membuat rencana dan memilih pelaksana tanpa persetujuan tambahan', async ({
  page,
}) => {
  const { report, commands } = await setup(page, 'OFFICIAL');
  await expect(page.locator('.workspace-actions button')).toHaveText([
    'Tugaskan pelaksana',
    'Tolak laporan',
  ]);
  await page.getByRole('button', { name: 'Tugaskan pelaksana', exact: true }).click();
  await page
    .getByLabel('Alasan / catatan keputusan', { exact: false })
    .fill('Pelaksanaan ditetapkan pejabat');
  await page
    .getByLabel('Rencana & bukti pelaksanaan yang dibutuhkan', { exact: false })
    .fill('Perbaiki layanan dan lampirkan bukti');
  await page
    .getByLabel('Pelaksana tindak lanjut', { exact: true })
    .selectOption('executor-selected');
  await page.getByRole('button', { name: 'Simpan tindakan', exact: true }).click();
  await expect.poll(() => commands.length).toBe(1);
  expect(commands[0]).toMatchObject({
    action: 'PROPOSE_RESULT',
    executorId: 'executor-selected',
    instruction: 'Perbaiki layanan dan lampirkan bukti',
  });
  expect(report.stage).toBe('FOLLOW_UP');
  await expect(page.getByRole('button', { name: 'Setujui', exact: true })).toHaveCount(0);
});

test('setelah verifikasi pejabat langsung memilih pelaksana tanpa memilih pemeriksa lagi', async ({
  page,
}) => {
  const { report, commands } = await setup(page, 'OFFICIAL', 'ASSIGNMENT_APPROVAL');
  await expect(page.locator('.workspace-actions button')).toHaveText([
    'Tugaskan pelaksana',
    'Tolak laporan',
  ]);
  await page.getByRole('button', { name: 'Tugaskan pelaksana', exact: true }).click();
  await expect(page.getByLabel('Tim pemeriksa', { exact: false })).toHaveCount(0);
  await page
    .getByLabel('Pelaksana tindak lanjut', { exact: true })
    .selectOption('executor-selected');
  await page
    .getByLabel('Rencana & bukti pelaksanaan yang dibutuhkan', { exact: false })
    .fill('Laksanakan pemeriksaan dan tindak lanjut');
  await page
    .getByLabel('Alasan / catatan keputusan', { exact: false })
    .fill('Penugasan langsung ke pelaksana');
  await page.getByRole('button', { name: 'Simpan tindakan', exact: true }).click();
  await expect.poll(() => commands.length).toBe(1);
  expect(commands[0]).toMatchObject({ action: 'PROPOSE_RESULT', executorId: 'executor-selected' });
  expect(report.stage).toBe('FOLLOW_UP');
});

test('pejabat dapat menolak laporan yang diteruskan dengan alasan', async ({ page }) => {
  const { report, commands } = await setup(page, 'OFFICIAL');
  await page.getByRole('button', { name: 'Tolak laporan', exact: true }).click();
  await page
    .getByLabel('Alasan penolakan (ditampilkan kepada pelapor)', { exact: false })
    .fill('Dasar tindak lanjut tidak memadai.');
  await page.getByRole('button', { name: 'Tolak dan tutup laporan', exact: true }).click();
  await expect.poll(() => commands.length).toBe(1);
  expect(report.stage).toBe('CLOSED');
  await expect(
    page.getByRole('complementary', { name: 'Timeline perkembangan laporan' }),
  ).toContainText('Dasar tindak lanjut tidak memadai.');
});
