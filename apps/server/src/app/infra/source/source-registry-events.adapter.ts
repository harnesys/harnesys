import { Injectable } from '@harnesys/brix';
import {
  type SourceRegistryChangedEvent,
  type SourceRegistryChangedListener,
  SourceRegistryEventsPort,
} from '../../domain/source/source-registry-events.port.ts';

@Injectable()
export class SourceRegistryEventsAdapter extends SourceRegistryEventsPort {
  private readonly listeners = new Set<SourceRegistryChangedListener>();

  subscribe(listener: SourceRegistryChangedListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: SourceRegistryChangedEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // listener errors must not break emit fan-out
      }
    }
  }
}
