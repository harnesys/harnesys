import type { SessionEvent } from '@harnesys/studio-shared';
import { coalesceStreamDeltas, isToolInputStream } from './coalesce-events';
import { ceilFromEvents, stableEventKey } from './event-keys';

export interface StreamSlot {
  identity: string;
  seq: number;
  text: string;
}

interface SlotOverlap {
  rows: number[];
  text: string;
}

interface SlotRow {
  index: number;
  seq: number;
  text: string;
}

const NO_THREAD_SEQ = Number.MAX_SAFE_INTEGER;

export function streamSlotOf(event: SessionEvent): StreamSlot | null {
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

function slotRowsOf(snapshot: SessionEvent[]): Map<string, SlotRow[]> {
  const rows = new Map<string, SlotRow[]>();
  for (const [index, event] of snapshot.entries()) {
    const slot = streamSlotOf(event);
    if (slot === null) {
      continue;
    }
    const list = rows.get(slot.identity);
    const row = { index, seq: slot.seq, text: slot.text };
    if (list === undefined) {
      rows.set(slot.identity, [row]);
    } else {
      list.push(row);
    }
  }
  return rows;
}

function overlapOf(rows: readonly SlotRow[], slot: StreamSlot, taken: Set<number>): SlotOverlap {
  const indexes: number[] = [];
  let text = '';
  for (const row of rows) {
    if (row.seq < slot.seq || taken.has(row.index)) {
      continue;
    }
    indexes.push(row.index);
    text += row.text;
  }
  return { rows: indexes, text };
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

export interface ReconcileOptions {
  windowStart?: number;
}

function absorbRowsOf(
  slotRows: Map<string, SlotRow[]>,
  event: SessionEvent,
  taken: Set<number>,
): void {
  const slot = streamSlotOf(event);
  if (slot === null) {
    return;
  }
  const rows = slotRows.get(slot.identity);
  if (rows === undefined || rows.length === 0) {
    return;
  }
  let rowsText = '';
  for (const row of rows) {
    rowsText += row.text;
  }
  if (rowsText.length > 0 && slot.text.endsWith(rowsText)) {
    for (const row of rows) {
      taken.add(row.index);
    }
    return;
  }
  const prefix = overlapOf(rows, slot, taken);
  if (prefix.text.length === 0 || !slot.text.startsWith(prefix.text)) {
    return;
  }
  for (const index of prefix.rows) {
    taken.add(index);
  }
}

// The snapshot is a complete prefix ordered by threadSeq; a coalesced local
// slot can span its boundary, so the rows it already absorbed are removed from the
// base instead of being concatenated twice. With windowStart the snapshot is a delta
// window above the client cursor, so local rows below it are kept as they are.
export function reconcileSnapshot(
  local: SessionEvent[],
  snapshot: SessionEvent[],
  options?: ReconcileOptions,
): SessionEvent[] {
  const windowStart = options?.windowStart;
  const cut = boundaryOf(snapshot);
  const persisted = persistedKeysOf(snapshot);
  const slotRows = slotRowsOf(snapshot);
  const taken = new Set<number>();
  const kept: SessionEvent[] = [];
  for (const event of local) {
    const threadSeq = event.threadSeq;
    if (threadSeq === undefined) {
      const key = stableEventKey(event);
      if (key === undefined || !persisted.has(key)) {
        kept.push(event);
      }
      continue;
    }
    if (windowStart !== undefined && threadSeq < windowStart) {
      absorbRowsOf(slotRows, event, taken);
      kept.push(event);
      continue;
    }
    const ahead = cut === undefined ? windowStart !== undefined : threadSeq > cut;
    if (ahead) {
      kept.push(event);
      continue;
    }
    const slot = streamSlotOf(event);
    if (slot === null || cut === undefined) {
      continue;
    }
    const overlap = overlapOf(slotRows.get(slot.identity) ?? [], slot, taken);
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
