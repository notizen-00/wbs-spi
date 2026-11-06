import { Controller, Get, Inject } from '@nestjs/common';
import { CaptchaService } from '../auth/captcha.service';
@Controller('api/v1/public')
export class PublicController {
  constructor(@Inject(CaptchaService) private readonly captcha: CaptchaService) {}
  @Get('captcha') configuration() {
    return this.captcha.configuration();
  }
}
