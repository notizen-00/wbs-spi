import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@wbs/contracts';
import type { Request } from 'express';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { AuthService } from '../auth/auth.service';
import { ReportsService } from './reports.service';
import { CaptchaService } from '../auth/captcha.service';
import { object } from '../common/validation';
@Controller('api/v1')
@UseGuards(SessionGuard)
export class ReportsController {
  constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CaptchaService) private readonly captcha: CaptchaService,
  ) {}
  @Get('reports') list(@CurrentUser() user: User, @Query() query: Record<string, string>) {
    return query.paginated === 'true'
      ? this.reports.listPage(user, query)
      : this.reports.list(user, query.page, query.q);
  }
  @Post('reports/drafts') async create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    await this.auth.rate(req, 'draft', 100);
    return this.reports.create(user, body);
  }
  @Get('reports/:id') detail(@CurrentUser() user: User, @Param('id') id: string) {
    return this.reports.detail(id, user);
  }
  @Patch('reports/:id/draft') save(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.reports.save(id, user, body);
  }
  @Post('reports/:id/commands') async command(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Headers('idempotency-key') key?: string,
  ) {
    if (object(body).action === 'SUBMIT') {
      await this.auth.rate(req, 'report-submission', 20);
      await this.captcha.verify(object(body).captchaToken);
    }
    return this.reports.command(id, user, body, key ?? '');
  }
  @Get('reports/:id/workspace') workspace(@CurrentUser() user: User, @Param('id') id: string) {
    return this.reports.workspace(id, user);
  }
  @Get('notifications') notifications(@CurrentUser() user: User) {
    return this.reports.notifications(user);
  }
  @Get('notifications/summary') notificationSummary(@CurrentUser() user: User) {
    return this.reports.notificationSummary(user);
  }
  @Patch('notifications/read-all') async readAll(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    await this.auth.rate(req, 'read-notifications', 120);
    return this.reports.readAllNotifications(user, object(body).before);
  }
  @Patch('notifications/:id/read') async read(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    await this.auth.rate(req, 'read-notifications', 120);
    return this.reports.readNotification(user, id);
  }
}
