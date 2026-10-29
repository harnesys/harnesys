import { Injectable } from '@harnesys/brix';
import type { EventsWatchSourceChangeFrame, SourceWatchEvent } from '@harnesys/studio-shared';
import { SourceWatchEventsPort } from '../../domain/source/source-watch-events.port.ts';
import { trace } from '../../libs/trace.ts';

@Injectable()
export class SourceWatchEventsAdapter extends SourceWatchEventsPort {
  private readonly listeners = new Set<(frame: EventsWatchSourceChangeFrame) => void>();

  publish(orgId: string, sourceId: string, event: SourceWatchEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener({ orgId, sourceId, event });
      } catch (err) {
        trace('source-watch-events', 'listener error', { error: String(err) });
      }
    }
  }

  subscribe(listener: (frame: EventsWatchSourceChangeFrame) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
