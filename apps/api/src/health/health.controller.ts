import { Controller, Get, Inject } from '@nestjs/common';
import { HealthService } from './health.service';
@Controller('api/v1')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}
  @Get('health') health() {
    return { status: 'ok' };
  }
  @Get('ready') ready() {
    return this.healthService.ready();
  }
}
