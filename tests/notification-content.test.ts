import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  caseNotification,
  outboxNotification,
} from '../apps/api/src/notifications/notification-content';

test('notifikasi membedakan tindakan penerima dan menyertakan referensi laporan', () => {
  const reporter = caseNotification('CLARIFY', 'INITIAL_REVIEW', 'WBS/2026/00042', 'REPORTER');
  assert.equal(reporter.title, 'Klarifikasi laporan diperlukan');
  assert.ok(reporter.subject.includes('WBS/2026/00042'));
  assert.ok(reporter.message.includes('jawab permintaan klarifikasi'));
  const official = caseNotification(
    'PROPOSE_RESULT',
    'RESULT_APPROVAL',
    'WBS/2026/00042',
    'OFFICIAL',
  );
  assert.ok(official.message.includes('berikan keputusan'));
  const publicUpdate = caseNotification(
    'PROPOSE_RESULT',
    'RESULT_APPROVAL',
    'WBS/2026/00042',
    'REPORTER',
  );
  assert.equal(publicUpdate.title, 'Perkembangan penanganan laporan');
  assert.ok(!publicUpdate.message.includes('berikan keputusan'));
});

test('notifikasi keputusan membedakan selesai, pengembalian, dan pembukaan kembali', () => {
  assert.equal(
    caseNotification('DECIDE', 'COMPLETED', null, 'REPORTER', 'APPROVE').title,
    'Laporan selesai ditangani',
  );
  assert.ok(
    caseNotification('DECIDE', 'COMPLETED', null, 'REPORTER', 'APPROVE').message.includes(
      'jawaban resmi',
    ),
  );
  assert.equal(
    caseNotification('DECIDE', 'INITIAL_REVIEW', null, 'MANAGER', 'RETURN').title,
    'Usulan dikembalikan untuk ditelaah',
  );
  assert.equal(
    caseNotification('DECIDE', 'INVESTIGATION', null, 'REPORTER', 'APPROVE', 'COMPLETED').title,
    'Pembukaan kembali laporan disetujui',
  );
});

test('email akun menggunakan subjek khusus dan tidak menyalin token ke notifikasi portal', () => {
  for (const kind of ['VERIFY', 'RESET']) {
    const content = outboxNotification(kind, { token: 'secret-token' });
    assert.ok(!JSON.stringify(content).includes('secret-token'));
    assert.notEqual(content.subject, outboxNotification('UPDATE', {}).subject);
  }
  assert.ok(outboxNotification('UPDATE', {}).title);
});
