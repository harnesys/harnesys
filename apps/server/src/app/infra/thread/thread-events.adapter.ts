import { Injectable } from '@harnesys/brix';
import {
  ThreadEventsPort,
  type ThreadRunEvent,
  type ThreadRunListener,
} from '../../domain/thread/thread-events.port.ts';

@Injectable()
export class ThreadEventsAdapter extends ThreadEventsPort {
  private readonly listeners = new Set<ThreadRunListener>();

  subscribe(listener: ThreadRunListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(orgId: string, event: ThreadRunEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(orgId, event);
      } catch {
        // listener errors must not break emit fan-out
      }
    }
  }
}
