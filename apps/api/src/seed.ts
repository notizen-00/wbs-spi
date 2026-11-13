import './config/environment';
import { PrismaService } from './prisma/prisma.service';
import { passwordHash } from './security';
export async function seed(prisma: PrismaService, password: string) {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Synthetic seed disabled in production');
  if (password.length < 6) throw new Error('Set SEED_PASSWORD to at least 6 characters');
  await prisma.$transaction(async (tx) => {
    for (const [name, email, role] of [
      ['Pelapor Demo', 'pelapor@example.test', 'REPORTER'],
      ['Verifikator/Pemeriksa Demo', 'pengelola@example.test', 'INVESTIGATOR'],
      ['Pejabat Demo', 'pejabat@example.test', 'OFFICIAL'],
      ['Verifikator/Pemeriksa Kedua Demo', 'pemeriksa@example.test', 'INVESTIGATOR'],
      ['Pelaksana Demo', 'pelaksana@example.test', 'EXECUTOR'],
    ])
      await tx.user.upsert({
        where: { email: email! },
        create: {
          name: name!,
          email: email!,
          role: role!,
          verified: true,
          passwordHash: passwordHash(password),
        },
        update: {},
      });
    const manager = await tx.user.findUniqueOrThrow({ where: { email: 'pengelola@example.test' } });
    await tx.intakeMember.upsert({
      where: { userId: manager.id },
      create: { userId: manager.id },
      update: {},
    });
    const official = await tx.user.findUniqueOrThrow({ where: { email: 'pejabat@example.test' } });
    for (const decisionType of ['ASSIGNMENT', 'RESULT', 'CLOSURE', 'REOPEN'])
      if (
        !(await tx.authorityMandate.findFirst({
          where: {
            userId: official.id,
            decisionType,
            validUntil: { gt: new Date() },
            revokedAt: null,
          },
        }))
      )
        await tx.authorityMandate.create({
          data: {
            userId: official.id,
            decisionType,
            validUntil: new Date(Date.now() + 30 * 86400000),
          },
        });
  });
}
async function main() {
  const prisma = new PrismaService();
  try {
    await seed(prisma, process.env.SEED_PASSWORD ?? '');
    console.log('Synthetic accounts, demo intake and 30-day demo mandates created.');
  } finally {
    await prisma.$disconnect();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Seed failed');
    process.exitCode = 1;
  });
