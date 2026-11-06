import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Request, Response } from 'express';
import Redis from 'ioredis';
import type { User } from '@wbs/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { hash, token, passwordHash, passwordMatches } from '../security';
import { fail, object } from '../common/validation';
@Injectable()
export class AuthService implements OnModuleDestroy {
  readonly redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    this.redis.on('error', () => {});
  }
  onModuleDestroy() {
    this.redis.disconnect();
  }
  async session(req: Request): Promise<User> {
    return this.sessionFromToken(req.cookies?.wbs_session);
  }
  async sessionFromToken(raw: unknown): Promise<User> {
    if (typeof raw !== 'string' || !/^[a-f0-9]{64}$/i.test(raw))
      fail(401, 'Silakan masuk terlebih dahulu.');
    let stored: string | null = null;
    try {
      stored = await this.redis.get(`session:${hash(raw)}`);
    } catch {
      fail(503, 'Layanan sesi sementara tidak tersedia.');
    }
    if (!stored) fail(401, 'Sesi telah berakhir.');
    const [id, version] = stored.split(':');
    if (!id || !/^\d+$/.test(version ?? '')) fail(401, 'Sesi tidak berlaku.');
    const user = await this.prisma.user.findFirst({
      where: { id, authVersion: Number(version), active: true },
      select: { id: true, name: true, email: true, role: true, verified: true },
    });
    return (user as User) ?? fail(401, 'Sesi tidak berlaku.');
  }
  async rate(req: Request, kind: string, limit = 10) {
    try {
      const key = `rate:${kind}:${req.ip}`;
      const n = await this.redis.incr(key);
      if (n === 1) await this.redis.expire(key, 900);
      if (n > limit) fail(429, 'Terlalu banyak percobaan. Coba kembali 15 menit lagi.');
    } catch (e) {
      if (e instanceof Error && 'getStatus' in e) throw e;
      fail(503, 'Layanan sementara tidak tersedia.');
    }
  }
  async register(req: Request, input: unknown) {
    await this.rate(req, 'register');
    const b = object(input);
    if (
      typeof b.name !== 'string' ||
      !b.name.trim() ||
      !this.validEmail(b.email) ||
      !this.validPassword(b.password)
    )
      fail(422, 'Isi nama, email valid, dan kata sandi 12–128 karakter.');
    try {
      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: b.name.trim().slice(0, 120),
            email: b.email.toLowerCase().trim(),
            passwordHash: passwordHash(b.password),
          },
        });
        await this.issueToken(tx, user.id, 'VERIFY');
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
    return { message: 'Jika email dapat didaftarkan, tautan verifikasi akan dikirim.' };
  }
  async recovery(req: Request, input: unknown) {
    await this.rate(req, 'recovery', 5);
    const b = object(input);
    if (!this.validEmail(b.email)) fail(422, 'Isi email yang valid.');
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { email: b.email.toLowerCase().trim(), active: true },
        select: { id: true },
      });
      if (user) await this.issueToken(tx, user.id, b.kind === 'VERIFY' ? 'VERIFY' : 'RESET');
    });
    return { message: 'Jika akun ditemukan, tautan akan dikirim ke email Anda.' };
  }
  private async issueToken(tx: Prisma.TransactionClient, userId: string, kind: string) {
    const value = token();
    await tx.accountToken.create({
      data: { tokenHash: hash(value), userId, kind, expiresAt: new Date(Date.now() + 3600000) },
    });
    await tx.outboxEvent.create({ data: { recipientId: userId, kind, payload: { token: value } } });
  }
  async consume(req: Request, input: unknown, kind: 'VERIFY' | 'RESET') {
    await this.rate(req, kind === 'VERIFY' ? 'verify' : 'reset');
    const b = object(input);
    if (kind === 'RESET' && !this.validPassword(b.password))
      fail(422, 'Gunakan kata sandi 12–128 karakter.');
    await this.prisma.$transaction(async (tx) => {
      const tokenHash = hash(String(b.token ?? ''));
      const t = await tx.accountToken.findUnique({ where: { tokenHash } });
      if (!t || t.kind !== kind) fail(422, 'Tautan tidak berlaku atau kedaluwarsa.');
      const consumed = await tx.accountToken.updateMany({
        where: { tokenHash, kind, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) fail(422, 'Tautan tidak berlaku atau kedaluwarsa.');
      await tx.user.update({
        where: { id: t.userId },
        data:
          kind === 'VERIFY'
            ? { verified: true }
            : { passwordHash: passwordHash(b.password), authVersion: { increment: 1 } },
      });
      if (kind === 'RESET')
        await tx.accountToken.updateMany({
          where: { userId: t.userId, kind, consumedAt: null },
          data: { consumedAt: new Date() },
        });
    });
    return {
      message:
        kind === 'VERIFY'
          ? 'Email berhasil diverifikasi. Silakan masuk.'
          : 'Kata sandi diperbarui. Semua sesi lama telah dicabut.',
    };
  }
  async login(req: Request, res: Response, input: unknown) {
    await this.rate(req, 'login');
    const b = object(input);
    if (typeof b.email !== 'string' || typeof b.password !== 'string' || b.password.length > 128)
      fail(422, 'Email dan kata sandi wajib diisi.');
    const user = await this.prisma.user.findFirst({
      where: { email: b.email.toLowerCase().trim(), active: true },
    });
    const valid = passwordMatches(b.password, user?.passwordHash ?? passwordHash('dummy-password'));
    if (!user || !valid) fail(401, 'Email atau kata sandi tidak sesuai.');
    if (req.cookies?.wbs_session) await this.redis.del(`session:${hash(req.cookies.wbs_session)}`);
    const value = token();
    await this.redis.set(`session:${hash(value)}`, `${user.id}:${user.authVersion}`, 'EX', 28800);
    res.cookie('wbs_session', value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 28800000,
      path: '/',
    });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      verified: user.verified,
    };
  }
  async logout(req: Request, res: Response) {
    if (req.cookies?.wbs_session) await this.redis.del(`session:${hash(req.cookies.wbs_session)}`);
    res.clearCookie('wbs_session', { path: '/' });
    return { ok: true };
  }
  private validEmail(value: unknown): value is string {
    return typeof value === 'string' && /^\S+@\S+\.\S+$/.test(value);
  }
  private validPassword(value: unknown): value is string {
    return typeof value === 'string' && value.length >= 12 && value.length <= 128;
  }
}
