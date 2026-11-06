import { Inject, OnModuleDestroy, HttpException, Optional } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import Redis from 'ioredis';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { notificationChannel } from './notification-publisher';

function sessionCookie(header: string | undefined): string | undefined {
  const item = header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('wbs_session='));
  if (!item) return;
  try {
    return decodeURIComponent(item.slice('wbs_session='.length));
  } catch {
    return;
  }
}
export const NOTIFICATION_SUBSCRIBER = Symbol('NOTIFICATION_SUBSCRIBER');

@WebSocketGateway({
  namespace: '/notifications',
  path: '/api/v1/socket.io',
  transports: ['websocket'],
  maxHttpBufferSize: 4096,
  allowRequest: (req, callback) =>
    callback(null, req.headers.origin === (process.env.APP_ORIGIN || 'http://localhost:3000')),
  cors: { origin: process.env.APP_ORIGIN || 'http://localhost:3000', credentials: true },
})
export class NotificationsGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  @WebSocketServer() private server!: Namespace;
  private readonly subscriber: Redis;
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(NOTIFICATION_SUBSCRIBER) subscriber?: Redis,
  ) {
    this.subscriber =
      subscriber ??
      new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
    this.subscriber.on('error', () => {});
  }
  afterInit(server: Namespace) {
    this.server = server;
    server.use(async (socket, next) => {
      if (socket.handshake.headers.origin !== (process.env.APP_ORIGIN || 'http://localhost:3000')) {
        next(new Error('Origin tidak diizinkan.'));
        return;
      }
      try {
        const token = sessionCookie(socket.handshake.headers.cookie);
        const user = await this.auth.sessionFromToken(token);
        socket.data.userId = user.id;
        socket.data.sessionToken = token;
        next();
      } catch (error) {
        const invalid = error instanceof HttpException && error.getStatus() === 401;
        const failure = new Error(
          invalid
            ? 'Sesi tidak berlaku. Silakan masuk kembali.'
            : 'Pembaruan langsung sementara tidak tersedia.',
        ) as Error & { data: { code: string } };
        failure.data = { code: invalid ? 'SESSION_INVALID' : 'REALTIME_UNAVAILABLE' };
        next(failure);
      }
    });
    this.subscriber.on('ready', () => {
      void this.subscriber
        .subscribe(notificationChannel())
        .then(() => server.emit('notifications:sync'))
        .catch(() => {});
    });
    this.subscriber.on('message', (_channel, message) => {
      void this.onMessage(message);
    });
    void this.subscriber.connect().catch(() => {});
    this.timer = setInterval(() => {
      void this.validateConnections().catch(() => {});
    }, 30000);
    this.timer.unref();
  }
  async handleConnection(socket: Socket) {
    await socket.join(`user:${socket.data.userId}`);
    socket.emit('notifications:ready');
  }
  private async onMessage(message: string) {
    try {
      const payload = JSON.parse(message);
      if (!Array.isArray(payload.ids)) return;
      for (const id of payload.ids.slice(0, 100)) {
        if (typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id)) await this.deliver(id);
      }
    } catch {
      /* Redis is only a wakeup signal; clients recover from the durable REST history. */
    }
  }
  async deliver(id: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification || !this.server) return;
    const sockets = await this.server.in(`user:${notification.userId}`).fetchSockets();
    for (const socket of sockets) {
      try {
        const user = await this.auth.sessionFromToken(socket.data.sessionToken);
        if (user.id !== notification.userId) {
          socket.disconnect(true);
          continue;
        }
        socket.emit('notification:new', {
          id: notification.id,
          title: notification.title,
          subject: notification.subject,
          message: notification.message,
          created_at: notification.createdAt.toISOString(),
        });
      } catch (error) {
        if (error instanceof HttpException && error.getStatus() === 401) socket.disconnect(true);
      }
    }
  }
  private async validateConnections() {
    if (!this.server) return;
    for (const socket of await this.server.fetchSockets()) {
      try {
        const user = await this.auth.sessionFromToken(socket.data.sessionToken);
        if (user.id !== socket.data.userId) socket.disconnect(true);
      } catch (error) {
        if (error instanceof HttpException && error.getStatus() === 401) socket.disconnect(true);
      }
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.subscriber.disconnect();
  }
}
