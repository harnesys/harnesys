import type { SessionEvent } from 'harnesys';
import type { ThreadLogDeletion } from './thread-history-page.port.ts';

export type ThreadRunEvent =
  | { type: 'failed'; threadId: string; runId: string; message: string; at: string }
  | { type: 'cleared'; threadId: string; runId: string }
  | { type: 'parked'; threadId: string; runId: string; source: string }
  | { type: 'finished'; threadId: string; runId: string; status: 'completed' | 'cancelled' }
  | { type: 'events'; threadId: string; events: SessionEvent[] }
  | {
      type: 'log-changed';
      threadId: string;
      deletions: ThreadLogDeletion[];
      serverMax: number;
    };

export type ThreadRunListener = (orgId: string, event: ThreadRunEvent) => void;

export abstract class ThreadEventsPort {
  abstract subscribe(listener: ThreadRunListener): () => void;
  abstract emit(orgId: string, event: ThreadRunEvent): void;
}
