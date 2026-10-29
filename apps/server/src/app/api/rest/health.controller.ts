import { Controller, Get, Public } from '@harnesys/brix';

export interface HealthResponse {
  status: string;
}

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): HealthResponse {
    return { status: 'ok' };
  }
}
