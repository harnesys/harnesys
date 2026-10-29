import { Injectable } from '@harnesys/brix';
import {
  type PlanEvent,
  type PlanEventListener,
  PlanEventsPort,
} from '../../domain/plan/plan-events.port.ts';

@Injectable()
export class PlanEventsAdapter extends PlanEventsPort {
  private readonly listeners = new Set<PlanEventListener>();

  subscribe(listener: PlanEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(orgId: string, event: PlanEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(orgId, event);
      } catch {
        // listener errors must not break emit fan-out
      }
    }
  }
}
