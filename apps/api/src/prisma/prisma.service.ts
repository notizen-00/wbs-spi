import '../config/environment';
import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../generated/prisma/client';

export const PRISMA_ADAPTER = Symbol('PRISMA_ADAPTER');
export type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Optional() @Inject(PRISMA_ADAPTER) adapter?: Prisma.PrismaClientOptions['adapter']) {
    super({
      adapter: adapter ?? new PrismaPg({ connectionString: process.env.DATABASE_URL }),
      transactionOptions: { maxWait: 10000, timeout: 90000 },
    });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
