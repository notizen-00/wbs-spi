import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
export const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export function passwordHash(p: string) {
  const salt = token();
  return `${salt}:${scryptSync(p, salt, 64).toString('hex')}`;
}
export function passwordMatches(p: string, stored: string) {
  const [salt, key] = stored.split(':');
  const b = Buffer.from(key, 'hex');
  return b.length === 64 && timingSafeEqual(b, scryptSync(p, salt, 64));
}
