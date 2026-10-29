import { Injectable } from '@harnesys/brix';
import {
  type IssueDomainEvent,
  type IssueDomainEventListener,
  IssueEventsPort,
} from '../../domain/issue/issue-events.port.ts';

@Injectable()
export class IssueEventsAdapter extends IssueEventsPort {
  private readonly listeners = new Set<IssueDomainEventListener>();

  subscribe(listener: IssueDomainEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(orgId: string, event: IssueDomainEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(orgId, event);
      } catch {
        // listener errors must not break emit fan-out
      }
    }
  }
}
