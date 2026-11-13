import { Inject, Injectable } from '@nestjs/common';
import type { User } from '@wbs/contracts';
import { fileTypeFromBuffer } from 'file-type';
import { PrismaService } from '../prisma/prisma.service';
import { fail, object, text, validId, json } from '../common/validation';
import { passwordHash } from '../security';
import { Prisma } from '../generated/prisma/client';
const staffRoles = ['INVESTIGATOR', 'OFFICIAL', 'EXECUTOR', 'SUPER_ADMIN'];
const staffSelect = {
  authVersion: true,
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  verified: true,
} as const;
export function requireSuperAdmin(user: User) {
  if (user.role !== 'SUPER_ADMIN' || !user.verified)
    fail(403, 'Hanya super admin yang dapat mengelola pengaturan situs.');
}
function expectedVersion(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    fail(422, 'Versi data tidak valid. Muat ulang halaman.');
  return value as number;
}
@Injectable()
export class AdminService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  users(user: User) {
    requireSuperAdmin(user);
    return this.prisma.user.findMany({
      where: { role: { in: staffRoles } },
      orderBy: { name: 'asc' },
      select: staffSelect,
    });
  }
  async createUser(actor: User, input: unknown) {
    requireSuperAdmin(actor);
    const b = object(input);
    const name = text(b.name, 'nama pengguna', 120);
    const email = text(b.email, 'email', 200).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(422, 'Isi email yang valid.');
    if (!staffRoles.includes(b.role)) fail(422, 'Pilih peran petugas yang valid.');
    if (typeof b.password !== 'string' || b.password.length < 6 || b.password.length > 128)
      fail(422, 'Kata sandi harus 6–128 karakter.');
    const hashed = passwordHash(b.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { name, email, role: b.role, passwordHash: hashed, active: true, verified: true },
          select: staffSelect,
        });
        if (created.role === 'INVESTIGATOR')
          await tx.intakeMember.create({ data: { userId: created.id } });
        await tx.adminAudit.create({
          data: {
            actorId: actor.id,
            action: 'CREATE_USER',
            targetId: created.id,
            details: { name, email, role: created.role },
          },
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        fail(409, 'Email sudah digunakan pengguna lain.');
      throw error;
    }
  }
  private async editableStaff(
    tx: Prisma.TransactionClient,
    actor: User,
    id: string,
    version: unknown,
  ) {
    await tx.$queryRaw`SELECT id FROM users WHERE role='SUPER_ADMIN' ORDER BY id FOR UPDATE`;
    const currentActor = await tx.user.findUnique({ where: { id: actor.id } });
    if (!currentActor?.active || !currentActor.verified || currentActor.role !== 'SUPER_ADMIN')
      fail(403, 'Akses super admin diperlukan.');
    await tx.$queryRaw`SELECT id FROM users WHERE id=${id}::uuid FOR UPDATE`;
    const target = await tx.user.findUnique({ where: { id } });
    if (!target || !staffRoles.includes(target.role))
      fail(404, 'Pengguna petugas tidak ditemukan.');
    if (target.authVersion !== expectedVersion(version))
      fail(409, 'Data pengguna telah berubah. Muat ulang sebelum melanjutkan.');
    return target;
  }
  async updateUser(actor: User, id: string, input: unknown) {
    requireSuperAdmin(actor);
    validId(id);
    const b = object(input);
    const name = text(b.name, 'nama pengguna', 120),
      email = text(b.email, 'email', 200).toLowerCase();
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !staffRoles.includes(b.role) ||
      typeof b.active !== 'boolean'
    )
      fail(422, 'Email, peran, atau status pengguna tidak valid.');
    if (
      b.password !== undefined &&
      b.password !== '' &&
      (typeof b.password !== 'string' || b.password.length < 6 || b.password.length > 128)
    )
      fail(422, 'Kata sandi harus 6–128 karakter.');
    const hashed = b.password ? passwordHash(b.password) : undefined;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const old = await this.editableStaff(tx, actor, id, b.expectedVersion);
        if (id === actor.id && (!b.active || b.role !== 'SUPER_ADMIN'))
          fail(409, 'Anda tidak dapat menonaktifkan atau menurunkan peran akun sendiri.');
        if (
          old.role === 'SUPER_ADMIN' &&
          old.active &&
          (!b.active || b.role !== 'SUPER_ADMIN') &&
          (await tx.user.count({ where: { role: 'SUPER_ADMIN', active: true, verified: true } })) <=
            1
        )
          fail(409, 'Minimal satu super admin aktif harus tersedia.');
        if (old.role !== b.role || !b.active) {
          const revokedAt = new Date();
          await tx.caseAccess.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt },
          });
          await tx.assignment.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt },
          });
          await tx.authorityMandate.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt },
          });
        }
        if (b.role === 'INVESTIGATOR')
          await tx.intakeMember.upsert({
            where: { userId: id },
            create: { userId: id, active: b.active },
            update: { active: b.active },
          });
        else await tx.intakeMember.updateMany({ where: { userId: id }, data: { active: false } });
        const result = await tx.user.update({
          where: { id },
          data: {
            name,
            email,
            role: b.role,
            active: b.active,
            ...(hashed ? { passwordHash: hashed } : {}),
            authVersion: { increment: 1 },
          },
          select: staffSelect,
        });
        await tx.adminAudit.create({
          data: {
            actorId: actor.id,
            action: 'UPDATE_USER',
            targetId: id,
            details: { name, email, role: b.role, active: b.active, passwordChanged: !!hashed },
          },
        });
        return result;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        fail(409, 'Email sudah digunakan pengguna lain.');
      throw error;
    }
  }
  async deleteUser(actor: User, id: string, input: unknown) {
    requireSuperAdmin(actor);
    validId(id);
    if (id === actor.id) fail(409, 'Anda tidak dapat menghapus akun sendiri.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const old = await this.editableStaff(tx, actor, id, object(input).expectedVersion);
        if (
          old.role === 'SUPER_ADMIN' &&
          old.active &&
          (await tx.user.count({ where: { role: 'SUPER_ADMIN', active: true, verified: true } })) <=
            1
        )
          fail(409, 'Minimal satu super admin aktif harus tersedia.');
        await tx.intakeMember.deleteMany({ where: { userId: id } });
        await tx.accountToken.deleteMany({ where: { userId: id } });
        await tx.user.delete({ where: { id } });
        await tx.adminAudit.create({
          data: {
            actorId: actor.id,
            action: 'DELETE_USER',
            targetId: id,
            details: { name: old.name, email: old.email, role: old.role },
          },
        });
        return { ok: true };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003')
        fail(
          409,
          'Pengguna terkait riwayat laporan atau audit. Nonaktifkan akun melalui Ubah pengguna agar riwayat tetap tersimpan.',
        );
      throw error;
    }
  }
  async publicStatistics() {
    const rows = await this.prisma.$queryRaw<{ category: string; stage: string; count: bigint }[]>`
      SELECT COALESCE(NULLIF(payload->>'category', ''), 'Lainnya') AS category,
             stage, COUNT(*) AS count
      FROM reports
      WHERE stage <> 'DRAFT'
      GROUP BY 1, stage
    `;
    const categories = new Map<string, number>();
    const monthlyRows = await this.prisma.$queryRaw<{ month: string; count: bigint }[]>`
      WITH submitted AS (
        SELECT COALESCE(
          (SELECT MIN(e.created_at) FROM case_events e WHERE e.report_id = r.id AND e.action = 'SUBMIT'),
          r.created_at
        ) AT TIME ZONE 'Asia/Jakarta' AS submitted_at
        FROM reports r WHERE r.stage <> 'DRAFT'
      ), months AS (
        SELECT generate_series(
          date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta') - interval '5 months',
          date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta'), interval '1 month'
        ) AS month
      )
      SELECT to_char(m.month, 'YYYY-MM') AS month, COUNT(s.submitted_at) AS count
      FROM months m LEFT JOIN submitted s
        ON s.submitted_at >= m.month AND s.submitted_at < m.month + interval '1 month'
      GROUP BY m.month ORDER BY m.month
    `;
    let total = 0;
    let completed = 0;
    let closed = 0;
    for (const row of rows) {
      const count = Number(row.count);
      total += count;
      if (row.stage === 'COMPLETED') completed += count;
      if (row.stage === 'CLOSED') closed += count;
      categories.set(row.category, (categories.get(row.category) ?? 0) + count);
    }
    return {
      total,
      active: total - completed - closed,
      completed,
      closed,
      monthly: monthlyRows.map((row) => ({ month: row.month, count: Number(row.count) })),
      categories: [...categories]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      updatedAt: new Date().toISOString(),
    };
  }
  async publicSettings() {
    const [settings, categories] = await Promise.all([
      this.prisma.siteSettings.findUniqueOrThrow({ where: { id: 'main' } }),
      this.prisma.reportCategory.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { name: true, subcategories: true },
      }),
    ]);
    const { id, version, updatedAt, ...publicValues } = settings;
    return {
      ...publicValues,
      categories: categories.map((row) => row.name),
      subcategories: Object.fromEntries(categories.map((row) => [row.name, row.subcategories])),
    };
  }
  categories(user: User) {
    requireSuperAdmin(user);
    return this.prisma.reportCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }
  private categoryData(input: unknown) {
    const b = object(input);
    if (
      b.subcategories !== undefined &&
      (!Array.isArray(b.subcategories) ||
        b.subcategories.length > 100 ||
        b.subcategories.some(
          (value: unknown) => typeof value !== 'string' || !value.trim() || value.length > 200,
        ))
    )
      fail(422, 'Subkategori harus berupa daftar teks, maksimal 200 karakter per pilihan.');
    if (
      typeof b.active !== 'boolean' ||
      !Number.isInteger(b.sortOrder) ||
      b.sortOrder < 0 ||
      b.sortOrder > 10000
    )
      fail(422, 'Status atau urutan kategori tidak valid.');
    return {
      name: text(b.name, 'nama kategori', 120).replace(/\s+/g, ' '),
      ...(b.subcategories !== undefined
        ? {
            subcategories: [
              ...new Set<string>(b.subcategories.map((value: string) => value.trim())),
            ],
          }
        : {}),
      description: typeof b.description === 'string' ? b.description.trim().slice(0, 1000) : '',
      active: b.active,
      sortOrder: b.sortOrder as number,
    };
  }
  async saveCategory(user: User, input: unknown, id?: string) {
    requireSuperAdmin(user);
    const data = this.categoryData(input);
    if (id) validId(id);
    return this.prisma.$transaction(async (tx) => {
      let old;
      if (id) {
        await tx.$queryRaw`SELECT id FROM report_categories WHERE id=${id}::uuid FOR UPDATE`;
        old = await tx.reportCategory.findUnique({ where: { id } });
        if (!old) fail(404, 'Kategori tidak ditemukan.');
        if (old.version !== expectedVersion(object(input).expectedVersion))
          fail(409, 'Kategori telah berubah. Muat ulang sebelum menyimpan.');
        if (
          old.name !== data.name &&
          (await tx.report.count({ where: { payload: { path: ['category'], equals: old.name } } }))
        )
          fail(
            409,
            'Kategori sudah dipakai laporan. Nama tetap dipertahankan; nonaktifkan atau buat kategori baru.',
          );
      }
      const duplicate = await tx.reportCategory.findFirst({
        where: {
          name: { equals: data.name, mode: 'insensitive' },
          ...(id ? { id: { not: id } } : {}),
        },
      });
      if (duplicate) fail(409, 'Nama kategori sudah digunakan.');
      const category = id
        ? await tx.reportCategory.update({
            where: { id },
            data: { ...data, version: { increment: 1 }, updatedAt: new Date() },
          })
        : await tx.reportCategory.create({ data });
      await tx.adminAudit.create({
        data: {
          actorId: user.id,
          action: id ? 'UPDATE_CATEGORY' : 'CREATE_CATEGORY',
          targetId: category.id,
          details: json(data),
        },
      });
      return category;
    });
  }
  async deleteCategory(user: User, id: string, version: unknown) {
    requireSuperAdmin(user);
    validId(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM report_categories WHERE id=${id}::uuid FOR UPDATE`;
      const category = await tx.reportCategory.findUnique({ where: { id } });
      if (!category) fail(404, 'Kategori tidak ditemukan.');
      if (category.version !== expectedVersion(version))
        fail(409, 'Kategori telah berubah. Muat ulang sebelum menghapus.');
      if (
        await tx.report.count({ where: { payload: { path: ['category'], equals: category.name } } })
      )
        fail(409, 'Kategori sudah digunakan laporan. Gunakan Nonaktifkan agar riwayat tetap utuh.');
      await tx.reportCategory.delete({ where: { id } });
      await tx.adminAudit.create({
        data: {
          actorId: user.id,
          action: 'DELETE_CATEGORY',
          targetId: id,
          details: { name: category.name },
        },
      });
      return { ok: true };
    });
  }
  settings(user: User) {
    requireSuperAdmin(user);
    return this.prisma.siteSettings.findUniqueOrThrow({ where: { id: 'main' } });
  }
  async saveSettings(user: User, input: unknown) {
    requireSuperAdmin(user);
    const b = object(input);
    const optionalText = (key: string, max: number) =>
      typeof b[key] === 'string' && b[key].length <= max
        ? b[key].trim()
        : fail(422, `Kolom ${key} tidak valid.`);
    const data = {
      appName: text(b.appName, 'nama aplikasi', 80),
      institutionName: text(b.institutionName, 'nama institusi', 120),
      tagline: optionalText('tagline', 240),
      helpEmail: optionalText('helpEmail', 200),
      helpPhone: optionalText('helpPhone', 40),
      helpAddress: optionalText('helpAddress', 500),
      logoDataUrl: null as string | null,
    };
    if (data.helpEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.helpEmail))
      fail(422, 'Email bantuan tidak valid.');
    if (b.logoDataUrl !== null) {
      if (typeof b.logoDataUrl !== 'string' || b.logoDataUrl.length > 1400000)
        fail(422, 'Logo maksimal 1 MiB dengan format PNG, JPG, atau WebP.');
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
        b.logoDataUrl,
      );
      if (!match) fail(422, 'Format logo tidak didukung.');
      const bytes = Buffer.from(match[2]!, 'base64');
      let detected;
      try {
        detected = await fileTypeFromBuffer(bytes);
      } catch {
        fail(422, 'Berkas logo rusak.');
      }
      if (
        !bytes.length ||
        bytes.length > 1024 * 1024 ||
        bytes.toString('base64') !== match[2] ||
        detected?.mime !== match[1]
      )
        fail(422, 'Isi berkas logo tidak sesuai format atau terlalu besar.');
      data.logoDataUrl = b.logoDataUrl;
    }
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.siteSettings.updateMany({
        where: { id: 'main', version: expectedVersion(b.expectedVersion) },
        data: { ...data, updatedAt: new Date(), version: { increment: 1 } },
      });
      if (!result.count) fail(409, 'Pengaturan telah berubah. Muat ulang sebelum menyimpan.');
      await tx.adminAudit.create({
        data: {
          actorId: user.id,
          action: 'UPDATE_SITE_SETTINGS',
          targetId: 'main',
          details: json({ ...data, logoDataUrl: data.logoDataUrl ? '[logo updated]' : null }),
        },
      });
      return tx.siteSettings.findUniqueOrThrow({ where: { id: 'main' } });
    });
  }
  audits(user: User) {
    requireSuperAdmin(user);
    return this.prisma.adminAudit.findMany({
      orderBy: { id: 'desc' },
      take: 30,
      select: { action: true, targetId: true, createdAt: true, actor: { select: { name: true } } },
    });
  }
}
