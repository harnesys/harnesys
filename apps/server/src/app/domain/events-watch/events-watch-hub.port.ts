import type { EventsWatchFrame } from './events-watch-frame.ts';

export interface EventsWatchSubscription {
  drain(): EventsWatchFrame[];
  close(): void;
}

export abstract class EventsWatchHubPort {
  abstract publish(orgId: string, topic: string, data: unknown): void;
  abstract subscribe(orgId: string, fromSeq?: number, onPush?: () => void): EventsWatchSubscription;
}
