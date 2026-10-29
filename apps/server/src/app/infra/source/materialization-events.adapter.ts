import { Injectable } from '@harnesys/brix';
import {
  type MaterializationChangedEvent,
  type MaterializationChangedListener,
  MaterializationEventsPort,
} from '../../domain/source/materialization-events.port.ts';

@Injectable()
export class MaterializationEventsAdapter extends MaterializationEventsPort {
  private readonly listeners = new Set<MaterializationChangedListener>();

  subscribe(listener: MaterializationChangedListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: MaterializationChangedEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // listener errors must not break emit fan-out
      }
    }
  }
}
