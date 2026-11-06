import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEvidenceFile } from '../apps/api/src/evidence/evidence-file';
import { EVIDENCE_MAX_BYTES } from '@wbs/contracts';

function iso(brand: string) {
  const buffer = Buffer.alloc(32);
  buffer.writeUInt32BE(32);
  buffer.write('ftyp', 4);
  buffer.write(brand, 8);
  return buffer;
}
const mp3 = Buffer.alloc(417);
mp3.set([0xff, 0xfb, 0x90, 0x64]);
const cases: [string, Buffer, string][] = [
  ['document.pdf', Buffer.from('%PDF-1.7\nSynthetic PDF fixture\n%%EOF'), 'application/pdf'],
  [
    'image.png',
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG6kAAAAASUVORK5CYII=',
      'base64',
    ),
    'image/png',
  ],
  ['image.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xdb, ...Array(40).fill(0)]), 'image/jpeg'],
  ['image.gif', Buffer.from('GIF89a' + String.fromCharCode(1, 0, 1, 0, 0, 0, 0)), 'image/gif'],
  [
    'image.webp',
    Buffer.from('52494646180000005745425056503820000000000000000000000000', 'hex'),
    'image/webp',
  ],
  ['image.avif', iso('avif'), 'image/avif'],
  ['voice.mp3', mp3, 'audio/mpeg'],
  ['video.mp4', iso('isom'), 'video/mp4'],
  ['video.mov', iso('qt  '), 'video/quicktime'],
  ['video.m4v', iso('M4V '), 'video/x-m4v'],
  ['video.3gp', iso('3gp4'), 'video/3gpp'],
  [
    'video.mkv',
    Buffer.from(
      '1a45dfa3a34286810142f7810142f2810442f381084282886d6174726f736b614287810242858102',
      'hex',
    ),
    'video/matroska',
  ],
  [
    'video.mpg',
    Buffer.from('000001ba44000000000000000000000000000000000000000000000000000000', 'hex'),
    'video/mpeg',
  ],
  [
    'video.avi',
    Buffer.from('52494646200000004156492000000000000000000000000000000000', 'hex'),
    'video/vnd.avi',
  ],
  [
    'video.webm',
    Buffer.from('1a45dfa39f4286810142f7810142f2810442f381084282847765626d4287810242858102', 'hex'),
    'video/webm',
  ],
];
for (const [name, bytes, mime] of cases)
  test(`validasi isi menerima ${name}`, async () => {
    assert.equal((await validateEvidenceFile(name, bytes.toString('base64'))).mime, mime);
  });
test('tolak ekstensi palsu, SVG aktif, base64 rusak, dan berkas terlalu besar', async () => {
  await assert.rejects(
    validateEvidenceFile('fake.mp4', cases[0]![1].toString('base64')),
    (error: any) => error.getStatus() === 422,
  );
  await assert.rejects(
    validateEvidenceFile(
      'script.svg',
      Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64'),
    ),
  );
  await assert.rejects(validateEvidenceFile('broken.pdf', '%%%'));
  await assert.rejects(
    validateEvidenceFile('huge.pdf', Buffer.alloc(EVIDENCE_MAX_BYTES + 1).toString('base64')),
    (error: any) => error.getStatus() === 413,
  );
});
