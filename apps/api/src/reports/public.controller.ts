import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { CaptchaService } from '../auth/captcha.service';
import { TrackingService } from './tracking.service';
import { fail, object } from '../common/validation';
@Controller('api/v1/public')
export class PublicController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CaptchaService) private readonly captcha: CaptchaService,
    @Inject(TrackingService) private readonly tracking: TrackingService,
  ) {}
  @Get('captcha') configuration() {
    return this.captcha.configuration();
  }
  @Get('demo-guide') demoGuide() {
    if (process.env.NODE_ENV !== 'development') fail(404, 'Halaman tidak ditemukan.');
    return { password: process.env.DEMO_PUBLIC_PASSWORD || null };
  }
  @Post('reports/status') async status(@Req() req: Request, @Body() input: unknown) {
    await this.auth.rate(req, 'tracking', 10);
    const body = object(input);
    await this.captcha.verify(body.captchaToken);
    return this.tracking.status(body.code);
  }
}
