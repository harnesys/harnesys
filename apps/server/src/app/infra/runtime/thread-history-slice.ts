import type { SessionEvent } from 'harnesys';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { historyLastOf, historyModeOf } from '../../domain/thread/thread-policy.ts';

export type ThreadSliceMode = 'full' | 'last' | 'none';

export interface ThreadSliceOpts {
  mode: ThreadSliceMode;
  historyLast?: number;
  historyFromRunId?: string;
  activeRunId?: string;
  beforeThreadSeq?: number;
}

export interface ThreadHistorySegment {
  start: number;
  end: number;
  runId: string | null;
}

export function threadHistorySegments(events: SessionEvent[]): ThreadHistorySegment[] {
  const segments: ThreadHistorySegment[] = [];
  let index = 0;
  while (index < events.length) {
    const event = events[index];
    const runId = event?.runId ?? null;
    if (runId === null) {
      segments.push({ start: index, end: index + 1, runId: null });
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < events.length && (events[end]?.runId ?? null) === runId) {
      end += 1;
    }
    segments.push({ start: index, end, runId });
    index = end;
  }
  return segments;
}

export function threadSliceOptsOf(
  thread: ThreadRecord,
  activeRunId: string | null,
): ThreadSliceOpts {
  const mode = historyModeOf(thread.policy, thread.kind);
  return {
    mode,
    historyLast: historyLastOf(thread.policy),
    ...(thread.policy.historyFromRunId ? { historyFromRunId: thread.policy.historyFromRunId } : {}),
    ...(activeRunId ? { activeRunId } : {}),
    ...(thread.kind === 'group' ? { beforeThreadSeq: thread.lastThreadSeq + 1 } : {}),
  };
}

export function sliceThreadHistory(events: SessionEvent[], opts: ThreadSliceOpts): SessionEvent[] {
  const segments = threadHistorySegments(events);
  if (segments.length === 0) {
    return [];
  }
  const { excludedRuns, markerEventIndex, markerSegmentIndex } = sliceExclusions(events, segments);
  const anchorIndex = newestAnchorIndex(events);
  const kept = new Set<number>(baseSegments(events, segments, opts));
  for (const index of segmentIndexesOfRun(segments, opts.activeRunId ?? null)) {
    kept.add(index);
  }
  coKeepMarkerRuns(segments, kept, excludedRuns, markerSegmentIndex);
  const forced = forcedEventIndexes(segments, kept, excludedRuns, markerEventIndex);
  if (anchorIndex >= 0) {
    forced.add(anchorIndex);
  }
  const indexes = segmentEventIndexes(segments, kept, anchorIndex, opts);
  for (const index of forced) {
    indexes.add(index);
  }
  return eventsAtIndexes(events, indexes, opts.beforeThreadSeq);
}

function segmentEventIndexes(
  segments: ThreadHistorySegment[],
  kept: Set<number>,
  anchorIndex: number,
  opts: ThreadSliceOpts,
): Set<number> {
  const cut = anchorIndex >= 0 ? anchorIndex : 0;
  const indexes = new Set<number>();
  for (const index of kept) {
    const segment = segments[index];
    if (!segment) {
      continue;
    }
    const exempt = segment.runId !== null && segment.runId === opts.activeRunId;
    for (let i = exempt ? segment.start : Math.max(segment.start, cut); i < segment.end; i += 1) {
      indexes.add(i);
    }
  }
  return indexes;
}

function eventsAtIndexes(
  events: SessionEvent[],
  indexes: Set<number>,
  beforeThreadSeq: number | undefined,
): SessionEvent[] {
  const out: SessionEvent[] = [];
  for (const index of [...indexes].sort((a, b) => a - b)) {
    const event = events[index];
    if (event && eventInWindow(event, beforeThreadSeq)) {
      out.push(event);
    }
  }
  return out;
}

function baseSegments(
  events: SessionEvent[],
  segments: ThreadHistorySegment[],
  opts: ThreadSliceOpts,
): number[] {
  const universe = windowSegmentIndexes(events, segments, opts.beforeThreadSeq);
  const visible = new Set(universe);
  const hinted = opts.historyFromRunId
    ? segmentIndexesOfRun(segments, opts.historyFromRunId).filter((index) => visible.has(index))
    : [];
  if (hinted.length > 0) {
    const from = Math.min(...hinted);
    return universe.filter((index) => index >= from);
  }
  if (opts.mode === 'last') {
    const count = Math.max(0, Math.floor(opts.historyLast ?? 0));
    return universe.slice(Math.max(0, universe.length - count));
  }
  if (opts.mode === 'full') {
    return universe;
  }
  return [];
}

function windowSegmentIndexes(
  events: SessionEvent[],
  segments: ThreadHistorySegment[],
  beforeThreadSeq: number | undefined,
): number[] {
  const out: number[] = [];
  segments.forEach((segment, index) => {
    if (segmentInWindow(events, segment, beforeThreadSeq)) {
      out.push(index);
    }
  });
  return out;
}

function segmentInWindow(
  events: SessionEvent[],
  segment: ThreadHistorySegment,
  beforeThreadSeq: number | undefined,
): boolean {
  if (beforeThreadSeq === undefined) {
    return true;
  }
  for (let index = segment.start; index < segment.end; index += 1) {
    if (!eventInWindow(events[index], beforeThreadSeq)) {
      return false;
    }
  }
  return true;
}

function eventInWindow(
  event: SessionEvent | undefined,
  beforeThreadSeq: number | undefined,
): boolean {
  if (beforeThreadSeq === undefined) {
    return true;
  }
  const seq = event?.threadSeq;
  return typeof seq === 'number' && seq < beforeThreadSeq;
}

function coKeepMarkerRuns(
  segments: ThreadHistorySegment[],
  kept: Set<number>,
  excludedRuns: Set<string>,
  markerSegmentIndex: Map<string, number>,
): void {
  let grew = true;
  while (grew) {
    grew = false;
    for (const index of kept) {
      const runId = segments[index]?.runId ?? null;
      if (runId === null || !excludedRuns.has(runId)) {
        continue;
      }
      const parent = markerSegmentIndex.get(runId);
      if (parent !== undefined && !kept.has(parent)) {
        kept.add(parent);
        grew = true;
      }
    }
  }
}

function forcedEventIndexes(
  segments: ThreadHistorySegment[],
  kept: Set<number>,
  excludedRuns: Set<string>,
  markerEventIndex: Map<string, number>,
): Set<number> {
  const forced = new Set<number>();
  for (const index of kept) {
    const runId = segments[index]?.runId ?? null;
    if (runId === null || !excludedRuns.has(runId)) {
      continue;
    }
    const marker = markerEventIndex.get(runId);
    if (marker !== undefined) {
      forced.add(marker);
    }
  }
  return forced;
}

interface SliceExclusions {
  excludedRuns: Set<string>;
  markerEventIndex: Map<string, number>;
  markerSegmentIndex: Map<string, number>;
}

function sliceExclusions(
  events: SessionEvent[],
  segments: ThreadHistorySegment[],
): SliceExclusions {
  const excludedRuns = new Set<string>();
  const markerEventIndex = new Map<string, number>();
  const markerSegmentIndex = new Map<string, number>();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event) {
      continue;
    }
    const marked = markerRunIdOf(event);
    if (!marked) {
      continue;
    }
    excludedRuns.add(marked);
    const runId = event.runId ?? null;
    if (runId === null || markerEventIndex.has(marked)) {
      continue;
    }
    markerEventIndex.set(marked, index);
    const segmentIndex = segments.findIndex(
      (segment) => segment.runId === runId && segment.start <= index && index < segment.end,
    );
    if (segmentIndex >= 0) {
      markerSegmentIndex.set(marked, segmentIndex);
    }
  }
  return { excludedRuns, markerEventIndex, markerSegmentIndex };
}

function markerRunIdOf(event: SessionEvent): string | null {
  if (event.type === 'agent.spawned' && event.spawnId) {
    return event.spawnId;
  }
  if (
    (event.type === 'map.item.started' ||
      event.type === 'map.item.completed' ||
      event.type === 'map.item.failed') &&
    event.workerId
  ) {
    return event.workerId;
  }
  return null;
}

function newestAnchorIndex(events: SessionEvent[]): number {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (
      event &&
      event.type === 'compaction' &&
      typeof event.summary === 'string' &&
      event.summary.length > 0
    ) {
      return index;
    }
  }
  return -1;
}

function segmentIndexesOfRun(segments: ThreadHistorySegment[], runId: string | null): number[] {
  if (!runId) {
    return [];
  }
  const out: number[] = [];
  segments.forEach((segment, index) => {
    if (segment.runId === runId) {
      out.push(index);
    }
  });
  return out;
}
