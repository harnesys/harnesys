import { Module } from '@harnesys/brix';
import { DeskEventsPort } from '../../domain/desk/desk-events.port.ts';
import { DeskEventsAdapter } from './desk-events.adapter.ts';

@Module({
  providers: [{ provide: DeskEventsPort, useClass: DeskEventsAdapter }],
  exports: [DeskEventsPort],
})
export class DeskModule {}
