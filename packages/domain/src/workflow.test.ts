import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextStage, validateSubmission } from './index';
test('otorisasi tahap dan pemisahan persetujuan', () => {
  assert.equal(nextStage('SUBMITTED', 'MANAGER', 'a', null), 'INITIAL_REVIEW');
  assert.throws(() => nextStage('ASSIGNMENT_APPROVAL', 'OFFICIAL', 'a', 'a'));
  assert.throws(() => nextStage('SUBMITTED', 'REPORTER', 'a', null));
  assert.throws(() => nextStage('COMPLETED', 'OFFICIAL', 'a', 'b'));
});
test('unsur laporan wajib divalidasi server', () => {
  assert.throws(() => validateSubmission({} as any));
});
