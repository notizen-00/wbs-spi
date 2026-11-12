import { Inject, Injectable, Optional } from '@nestjs/common';
import { fail } from '../common/validation';
export const CAPTCHA_FETCH = Symbol('CAPTCHA_FETCH');
@Injectable()
export class CaptchaService {
  constructor(@Optional() @Inject(CAPTCHA_FETCH) private readonly request: typeof fetch = fetch) {}
  configuration() {
    const siteKey = process.env.NUXT_PUBLIC_RECAPTCHA_SITE_KEY || '';
    const required = process.env.NODE_ENV !== 'development';
    return {
      siteKey: required ? siteKey : '',
      configured: Boolean(siteKey && process.env.RECAPTCHA_SECRET_KEY),
      required,
    };
  }
  async verify(value: unknown) {
    if (process.env.NODE_ENV === 'development') return;
    const secret = process.env.RECAPTCHA_SECRET_KEY;
    if (!secret) fail(503, 'Verifikasi keamanan belum tersedia. Hubungi administrator.');
    if (typeof value !== 'string' || !value.trim() || value.length > 4096)
      fail(422, 'Selesaikan reCAPTCHA sebelum melanjutkan.');
    let result: { success?: boolean; hostname?: string; challenge_ts?: string };
    try {
      const response = await this.request('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        body: new URLSearchParams({ secret, response: value }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('Verification unavailable');
      result = await response.json();
    } catch {
      fail(503, 'reCAPTCHA tidak dapat diperiksa. Coba kembali beberapa saat lagi.');
    }
    const hosts = (
      process.env.RECAPTCHA_ALLOWED_HOSTNAMES ||
      new URL(process.env.APP_ORIGIN || 'http://localhost:3000').hostname
    )
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    const timestamp = Date.parse(result.challenge_ts ?? '');
    if (
      !result.success ||
      !hosts.includes((result.hostname ?? '').toLowerCase()) ||
      !Number.isFinite(timestamp) ||
      timestamp > Date.now() + 5000
    )
      fail(422, 'reCAPTCHA tidak valid atau sudah kedaluwarsa. Silakan ulangi verifikasi.');
  }
}
