import { Inject, Injectable } from '@nestjs/common';
import type { User } from '@wbs/contracts';
import { fileTypeFromBuffer } from 'file-type';
import { PrismaService } from '../prisma/prisma.service';
import { fail, object, text, validId, json } from '../common/validation';
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
  async publicSettings() {
    const [settings, categories] = await Promise.all([
      this.prisma.siteSettings.findUniqueOrThrow({ where: { id: 'main' } }),
      this.prisma.reportCategory.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { name: true },
      }),
    ]);
    const { id, version, updatedAt, ...publicValues } = settings;
    return { ...publicValues, categories: categories.map((row) => row.name) };
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
      typeof b.active !== 'boolean' ||
      !Number.isInteger(b.sortOrder) ||
      b.sortOrder < 0 ||
      b.sortOrder > 10000
    )
      fail(422, 'Status atau urutan kategori tidak valid.');
    return {
      name: text(b.name, 'nama kategori', 120).replace(/\s+/g, ' '),
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
