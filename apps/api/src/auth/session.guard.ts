import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  createParamDecorator,
} from '@nestjs/common';
import type { User } from '@wbs/contracts';
import type { Request } from 'express';
import { AuthService } from './auth.service';
export type AuthenticatedRequest = Request & { user: User };
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    req.user = await this.auth.session(req);
    return true;
  }
}
