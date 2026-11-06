import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
@Injectable()
export class HealthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  async ready() {
    await Promise.all([this.prisma.$queryRaw`SELECT 1`, this.auth.redis.ping()]);
    return { status: 'ready' };
  }
}
