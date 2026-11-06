import { Module } from '@nestjs/common';
import { AdminController, SiteController } from './admin.controller';
import { AdminService } from './admin.service';
@Module({ controllers: [AdminController, SiteController], providers: [AdminService] })
export class AdminModule {}
