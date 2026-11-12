import './config/environment';
import type { User } from '@wbs/contracts';
import { PrismaService } from './prisma/prisma.service';
import { ReportsService } from './reports/reports.service';
import { ReportsRepository } from './reports/reports.repository';
import { WorkflowService } from './reports/workflow.service';
import { EvidenceService } from './evidence/evidence.service';
import { MinioStorageService } from './storage/minio-storage.service';
import { scan } from './storage';
import { hash } from './security';
import { seed } from './seed';

export const completedCaseId = '2f6c9df0-7a42-4f37-8d82-3ae1e35bc001';
const payload = {
  title: '[DEMO SINTETIS] Pungutan tambahan layanan administrasi',
  category: 'Pungutan liar',
  what: 'Petugas fiktif meminta biaya Rp150.000 untuk layanan administrasi yang seharusnya gratis.',
  who: 'Petugas A dan mahasiswa B adalah tokoh rekaan untuk simulasi, bukan orang nyata.',
  when: '2026-11-02',
  where: 'Loket simulasi Unit Layanan Demo, bukan unit nyata.',
  why: 'Informasi layanan menyatakan gratis, tetapi pemohon diminta membayar tanpa kuitansi resmi.',
  how: 'Permintaan pembayaran disampaikan saat pengambilan dokumen. Pelapor menyimpan catatan kejadian.',
  confidentiality: 'PROTECTED',
  evidenceReason:
    'Catatan kejadian sintetis dan berita acara perbaikan sintetis dilampirkan untuk UAT.',
};

// Uses the application's commands so audit, snapshots, decisions and access follow real rules.
export async function seedCompletedCase(
  prisma: PrismaService,
  storage: MinioStorageService,
  scanEvidence: typeof scan = scan,
) {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Synthetic case seed disabled in production');
  const people: User[] = [];
  for (const [email, role] of [
    ['pelapor@example.test', 'REPORTER'],
    ['pengelola@example.test', 'INVESTIGATOR'],
    ['pejabat@example.test', 'OFFICIAL'],
    ['pemeriksa@example.test', 'INVESTIGATOR'],
    ['pelaksana@example.test', 'EXECUTOR'],
  ]) {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    if (user.role !== role || !user.active || !user.verified)
      throw new Error(`Akun demo ${email} harus aktif, terverifikasi, dan memiliki role ${role}.`);
    people.push(user as User);
  }
  const [reporter, manager, official, investigator, executor] = people as [
    User,
    User,
    User,
    User,
    User,
  ];
  const existing = await prisma.report.findUnique({ where: { id: completedCaseId } });
  if (existing?.stage === 'COMPLETED') return existing;
  // Check infrastructure before creating any case data. Never fabricate a successful scan.
  await storage.check();
  if ((await scanEvidence(Buffer.from('WBS synthetic case connectivity check'))) !== 'READY')
    throw new Error('Scanner belum siap untuk seed kasus.');
  const repository = new ReportsRepository(prisma);
  const reports = new ReportsService(prisma, repository, new WorkflowService());
  const evidence = new EvidenceService(prisma, repository, storage);
  await prisma.report.upsert({
    where: { id: completedCaseId },
    create: { id: completedCaseId, ownerId: reporter.id, payload },
    update: {},
  });
  async function command(step: string, actor: User, action: string, reason: string, extra = {}) {
    const key = `seed-completed-case-v1:${step}`;
    const prior = await prisma.idempotencyRecord.findUnique({
      where: { actorId_operation_key: { actorId: actor.id, operation: completedCaseId, key } },
    });
    if (prior) return;
    const report = await prisma.report.findUniqueOrThrow({ where: { id: completedCaseId } });
    await reports.command(
      completedCaseId,
      actor,
      {
        action,
        reason,
        expectedVersion: report.version,
        ...extra,
      },
      key,
    );
  }
  async function attach(actor: User, name: string, content: string) {
    let item = await prisma.evidence.findFirst({
      where: { reportId: completedCaseId, uploaderId: actor.id, originalName: name },
    });
    if (!item) {
      // A small valid PDF that can also be opened/downloaded from the portal.
      const escaped = content.replace(/[()\\]/g, '\\$&');
      const stream = `BT /F1 10 Tf 36 790 Td (${escaped}) Tj ET`;
      const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
      ];
      let pdf = '%PDF-1.4\n';
      const offsets = [0];
      for (const [index, object] of objects.entries()) {
        offsets.push(Buffer.byteLength(pdf));
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
      }
      const xref = Buffer.byteLength(pdf);
      pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
        .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
      const uploaded = await evidence.upload(completedCaseId, actor, {
        name,
        data: Buffer.from(pdf).toString('base64'),
      });
      item = await prisma.evidence.findUniqueOrThrow({ where: { id: uploaded.id } });
    }
    const bytes = await storage.retrieve(item.storageKey);
    if (hash(bytes) !== item.checksum || (await scanEvidence(bytes)) !== 'READY')
      throw new Error(
        `Bukti ${name} belum lolos pemeriksaan; seed dapat dijalankan ulang setelah layanan pulih.`,
      );
    await prisma.evidence.update({
      where: { id: item.id },
      data: {
        scanStatus: 'READY',
        scanError: null,
        scanVersion: 'clamav-instream-v1',
        attempts: { increment: 1 },
      },
    });
    return item.id;
  }
  // Stable step keys allow reruns to resume after an unavailable dependency.
  const submitted = await prisma.idempotencyRecord.findUnique({
    where: {
      actorId_operation_key: {
        actorId: reporter.id,
        operation: completedCaseId,
        key: 'seed-completed-case-v1:submit',
      },
    },
  });
  if (!submitted)
    await attach(
      reporter,
      'demo-catatan-kejadian.pdf',
      'SYNTHETIC DEMO: Unofficial fee Rp150000 requested for a free service.',
    );
  await command(
    'submit',
    reporter,
    'SUBMIT',
    'Laporan sintetis dikirim untuk simulasi penanganan pungutan tambahan.',
  );
  await command(
    'review',
    manager,
    'ADVANCE',
    'Laporan diterima; verifikator/pemeriksa mulai memverifikasi informasi awal.',
  );
  await command(
    'clarify',
    manager,
    'CLARIFY',
    'Apakah biaya tercantum pada tarif resmi dan apakah ada kuitansi?',
  );
  await command(
    'respond',
    reporter,
    'RESPOND',
    'Layanan dinyatakan gratis. Permintaan Rp150.000 tidak disertai kuitansi resmi.',
  );
  await command(
    'assignment',
    manager,
    'PROPOSE_ASSIGNMENT',
    'Informasi awal memadai untuk pemeriksaan.',
    {
      assigneeId: investigator.id,
      summary:
        'Dugaan pungutan tidak resmi pada layanan administrasi unit simulasi; periksa tarif dan prosedur tanpa membuka identitas pelapor.',
    },
  );
  await command(
    'approve-assignment',
    official,
    'DECIDE',
    'Penugasan pemeriksaan disetujui sesuai mandat.',
    { decision: 'APPROVE' },
  );
  await command(
    'finding',
    investigator,
    'FINDING',
    'Pemeriksaan dokumen dan wawancara simulasi telah selesai.',
    {
      content:
        'SIMULASI: Tarif resmi layanan adalah Rp0. Permintaan Rp150.000 tidak memiliki dasar. Rekomendasi: hentikan pungutan, kembalikan pembayaran simulasi, tampilkan tarif gratis, dan beri pengarahan petugas.',
    },
  );
  await command(
    'result',
    manager,
    'PROPOSE_RESULT',
    'Hasil pemeriksaan memadai; usulkan perbaikan layanan.',
    {
      executorId: executor.id,
      instruction:
        'Hentikan pungutan; catat pengembalian Rp150.000 dalam simulasi; pasang informasi layanan gratis; lakukan pengarahan petugas; unggah berita acara sintetis.',
    },
  );
  await command(
    'approve-result',
    official,
    'DECIDE',
    'Hasil dan rencana tindak lanjut disetujui.',
    { decision: 'APPROVE' },
  );
  const task = await prisma.followUpTask.findFirstOrThrow({
    where: { reportId: completedCaseId, executorId: executor.id },
  });
  if (task.status === 'OPEN' || task.status === 'RETURNED') {
    const evidenceId = await attach(
      executor,
      'demo-berita-acara-perbaikan.pdf',
      'SYNTHETIC DEMO: Fee stopped; Rp150000 refund recorded; free-service notice installed; staff briefed.',
    );
    await command(
      'execute',
      executor,
      'EXECUTE',
      'Seluruh langkah perbaikan simulasi dilaksanakan dan bukti dilampirkan.',
      {
        taskId: task.id,
        evidenceId,
        execution:
          'Pungutan dihentikan, pengembalian Rp150.000 dicatat dalam simulasi, informasi layanan gratis dipasang, dan petugas menerima pengarahan. Berita acara sintetis terlampir.',
      },
    );
  }
  await command(
    'verify',
    manager,
    'REVIEW_EXECUTION',
    'Berita acara dan pelaksanaan telah diperiksa; seluruh instruksi terpenuhi.',
    { taskId: task.id, decision: 'VERIFY' },
  );
  await command(
    'closure',
    manager,
    'PROPOSE_CLOSURE',
    'Seluruh tindak lanjut telah terverifikasi; usulkan penyelesaian perkara.',
    {
      outcome: 'COMPLETED',
      response:
        'Laporan simulasi telah diperiksa. Pungutan tidak resmi dihentikan, pengembalian dana simulasi dicatat, informasi layanan gratis dipasang, dan pengarahan petugas selesai. Pelaksanaan telah diverifikasi. Terima kasih atas laporan Anda. Seluruh tokoh, unit, dan bukti pada kasus ini adalah sintetis.',
    },
  );
  await command(
    'approve-closure',
    official,
    'DECIDE',
    'Penutupan disetujui setelah seluruh tindak lanjut diverifikasi.',
    { decision: 'APPROVE' },
  );
  return prisma.report.findUniqueOrThrow({ where: { id: completedCaseId } });
}

async function main() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Synthetic case seed disabled in production');
  const prisma = new PrismaService();
  const storage = new MinioStorageService();
  try {
    await seed(prisma, process.env.SEED_PASSWORD ?? '');
    const report = await seedCompletedCase(prisma, storage);
    console.log(`Kasus demo selesai: ${report.number} | ${report.stage} | ID ${report.id}`);
    console.log(
      'Masuk sebagai pelapor@example.test untuk melihat jawaban resmi; pengelola@example.test untuk riwayat internal.',
    );
  } finally {
    storage.onModuleDestroy();
    await prisma.$disconnect();
  }
}
if (require.main === module)
  main().catch((error) => {
    const response = error?.getResponse?.();
    console.error(
      response?.message ?? (error instanceof Error ? error.message : 'Seed kasus gagal.'),
    );
    process.exitCode = 1;
  });
