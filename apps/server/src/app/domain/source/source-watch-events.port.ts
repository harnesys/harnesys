import type { EventsWatchSourceChangeFrame, SourceWatchEvent } from '@harnesys/studio-shared';

export abstract class SourceWatchEventsPort {
  abstract publish(orgId: string, sourceId: string, event: SourceWatchEvent): void;
  abstract subscribe(listener: (frame: EventsWatchSourceChangeFrame) => void): () => void;
}
