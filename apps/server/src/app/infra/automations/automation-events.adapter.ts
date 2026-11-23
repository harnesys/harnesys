import { Injectable } from '@harnesys/brix';
import {
  type AutomationChangedEvent,
  type AutomationChangedListener,
  AutomationEventsPort,
} from '../../domain/automations/automation-events.port.ts';

@Injectable()
export class AutomationEventsAdapter extends AutomationEventsPort {
  private readonly listeners = new Set<AutomationChangedListener>();

  publish(orgId: string, event: AutomationChangedEvent): void {
    for (const listener of this.listeners) {
      try {
        listener({ orgId, ...event });
      } catch {
        // listener errors must not break publish fan-out
      }
    }
  }

  subscribe(listener: AutomationChangedListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
