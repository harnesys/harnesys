import type { SessionEvent } from 'harnesys';

export interface HistorySegmentSpan {
  start: number;
  end: number;
}

export function segmentIndexFromSeq(
  events: SessionEvent[],
  segments: HistorySegmentSpan[],
  fromSeq: number,
): number | undefined {
  const eventIndex = events.findIndex(
    (event) => typeof event.threadSeq === 'number' && event.threadSeq >= fromSeq,
  );
  if (eventIndex < 0) {
    return undefined;
  }
  const segmentIndex = segments.findIndex(
    (segment) => segment.start <= eventIndex && eventIndex < segment.end,
  );
  return segmentIndex >= 0 ? segmentIndex : undefined;
}

export interface SeqAnchorFields {
  historyFromRunId?: string;
  historyFromSeq?: number;
}

export function withRunScopedSeqAnchor<T extends SeqAnchorFields>(
  events: SessionEvent[],
  opts: T,
): T {
  const seq = opts.historyFromSeq;
  const runId = opts.historyFromRunId;
  if (seq === undefined || runId === undefined) {
    return opts;
  }
  const runStart = firstThreadSeqOfRun(events, runId);
  if (runStart === undefined || runStart >= seq) {
    return opts;
  }
  return { ...opts, historyFromSeq: runStart };
}

export function droppedByAnchor(
  anchor: { index: number; cursor?: number | null },
  event: SessionEvent | undefined,
  index: number,
): boolean {
  if (anchor.index < 0 || !event) {
    return false;
  }
  if (anchor.cursor === undefined) {
    return index < anchor.index;
  }
  if (anchor.cursor === null || typeof event.threadSeq !== 'number') {
    return false;
  }
  return event.threadSeq <= anchor.cursor;
}

function firstThreadSeqOfRun(events: SessionEvent[], runId: string): number | undefined {
  for (const event of events) {
    if (event.runId === runId && typeof event.threadSeq === 'number') {
      return event.threadSeq;
    }
  }
  return undefined;
}

export function beforeSeqAnchor(event: SessionEvent, historyFromSeq: number | undefined): boolean {
  if (historyFromSeq === undefined) {
    return false;
  }
  const seq = event.threadSeq;
  return typeof seq === 'number' && seq < historyFromSeq;
}
