export type ThreadRunEvent =
  | { type: 'failed'; threadId: string; runId: string; message: string; at: string }
  | { type: 'cleared'; threadId: string; runId: string }
  | { type: 'parked'; threadId: string; runId: string; source: string }
  | { type: 'finished'; threadId: string; runId: string; status: 'completed' | 'cancelled' };

export type ThreadRunListener = (orgId: string, event: ThreadRunEvent) => void;

export abstract class ThreadEventsPort {
  abstract subscribe(listener: ThreadRunListener): () => void;
  abstract emit(orgId: string, event: ThreadRunEvent): void;
}
