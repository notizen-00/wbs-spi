import { Global, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SessionGuard } from './session.guard';
import { CaptchaService } from './captcha.service';
@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, CaptchaService],
  exports: [AuthService, SessionGuard, CaptchaService],
})
export class AuthModule {}
