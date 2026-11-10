import { Module } from '@harnesys/brix';
import { EventBusPort } from '../../domain/events/event-bus.port.ts';
import { AppsModule } from '../apps/apps.module.ts';
import { ThreadModule } from '../thread/thread.module.ts';
import { AccountEventsBridge } from './account-events-bridge.ts';
import { InProcessEventBus } from './host-event-bus.adapter.ts';
import { ThreadRunEventsBridge } from './thread-run-events-bridge.ts';

@Module({
  imports: [AppsModule, ThreadModule],
  providers: [
    { provide: EventBusPort, useClass: InProcessEventBus },
    ThreadRunEventsBridge,
    AccountEventsBridge,
  ],
  exports: [EventBusPort],
})
export class EventsModule {}
