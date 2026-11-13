import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextStage, validateSubmission } from './index';
test('otorisasi tahap dan pemisahan persetujuan', () => {
  assert.equal(nextStage('SUBMITTED', 'INVESTIGATOR', 'a', null), 'INITIAL_REVIEW');
  assert.equal(nextStage('ASSIGNMENT_APPROVAL', 'OFFICIAL', 'a', null), 'FOLLOW_UP');
  assert.throws(() => nextStage('ASSIGNMENT_APPROVAL', 'OFFICIAL', 'a', 'a'));
  assert.throws(() => nextStage('SUBMITTED', 'REPORTER', 'a', null));
  assert.throws(() => nextStage('COMPLETED', 'OFFICIAL', 'a', 'b'));
});
test('unsur laporan wajib divalidasi server', () => {
  assert.throws(() => validateSubmission({} as any));
});

test('bersedia dihubungi memerlukan email valid, identitas terlindungi tidak memerlukan email', () => {
  const payload = {
    title: 'Laporan',
    category: 'Kategori',
    what: 'Fakta',
    who: 'Pihak',
    when: '2026-11-13',
    where: 'Lokasi',
    why: 'Dasar',
    how: 'Kronologi',
    evidenceReason: 'Dokumen',
    confidentiality: 'IDENTIFIED' as const,
  };
  assert.throws(() => validateSubmission(payload), /email/);
  assert.throws(() => validateSubmission({ ...payload, contactEmail: 'bukan-email' }), /email/);
  assert.doesNotThrow(() =>
    validateSubmission({ ...payload, contactEmail: 'pelapor@example.test' }),
  );
  assert.doesNotThrow(() => validateSubmission({ ...payload, confidentiality: 'PROTECTED' }));
});
