import { Injectable } from '@harnesys/brix';
import type { TerminalWatchEvent } from '@harnesys/studio-shared';
import {
  type TerminalEventListener,
  TerminalEventsPort,
} from '../../domain/terminal/terminal-events.port.ts';

@Injectable()
export class TerminalEventsAdapter extends TerminalEventsPort {
  private readonly listeners = new Set<TerminalEventListener>();

  subscribe(listener: TerminalEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(orgId: string, event: TerminalWatchEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(orgId, event);
      } catch {
        // listener errors must not break emit fan-out
      }
    }
  }
}
