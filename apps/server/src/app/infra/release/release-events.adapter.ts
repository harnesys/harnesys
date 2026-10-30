import { Injectable } from '@harnesys/brix';
import type { EventsWatchReleaseFrame } from '@harnesys/studio-shared';
import { ReleaseEventsPort } from '../../domain/release/release-events.port.ts';
import { trace } from '../../libs/trace.ts';

@Injectable()
export class ReleaseEventsAdapter extends ReleaseEventsPort {
  private readonly listeners = new Set<(frame: EventsWatchReleaseFrame) => void>();

  publish(orgId: string, currentVersion: string, latestVersion: string): void {
    for (const listener of [...this.listeners]) {
      try {
        listener({ orgId, type: 'release-available', currentVersion, latestVersion });
      } catch (err) {
        trace('release-events', 'listener error', { error: String(err) });
      }
    }
  }

  subscribe(listener: (frame: EventsWatchReleaseFrame) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
