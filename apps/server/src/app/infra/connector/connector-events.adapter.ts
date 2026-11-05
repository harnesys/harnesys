import { Injectable } from '@harnesys/brix';
import {
  type ConnectorChangeListener,
  ConnectorEventsPort,
} from '../../domain/connector/connector-events.port.ts';

@Injectable()
export class ConnectorEventsAdapter extends ConnectorEventsPort {
  private readonly listeners = new Set<ConnectorChangeListener>();

  subscribe(listener: ConnectorChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(orgId: string): void {
    for (const listener of this.listeners) {
      try {
        listener(orgId);
      } catch {
        // listener errors must not break emit fan-out
      }
    }
  }
}
