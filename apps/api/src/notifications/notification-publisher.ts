import '../config/environment';
import { Injectable, OnModuleDestroy, Logger, Inject, Optional } from '@nestjs/common';
import Redis from 'ioredis';

export function notificationChannel() {
  return process.env.NOTIFICATION_REDIS_CHANNEL || 'wbs:notifications:v1';
}
export const NOTIFICATION_PUBLISHER = Symbol('NOTIFICATION_PUBLISHER');

@Injectable()
export class NotificationPublisher implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly logger = new Logger(NotificationPublisher.name);
  constructor(@Optional() @Inject(NOTIFICATION_PUBLISHER) redis?: Redis) {
    this.redis =
      redis ??
      new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
    this.redis.on('error', () => {});
  }
  async publish(ids: readonly string[]) {
    if (!ids.length) return;
    try {
      for (let offset = 0; offset < ids.length; offset += 100)
        await this.redis.publish(
          notificationChannel(),
          JSON.stringify({ ids: ids.slice(offset, offset + 100) }),
        );
    } catch {
      this.logger.warn('Realtime unavailable; notifications remain available in the database.');
    }
  }
  onModuleDestroy() {
    this.redis.disconnect();
  }
}
