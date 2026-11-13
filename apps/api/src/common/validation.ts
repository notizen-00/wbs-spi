import { HttpException } from '@nestjs/common';
import type { ReportPayload } from '@wbs/contracts';
import { Prisma } from '../generated/prisma/client';
export function fail(status: number, message: string): never {
  throw new HttpException({ message }, status);
}
export function validId(id: unknown): asserts id is string {
  if (
    typeof id !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
  )
    fail(404, 'Objek tidak ditemukan.');
}
export function text(value: unknown, name: string, max = 20000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    fail(422, `Lengkapi ${name}.`);
  return value.trim();
}
export function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
export function object(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}
export function reportPayload(value: unknown): ReportPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(422, 'Isian laporan tidak valid.');
  const input = object(value);
  const output: Record<string, string> = {};
  for (const field of [
    'title',
    'category',
    'subcategory',
    'what',
    'who',
    'when',
    'where',
    'why',
    'how',
    'evidenceReason',
    'confidentiality',
    'contactEmail',
  ]) {
    if (input[field] !== undefined && typeof input[field] !== 'string')
      fail(422, 'Format isian tidak valid.');
    output[field] = String(input[field] ?? '').slice(0, field === 'title' ? 200 : 20000);
  }
  output.contactEmail = output.confidentiality === 'IDENTIFIED' ? output.contactEmail!.trim() : '';
  return output as unknown as ReportPayload;
}
