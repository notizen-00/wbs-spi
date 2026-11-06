import 'reflect-metadata';
import './config/environment';
import { NestFactory } from '@nestjs/core';
import { HttpException } from '@nestjs/common';
import { Prisma } from './generated/prisma/client';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
export async function createApplication() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn'],
  });
  app.enableShutdownHooks();
  app.useBodyParser('json', { limit: '29mb' });
  app.use(helmet());
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers.origin !== (process.env.APP_ORIGIN || 'http://localhost:3000')) {
        res.status(403).json({ message: 'Origin permintaan tidak diizinkan.' });
        return;
      }
      if (!req.is('application/json')) {
        res.status(415).json({ message: 'Gunakan application/json.' });
        return;
      }
    }
    next();
  });
  app.useGlobalFilters({
    catch(exception: any, host: any) {
      const res = host.switchToHttp().getResponse();
      const status =
        exception instanceof HttpException
          ? exception.getStatus()
          : exception instanceof Prisma.PrismaClientKnownRequestError &&
              ['P2002', 'P2034'].includes(exception.code)
            ? 409
            : 503;
      res.status(status).json(
        exception instanceof HttpException
          ? exception.getResponse()
          : {
              message:
                status === 409
                  ? 'Data telah berubah atau permintaan sudah diproses. Muat ulang data terbaru.'
                  : 'Layanan sementara tidak tersedia. Silakan coba lagi.',
            },
      );
    },
  });
  return app;
}
