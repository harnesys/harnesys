import { Injectable, type ModuleDestroyHook, type ModuleInitHook } from '@harnesys/brix';
import { EventBusPort } from '../../domain/events/event-bus.port.ts';
import type { ThreadRunEvent } from '../../domain/thread/thread-events.port.ts';
import { ThreadEventsPort } from '../../domain/thread/thread-events.port.ts';

@Injectable()
export class ThreadRunEventsBridge implements ModuleInitHook, ModuleDestroyHook {
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly threadEvents: ThreadEventsPort,
    private readonly bus: EventBusPort,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.threadEvents.subscribe((orgId, event) => this.publish(orgId, event));
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private publish(orgId: string, event: ThreadRunEvent): void {
    switch (event.type) {
      case 'events':
        return;
      case 'failed':
        this.bus.publish(orgId, 'run.failed', {
          orgId,
          threadId: event.threadId,
          runId: event.runId,
          message: event.message,
          at: event.at,
        });
        return;
      case 'finished':
        this.bus.publish(orgId, 'run.finished', {
          orgId,
          threadId: event.threadId,
          runId: event.runId,
          status: event.status,
        });
        return;
      case 'parked':
        this.bus.publish(orgId, 'run.parked', {
          orgId,
          threadId: event.threadId,
          runId: event.runId,
          source: event.source,
        });
        return;
      case 'cleared':
        this.bus.publish(orgId, 'run.cleared', {
          orgId,
          threadId: event.threadId,
          runId: event.runId,
        });
        return;
    }
  }
}
