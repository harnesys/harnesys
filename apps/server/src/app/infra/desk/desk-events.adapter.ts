import { Injectable } from '@harnesys/brix';
import type { DeskEvent } from '@harnesys/studio-shared';
import { type DeskEventListener, DeskEventsPort } from '../../domain/desk/desk-events.port.ts';

@Injectable()
export class DeskEventsAdapter extends DeskEventsPort {
  private readonly listeners = new Set<DeskEventListener>();

  subscribe(listener: DeskEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(orgId: string, event: DeskEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(orgId, event);
      } catch {
        // listener errors must not break emit fan-out
      }
    }
  }
}
