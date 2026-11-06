import { Body, Controller, Get, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { User } from '@wbs/contracts';
import { AuthService } from './auth.service';
import { CurrentUser, SessionGuard } from './session.guard';
import { CaptchaService } from './captcha.service';
import { object } from '../common/validation';
@Controller('api/v1')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CaptchaService) private readonly captcha: CaptchaService,
  ) {}
  private async challenge(req: Request, body: unknown) {
    await this.auth.rate(req, 'auth-challenge', 30);
    await this.captcha.verify(object(body).captchaToken);
  }
  @Get('me') @UseGuards(SessionGuard) me(@CurrentUser() user: User) {
    return user;
  }
  @Post('auth/register') async register(@Req() req: Request, @Body() body: unknown) {
    await this.challenge(req, body);
    return this.auth.register(req, body);
  }
  @Post('auth/recovery') async recovery(@Req() req: Request, @Body() body: unknown) {
    await this.challenge(req, body);
    return this.auth.recovery(req, body);
  }
  @Post('auth/verify') verify(@Req() req: Request, @Body() body: unknown) {
    return this.auth.consume(req, body, 'VERIFY');
  }
  @Post('auth/reset-password') async reset(@Req() req: Request, @Body() body: unknown) {
    await this.challenge(req, body);
    return this.auth.consume(req, body, 'RESET');
  }
  @Post('auth/login') async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ) {
    await this.challenge(req, body);
    return this.auth.login(req, res, body);
  }
  @Post('auth/logout') logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req, res);
  }
}
