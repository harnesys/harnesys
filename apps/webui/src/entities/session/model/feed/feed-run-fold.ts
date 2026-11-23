import type { SessionEvent } from '@harnesys/studio-shared';
import { selfNodeCached } from '@/shared/api/fleet';
import { activityProcess, flushActivity } from './feed-run-activity';
import type {
  CompactionAnchorEvent,
  CompactionProgressEvent,
  RunDraft,
  SegmentDraft,
  TextDeltaEvent,
} from './feed-run-drafts';
import { publishRun, runSnapshot } from './feed-run-publish';
import type {
  CompactionSegmentMeta,
  FeedRun,
  FeedRunTerminal,
  FeedSegment,
  MemoryEvent,
} from './feed-types';
import { isRunningCompactionSegment, RUN_TERMINAL_EVENT_TYPES } from './feed-types';
import { shouldShowPlacementInFeed } from './placement-visibility';

export interface PlacementCursor {
  lastSelectedNodeId: string | null;
}

export interface RunFold {
  closed: FeedRun[];
  current: RunDraft | undefined;
  dirty: boolean;
  published: FeedRun[];
  placementCursor: PlacementCursor;
}

export function createPlacementCursor(): PlacementCursor {
  return { lastSelectedNodeId: null };
}

export function createRunFold(placementCursor: PlacementCursor = createPlacementCursor()): RunFold {
  return {
    closed: [],
    current: undefined,
    dirty: false,
    published: [],
    placementCursor,
  };
}

export function runProcess(fold: RunFold, ev: SessionEvent, index: number): void {
  if (RUN_TERMINAL_EVENT_TYPES.has(ev.type)) {
    const failed =
      (ev.type === 'error' || ev.type === 'run.failed') && 'message' in ev
        ? (ev as { message: string }).message
        : null;
    closeRun(fold, failed, ev.type as FeedRunTerminal);
    return;
  }
  if (ev.type === 'model.retry' || ev.type === 'model.throttle') {
    return;
  }
  let run = fold.current;
  if (!run) {
    run = createRun(index);
    fold.current = run;
  }
  fold.dirty = true;
  run.events.push(ev);
  trackThreadSeq(run, ev);
  if (!run.id && ev.type === 'tool' && ev.toolCallId) {
    run.id = ev.toolCallId;
  }
  if (!run.runId && ev.runId) {
    run.runId = ev.runId;
  }
  if (segmentProcess(fold, run, ev)) {
    return;
  }
  activityProcess(run, ev);
}

function segmentProcess(fold: RunFold, run: RunDraft, ev: SessionEvent): boolean {
  if (ev.type === 'user') {
    flushActivity(run);
    pushSegment(run, { key: '', kind: 'user', event: ev as SessionEvent & { type: 'user' } });
    return true;
  }
  if (ev.type === 'text-delta') {
    appendText(run, ev as TextDeltaEvent);
    return true;
  }
  if (ev.type === 'compaction') {
    appendCompaction(run, ev as CompactionAnchorEvent);
    return true;
  }
  if (ev.type === 'compaction.progress') {
    progressCompaction(run, ev as CompactionProgressEvent);
    return true;
  }
  if (ev.type === 'agent.handoff') {
    flushActivity(run);
    pushSegment(run, { key: '', kind: 'handoff', agentId: ev.agentId, seq: ev.seq });
    return true;
  }
  if (ev.type === 'memory') {
    flushActivity(run);
    pushSegment(run, { key: '', kind: 'memory', event: ev as MemoryEvent });
    return true;
  }
  if (ev.type === 'placement.decided') {
    const selected = ev.selectedNodeId ?? null;
    const show = shouldShowPlacementInFeed({
      selectedNodeId: selected,
      localHostId: selfNodeCached(),
      lastSelectedNodeId: fold.placementCursor.lastSelectedNodeId,
    });
    if (selected) {
      fold.placementCursor.lastSelectedNodeId = selected;
    }
    if (!show) {
      return true;
    }
    flushActivity(run);
    pushSegment(run, {
      key: '',
      kind: 'placement',
      summary: ev.summary,
      seq: ev.seq,
    });
    return true;
  }
  return false;
}

function appendText(run: RunDraft, delta: TextDeltaEvent): void {
  flushActivity(run);
  const last = run.segments[run.segments.length - 1];
  if (last && last.kind === 'text' && last.data.kind === 'text' && last.data.id === delta.id) {
    last.data = { ...last.data, text: last.data.text + delta.text };
    return;
  }
  pushSegment(run, { key: '', kind: 'text', id: delta.id, text: delta.text });
}

function appendCompaction(run: RunDraft, ev: CompactionAnchorEvent): void {
  flushActivity(run);
  const texts: string[] = [];
  while (run.segments.length > 0) {
    const last = run.segments[run.segments.length - 1];
    if (last.kind !== 'text') {
      break;
    }
    if (last.data.kind === 'text') {
      texts.unshift(last.data.text);
    }
    run.segments.pop();
  }
  const meta: CompactionSegmentMeta = {
    id: ev.id,
    reason: ev.reason,
    coveredFrom: ev.coveredFrom,
    coveredUntil: ev.coveredUntil,
    tokensBefore: ev.tokensBefore,
    tokensAfter: ev.tokensAfter,
    status: 'completed',
    ...(ev.summary ? { summary: ev.summary } : {}),
    ...(ev.coveredUntilRunId ? { coveredUntilRunId: ev.coveredUntilRunId } : {}),
    ...(ev.coveredUntilSeq !== undefined ? { coveredUntilSeq: ev.coveredUntilSeq } : {}),
    ...(ev.coveredUntilThreadSeq !== undefined
      ? { coveredUntilThreadSeq: ev.coveredUntilThreadSeq }
      : {}),
  };
  const text = texts.join('');
  const draft = findCompactionDraft(run, ev.id);
  if (draft && draft.data.kind === 'compaction') {
    draft.data = { ...draft.data, text, meta };
    return;
  }
  pushSegment(run, { key: '', kind: 'compaction', text, meta });
}

function progressCompaction(run: RunDraft, ev: CompactionProgressEvent): void {
  flushActivity(run);
  const draft = findCompactionDraft(run, ev.id);
  if (ev.phase === 'started') {
    if (!draft) {
      pushSegment(run, {
        key: '',
        kind: 'compaction',
        text: '',
        meta: markerMeta(ev, 'running'),
      });
    }
    return;
  }
  if (draft && draft.data.kind === 'compaction' && draft.data.meta.status === 'running') {
    draft.data = {
      ...draft.data,
      meta: { ...draft.data.meta, status: ev.phase, message: ev.message },
    };
    return;
  }
  if (!draft) {
    pushSegment(run, {
      key: '',
      kind: 'compaction',
      text: '',
      meta: { ...markerMeta(ev, ev.phase), message: ev.message },
    });
  }
}

function markerMeta(
  ev: CompactionProgressEvent,
  status: 'running' | 'failed' | 'cancelled',
): CompactionSegmentMeta {
  return {
    id: ev.id,
    reason: ev.reason ?? 'manual',
    coveredFrom: ev.coveredFrom ?? 0,
    coveredUntil: ev.coveredUntil ?? 0,
    tokensBefore: 0,
    tokensAfter: 0,
    status,
  };
}

function findCompactionDraft(run: RunDraft, id: string): SegmentDraft | undefined {
  for (let index = run.segments.length - 1; index >= 0; index -= 1) {
    const segment = run.segments[index];
    if (
      segment &&
      segment.kind === 'compaction' &&
      segment.data.kind === 'compaction' &&
      segment.data.meta.id === id
    ) {
      return segment;
    }
  }
  return undefined;
}

export function splitRuns(events: SessionEvent[]): FeedRun[] {
  const fold = createRunFold();
  let index = 0;
  for (const ev of events) {
    runProcess(fold, ev, index);
    index += 1;
  }
  return runSnapshot(fold).slice();
}

export function hasRunningCompaction(run: FeedRun): boolean {
  return run.segments.some(isRunningCompactionSegment);
}

export function hasCompactedAnchor(run: FeedRun): boolean {
  return run.segments.some(
    (segment) => segment.kind === 'compaction' && segment.meta.status === 'completed',
  );
}

function createRun(index: number): RunDraft {
  return {
    id: null,
    runId: undefined,
    error: null,
    terminal: null,
    firstIndex: index,
    firstThreadSeq: null,
    lastThreadSeq: null,
    events: [],
    segments: [],
    segmentOrdinal: 0,
    pairs: new Map(),
    hasInFlight: false,
    published: null,
  };
}

function trackThreadSeq(run: RunDraft, ev: SessionEvent): void {
  if (ev.threadSeq === undefined) {
    return;
  }
  if (run.firstThreadSeq === null) {
    run.firstThreadSeq = ev.threadSeq;
  }
  run.lastThreadSeq =
    run.lastThreadSeq === null ? ev.threadSeq : Math.max(run.lastThreadSeq, ev.threadSeq);
}

function closeRun(fold: RunFold, error: string | null, terminal: FeedRunTerminal): void {
  const run = fold.current;
  if (!run) {
    return;
  }
  flushActivity(run);
  run.error = error;
  run.terminal = terminal;
  fold.closed.push(publishRun(run));
  fold.current = undefined;
  fold.dirty = true;
}

export function pushSegment(run: RunDraft, data: FeedSegment): void {
  data.key = `s${run.segmentOrdinal}`;
  run.segmentOrdinal += 1;
  run.segments.push({
    kind: data.kind,
    key: data.key,
    data,
    items: [],
    reasoningBuffer: [],
    toolsBuffer: [],
    groupChunks: [],
    askByCall: new Map(),
    askItemByCall: new Map(),
    chunkOrdinal: 0,
    itemOrdinal: 0,
    eventCount: 1,
    dirty: true,
    published: null,
  });
}
