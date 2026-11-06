import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { CaptchaService } from '../auth/captcha.service';
import { TrackingService } from './tracking.service';
import { object } from '../common/validation';
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
  @Post('reports/status') async status(@Req() req: Request, @Body() input: unknown) {
    await this.auth.rate(req, 'tracking', 10);
    const body = object(input);
    await this.captcha.verify(body.captchaToken);
    return this.tracking.status(body.code);
  }
}
