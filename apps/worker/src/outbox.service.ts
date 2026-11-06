import { Inject, Injectable, Optional } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { PrismaService } from '../../api/src/prisma/prisma.service';
import { object } from '../../api/src/common/validation';

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');
type MailTransport = Pick<ReturnType<typeof nodemailer.createTransport>, 'sendMail'>;
@Injectable()
export class OutboxService {
  private readonly transport: MailTransport;
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(MAIL_TRANSPORT) transport?: MailTransport,
  ) {
    this.transport =
      transport ??
      nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'localhost',
        port: Number(process.env.SMTP_PORT || 1025),
        secure: process.env.SMTP_SECURE === 'true',
        ...(process.env.SMTP_USER
          ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }
          : {}),
      });
  }
  async tick() {
    await this.prisma.$transaction(async (tx) => {
      const [candidate] = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM outbox_events WHERE processed_at IS NULL AND attempts<10 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!candidate) return;
      const event = await tx.outboxEvent.findUniqueOrThrow({
        where: { id: candidate.id },
        include: { recipient: { select: { email: true } } },
      });
      const payload = object(event.payload);
      const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
      const text =
        event.kind === 'VERIFY'
          ? `Verifikasi email Anda: ${origin}/?verify=${payload.token}`
          : event.kind === 'RESET'
            ? `Atur ulang kata sandi Anda: ${origin}/?reset=${payload.token}`
            : 'Ada pembaruan di portal WBS. Masuk ke aplikasi untuk melihat informasi.';
      try {
        await this.transport.sendMail({
          from: process.env.SMTP_FROM || 'WBS <noreply@wbs.local>',
          to: event.recipient.email,
          subject:
            event.kind === 'VERIFY'
              ? 'Verifikasi email WBS'
              : event.kind === 'RESET'
                ? 'Pemulihan akun WBS'
                : 'Pembaruan WBS',
          text,
          messageId: `<${event.id}@wbs.local>`,
        });
      } catch {
        await tx.outboxEvent.update({
          where: { id: event.id },
          data: { attempts: { increment: 1 } },
        });
        return;
      }
      await tx.notification.upsert({
        where: { id: event.id },
        create: {
          id: event.id,
          userId: event.recipientId,
          message: 'Ada pembaruan di portal WBS.',
        },
        update: {},
      });
      await tx.outboxEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date(), payload: {} },
      });
    });
  }
}
