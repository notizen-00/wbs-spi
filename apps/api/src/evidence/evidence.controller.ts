import { Body, Controller, Get, Inject, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { User } from '@wbs/contracts';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { AuthService } from '../auth/auth.service';
import { EvidenceService } from './evidence.service';
@Controller('api/v1')
@UseGuards(SessionGuard)
export class EvidenceController {
  constructor(
    @Inject(EvidenceService) private readonly evidence: EvidenceService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get('reports/:id/evidence') list(@Param('id') id: string, @CurrentUser() user: User) {
    return this.evidence.list(id, user);
  }
  @Post('reports/:id/evidence') async upload(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    await this.auth.rate(req, 'upload', 30);
    return this.evidence.upload(id, user, body);
  }
  @Get('evidence/:id/download') async download(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const file = await this.evidence.download(id, user);
    res.setHeader('Content-Type', file.mime);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.name.replace(/["\r\n]/g, '_')}"`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.bytes);
  }
}
