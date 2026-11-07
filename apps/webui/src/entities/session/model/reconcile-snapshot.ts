import type { SessionEvent } from '@harnesys/studio-shared';
import { coalesceStreamDeltas, isToolInputStream } from './coalesce-events';
import { ceilFromEvents, stableEventKey } from './event-keys';

interface StreamSlot {
  identity: string;
  seq: number;
  text: string;
}

interface SlotOverlap {
  rows: number[];
  text: string;
}

const NO_THREAD_SEQ = Number.MAX_SAFE_INTEGER;

function streamSlotOf(event: SessionEvent): StreamSlot | null {
  if (event.type === 'text-delta' || event.type === 'reasoning-delta') {
    if (event.runId === undefined || event.id === undefined || event.seq === undefined) {
      return null;
    }
    return {
      identity: `${event.type}:${event.runId}:${event.id}`,
      seq: event.seq,
      text: event.text,
    };
  }
  if (isToolInputStream(event) && event.runId !== undefined && event.seq !== undefined) {
    return {
      identity: `tool:${event.runId}:${event.toolCallId}`,
      seq: event.seq,
      text: event.delta ?? '',
    };
  }
  return null;
}

function boundaryOf(snapshot: SessionEvent[]): number | undefined {
  let cut: number | undefined;
  for (const event of snapshot) {
    if (event.threadSeq !== undefined && (cut === undefined || event.threadSeq > cut)) {
      cut = event.threadSeq;
    }
  }
  return cut;
}

function overlapOf(snapshot: SessionEvent[], slot: StreamSlot, taken: Set<number>): SlotOverlap {
  const rows: number[] = [];
  let text = '';
  for (const [index, row] of snapshot.entries()) {
    const candidate = streamSlotOf(row);
    if (
      candidate === null ||
      candidate.identity !== slot.identity ||
      candidate.seq < slot.seq ||
      taken.has(index)
    ) {
      continue;
    }
    rows.push(index);
    text += candidate.text;
  }
  return { rows, text };
}

function persistedKeysOf(snapshot: SessionEvent[]): Set<string> {
  const keys = new Set<string>();
  for (const event of snapshot) {
    const key = stableEventKey(event);
    if (key !== undefined) {
      keys.add(key);
    }
  }
  return keys;
}

function byThreadSeq(left: SessionEvent, right: SessionEvent): number {
  return (left.threadSeq ?? NO_THREAD_SEQ) - (right.threadSeq ?? NO_THREAD_SEQ);
}

// The journal snapshot is a complete prefix ordered by threadSeq; a coalesced local
// slot can span its boundary, so the rows it already absorbed are removed from the
// base instead of being concatenated twice.
export function reconcileSnapshot(local: SessionEvent[], snapshot: SessionEvent[]): SessionEvent[] {
  const cut = boundaryOf(snapshot);
  const persisted = persistedKeysOf(snapshot);
  const taken = new Set<number>();
  const kept: SessionEvent[] = [];
  for (const event of local) {
    if (event.threadSeq === undefined) {
      const key = stableEventKey(event);
      if (key === undefined || !persisted.has(key)) {
        kept.push(event);
      }
      continue;
    }
    if (cut !== undefined && event.threadSeq > cut) {
      kept.push(event);
      continue;
    }
    const slot = streamSlotOf(event);
    if (slot === null || cut === undefined) {
      continue;
    }
    const overlap = overlapOf(snapshot, slot, taken);
    if (!slot.text.startsWith(overlap.text)) {
      continue;
    }
    for (const index of overlap.rows) {
      taken.add(index);
    }
    kept.push(event);
  }
  const base = snapshot.filter((_, index) => !taken.has(index));
  return coalesceStreamDeltas([...base, ...kept].sort(byThreadSeq));
}

export function sameThreadLog(left: SessionEvent[], right: SessionEvent[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (const [index, event] of left.entries()) {
    const other = right[index];
    if (event === other) {
      continue;
    }
    if (other === undefined) {
      return false;
    }
    const key = stableEventKey(event);
    if (key === undefined || key !== stableEventKey(other)) {
      return false;
    }
    if (event.threadSeq !== other.threadSeq) {
      return false;
    }
    if ((streamSlotOf(event)?.text ?? '') !== (streamSlotOf(other)?.text ?? '')) {
      return false;
    }
  }
  return true;
}

export function mergeSeqCeil(
  current: Record<string, number>,
  snapshot: SessionEvent[],
): Record<string, number> {
  const merged = { ...current };
  for (const [runId, seq] of Object.entries(ceilFromEvents(snapshot))) {
    merged[runId] = Math.max(merged[runId] ?? 0, seq);
  }
  return merged;
}
