import { Injectable } from '@harnesys/brix';
import {
  type FleetChangedListener,
  FleetEventsPort,
} from '../../domain/fleet/fleet-events.port.ts';

@Injectable()
export class FleetEventsAdapter extends FleetEventsPort {
  private readonly listeners = new Set<FleetChangedListener>();

  subscribe(listener: FleetChangedListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(orgId: string): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(orgId);
      } catch {
        // listener errors must not break emit fan-out
      }
    }
  }
}
