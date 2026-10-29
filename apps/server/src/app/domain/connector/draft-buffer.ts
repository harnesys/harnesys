import { DRAFT_HEARTBEAT_MS, DRAFT_SPLIT_AT } from './constants.ts';

export interface DraftTick {
  send: boolean;
  text: string;
  split: boolean;
}

export function nextDraftTick(input: {
  pending: string;
  lastSent: string;
  lastSentAt: number;
  now: number;
  inFlight: boolean;
  coalesceMs: number;
}): DraftTick {
  const { pending, lastSent, lastSentAt, now, inFlight, coalesceMs } = input;
  if (inFlight) {
    return { send: false, text: pending, split: false };
  }

  const split = pending.length >= DRAFT_SPLIT_AT;
  const elapsed = now - lastSentAt;

  if (pending === lastSent) {
    if (elapsed < DRAFT_HEARTBEAT_MS) {
      return { send: false, text: pending, split };
    }
    return { send: true, text: pending, split };
  }

  if (elapsed < coalesceMs) {
    return { send: false, text: pending, split };
  }

  return { send: true, text: pending, split };
}

export function takeDraftChunk(text: string): { chunk: string; rest: string } {
  return {
    chunk: text.slice(0, DRAFT_SPLIT_AT),
    rest: text.slice(DRAFT_SPLIT_AT),
  };
}
