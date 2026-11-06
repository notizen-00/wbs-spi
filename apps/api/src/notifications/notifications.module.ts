import { Module } from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationPublisher } from './notification-publisher';
@Module({
  providers: [NotificationsGateway, NotificationPublisher],
  exports: [NotificationPublisher],
})
export class NotificationsModule {}
