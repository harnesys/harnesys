import type { EventsWatchReleaseFrame } from '@harnesys/studio-shared';

export abstract class ReleaseEventsPort {
  abstract publish(orgId: string, currentVersion: string, latestVersion: string): void;
  abstract subscribe(listener: (frame: EventsWatchReleaseFrame) => void): () => void;
}
