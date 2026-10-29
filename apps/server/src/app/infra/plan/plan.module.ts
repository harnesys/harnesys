import { Module } from '@harnesys/brix';
import { PlanEventsPort } from '../../domain/plan/plan-events.port.ts';
import { PlanEventsAdapter } from './plan-events.adapter.ts';

@Module({
  providers: [{ provide: PlanEventsPort, useClass: PlanEventsAdapter }],
  exports: [PlanEventsPort],
})
export class PlanModule {}
