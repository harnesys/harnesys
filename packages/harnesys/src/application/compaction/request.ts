import type { CompactionPassEvent, CompactionSkipReason } from './run.ts';

export interface CompactionRequest {
  requestId: string;
  threadId: string;
  targetRunId: string;
}

export interface CompactionCompleted {
  id: string;
  coveredFrom: number;
  coveredUntil: number;
  tokensBefore: number;
  tokensAfter: number;
}

export type CompactionOutcome =
  | ({ compacted: true } & CompactionCompleted)
  | {
      compacted: false;
      reason?: CompactionSkipReason | 'cancelled';
      error?: string;
      code?: string;
    };

export type CompactionRequestChannel = () => Promise<CompactionRequest | null>;

export type CompactionRequestSettle = (
  requestId: string,
  outcome: CompactionOutcome,
) => Promise<void>;

export async function* teeCompactionOutcome(
  pass: AsyncGenerator<CompactionPassEvent>,
  capture: (outcome: CompactionOutcome) => void,
): AsyncGenerator<CompactionPassEvent> {
  let outcome: CompactionOutcome = { compacted: false };
  for await (const event of pass) {
    if (event.type === 'completed') {
      outcome = {
        compacted: true,
        id: event.message.id,
        coveredFrom: event.message.coveredFrom,
        coveredUntil: event.message.coveredUntil,
        tokensBefore: event.message.stats.tokensBefore,
        tokensAfter: event.message.stats.tokensAfter,
      };
    } else if (event.type === 'skipped') {
      outcome = { compacted: false, reason: event.reason };
    } else if (event.type === 'failed') {
      outcome = { compacted: false, error: event.error };
    }
    yield event;
  }
  capture(outcome);
}
