import { Module } from '@harnesys/brix';
import { ReleaseEventsPort } from '../../domain/release/release-events.port.ts';
import { ReleaseEventsAdapter } from './release-events.adapter.ts';

@Module({
  global: true,
  providers: [{ provide: ReleaseEventsPort, useClass: ReleaseEventsAdapter }],
  exports: [ReleaseEventsPort],
})
export class ReleaseModule {}
