import { fileTypeFromBuffer } from 'file-type';
import { evidenceTypes, EVIDENCE_MAX_BYTES, evidenceFormatLabel } from '@wbs/contracts';
import { fail } from '../common/validation';

export async function validateEvidenceFile(name: unknown, data: unknown) {
  const maxBase64 = 4 * Math.ceil(EVIDENCE_MAX_BYTES / 3);
  if (typeof name !== 'string' || !name.trim() || typeof data !== 'string' || !data.length)
    fail(422, 'Nama dan isi berkas wajib diisi.');
  if (data.length > maxBase64) fail(413, 'Maksimal 20 MiB per berkas.');
  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data))
    fail(422, 'Data berkas tidak valid. Silakan pilih ulang berkas.');
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length) fail(422, 'Berkas kosong tidak dapat diunggah.');
  if (bytes.length > EVIDENCE_MAX_BYTES) fail(413, 'Maksimal 20 MiB per berkas.');
  if (bytes.toString('base64') !== data) fail(422, 'Data berkas tidak valid.');
  let detected;
  try {
    detected = await fileTypeFromBuffer(bytes);
  } catch {
    fail(422, 'Isi berkas rusak atau format tidak dapat dikenali.');
  }
  const aliases: Record<string, string> = {
    'video/MP1S': 'video/mpeg',
    'video/MP2P': 'video/mpeg',
    'image/heif-sequence': 'image/heif',
    'image/heic-sequence': 'image/heic',
  };
  const mime = detected ? (aliases[detected.mime] ?? detected.mime) : '';
  const extension = name.split('.').pop()?.toLowerCase();
  const allowed = evidenceTypes[mime as keyof typeof evidenceTypes] as
    readonly string[] | undefined;
  if (!detected || !allowed || !extension || !allowed.includes(extension))
    fail(422, `Format atau ekstensi berkas tidak sesuai. Diizinkan: ${evidenceFormatLabel}.`);
  if (mime === 'audio/mpeg' && detected.ext !== 'mp3') fail(422, 'Hanya audio MP3 yang didukung.');
  return { bytes, mime, name };
}
