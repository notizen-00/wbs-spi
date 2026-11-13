import './config/environment';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { PrismaService } from './prisma/prisma.service';
import { passwordHash } from './security';

export async function createSuperAdmin(
  prisma: PrismaService,
  email: string,
  password: string,
  name = 'Super Admin',
) {
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 200 ||
    password.length < 6 ||
    password.length > 128 ||
    !name.trim() ||
    name.length > 120
  )
    throw new Error('Email, nama, dan password minimal 6 karakter wajib valid.');
  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (existing) {
      if (existing.role !== 'SUPER_ADMIN')
        throw new Error('Email sudah digunakan akun lain; role tidak diubah otomatis.');
      if (!existing.active) throw new Error('Akun super admin tidak aktif.');
      return { id: existing.id, email: existing.email, created: false };
    }
    const user = await tx.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash: passwordHash(password),
        role: 'SUPER_ADMIN',
        verified: true,
      },
    });
    await tx.adminAudit.create({
      data: {
        actorId: user.id,
        action: 'CREATE_SUPER_ADMIN',
        targetId: user.id,
        details: { email: user.email },
      },
    });
    return { id: user.id, email: user.email, created: true };
  });
}
async function main() {
  const development = process.env.NODE_ENV !== 'production';
  const email = process.env.SUPER_ADMIN_EMAIL || (development ? 'superadmin@example.test' : '');
  const generated = !process.env.SUPER_ADMIN_PASSWORD;
  if (!development && (!email || generated))
    throw new Error('Production memerlukan SUPER_ADMIN_EMAIL dan SUPER_ADMIN_PASSWORD.');
  const password = process.env.SUPER_ADMIN_PASSWORD || randomBytes(24).toString('base64url');
  const prisma = new PrismaService();
  try {
    const user = await createSuperAdmin(
      prisma,
      email,
      password,
      process.env.SUPER_ADMIN_NAME || 'Super Admin',
    );
    console.log(`Super admin ${user.created ? 'dibuat' : 'sudah tersedia'}: ${user.email}`);
    if (user.created && generated) {
      const directory = resolve(process.cwd(), '.local');
      mkdirSync(directory, { recursive: true });
      const destination = resolve(directory, 'super-admin-credentials.txt');
      writeFileSync(
        destination,
        `Email: ${user.email}\nPassword: ${password}\nLogin: http://localhost:3000/login\n`,
        { mode: 0o600 },
      );
      console.log('Password acak tersimpan di .local/super-admin-credentials.txt (diabaikan Git).');
    }
    if (!user.created) console.log('Password akun yang sudah ada tidak diubah.');
  } finally {
    await prisma.$disconnect();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Pembuatan super admin gagal.');
    process.exitCode = 1;
  });
