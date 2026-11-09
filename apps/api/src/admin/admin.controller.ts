import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '@wbs/contracts';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { AuthService } from '../auth/auth.service';
import { object } from '../common/validation';
import { AdminService, requireSuperAdmin } from './admin.service';
@Controller('api/v1/admin')
@UseGuards(SessionGuard)
export class AdminController {
  constructor(
    @Inject(AdminService) private readonly admin: AdminService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private async mutation(req: Request, user: User) {
    requireSuperAdmin(user);
    await this.auth.rate(req, 'admin-mutation', 60);
  }
  @Get('categories') categories(@CurrentUser() user: User) {
    return this.admin.categories(user);
  }
  @Post('categories') async create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    await this.mutation(req, user);
    return this.admin.saveCategory(user, body);
  }
  @Patch('categories/:id') async update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.mutation(req, user);
    return this.admin.saveCategory(user, body, id);
  }
  @Delete('categories/:id') async remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.mutation(req, user);
    return this.admin.deleteCategory(user, id, object(body).expectedVersion);
  }
  @Get('settings') settings(@CurrentUser() user: User) {
    return this.admin.settings(user);
  }
  @Patch('settings') async save(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    await this.mutation(req, user);
    return this.admin.saveSettings(user, body);
  }
  @Get('audits') audits(@CurrentUser() user: User) {
    return this.admin.audits(user);
  }
}
@Controller('api/v1/public')
export class SiteController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}
  @Get('statistics') statistics() {
    return this.admin.publicStatistics();
  }
  @Get('settings') settings() {
    return this.admin.publicSettings();
  }
}
