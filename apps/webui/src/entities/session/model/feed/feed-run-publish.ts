import type { ChunkDraft, ItemDraft, RunDraft, SegmentDraft } from './feed-run-drafts';
import type { RunFold } from './feed-run-fold';
import type {
  FeedChunk,
  FeedItem,
  FeedRun,
  FeedSegment,
  GroupFeedChunk,
  ToolEventPair,
} from './feed-types';
import { isRunningCompactionSegment } from './feed-types';

function sameElements<T>(next: readonly T[], prev: readonly T[]): boolean {
  for (let index = 0; index < next.length; index += 1) {
    if (next[index] !== prev[index]) {
      return false;
    }
  }
  return next.length === prev.length;
}

export function runSnapshot(fold: RunFold): FeedRun[] {
  if (!fold.dirty) {
    return fold.published;
  }
  const current = fold.current ? publishRun(fold.current) : undefined;
  const next = current ? [...fold.closed, current] : fold.closed.slice();
  const settled = withStaleCompactionsInterrupted(next);
  fold.published = sameElements(settled, fold.published) ? fold.published : settled;
  fold.dirty = false;
  return fold.published;
}

/**
 * A running compaction card that is no longer at the feed tail means its
 * closing event never arrived (crash, lost stream): nothing else will update
 * it, so the fold closes it as interrupted instead of lying about progress.
 */
function withStaleCompactionsInterrupted(runs: FeedRun[]): FeedRun[] {
  const tailRunIndex = runs.length - 1;
  let changed = false;
  const next = runs.map((run, runIndex) => {
    if (!run.segments.some(isRunningCompactionSegment)) {
      return run;
    }
    let runChanged = false;
    const segments = run.segments.map((segment, segmentIndex) => {
      if (!isRunningCompactionSegment(segment)) {
        return segment;
      }
      const isFeedTail =
        runIndex === tailRunIndex && segmentIndex === run.segments.length - 1 && segmentIndex >= 0;
      if (isFeedTail) {
        return segment;
      }
      runChanged = true;
      changed = true;
      return { ...segment, meta: { ...segment.meta, status: 'interrupted' as const } };
    });
    return runChanged ? { ...run, segments } : run;
  });
  return changed ? next : runs;
}

export { publishRun };

function publishRun(run: RunDraft): FeedRun {
  const prev = run.published;
  const segments = run.segments.map((segment) => publishSegment(segment));
  const first = run.events[0];
  const key =
    (first?.type === 'user' && first.clientEventId ? first.clientEventId : undefined) ??
    run.runId ??
    run.id ??
    `run-${run.firstIndex}`;
  const eventsSame = prev !== null && prev.events.length === run.events.length;
  if (
    prev !== null &&
    eventsSame &&
    prev.key === key &&
    prev.id === run.id &&
    prev.runId === run.runId &&
    prev.error === run.error &&
    prev.terminal === run.terminal &&
    prev.hasInFlight === run.hasInFlight &&
    sameElements(segments, prev.segments)
  ) {
    return prev;
  }
  const published: FeedRun = {
    key,
    id: run.id,
    runId: run.runId,
    error: run.error,
    terminal: run.terminal,
    firstIndex: run.firstIndex,
    events: eventsSame && prev !== null ? prev.events : run.events.slice(),
    segments,
    hasInFlight: run.hasInFlight,
  };
  run.published = published;
  return published;
}

function publishSegment(segment: SegmentDraft): FeedSegment {
  if (segment.kind !== 'activity') {
    segment.published = segment.data;
    segment.dirty = false;
    return segment.data;
  }
  const items = segment.items.map((item) => publishItem(item));
  const prev = segment.published;
  if (
    !segment.dirty &&
    prev !== null &&
    prev.kind === 'activity' &&
    sameElements(items, prev.items)
  ) {
    segment.dirty = false;
    return prev;
  }
  segment.dirty = false;
  const published: FeedSegment = { key: segment.key, kind: 'activity', items };
  segment.published = published;
  return published;
}

function publishItem(item: ItemDraft): FeedItem {
  const prev = item.published;
  if (!item.group) {
    const chunk = publishChunk(item.chunks[0]);
    if (prev !== null && prev.type === 'chunk' && prev.chunk === chunk) {
      item.dirty = false;
      return prev;
    }
    const published: FeedItem = {
      type: 'chunk',
      key: chunk.key || item.key,
      chunk: chunk as Extract<FeedChunk, { type: 'text' | 'ask' | 'source' | 'file' | 'hook' }>,
    };
    item.published = published;
    item.dirty = false;
    return published;
  }
  const chunks = item.chunks.map((chunk) => publishChunk(chunk) as GroupFeedChunk);
  if (!item.dirty && prev !== null && prev.type === 'group' && sameElements(chunks, prev.chunks)) {
    item.dirty = false;
    return prev;
  }
  const toolsKey = item.chunks.find((chunk) => chunk.kind === 'tools')?.pairs?.[0]?.key;
  const published: FeedItem = {
    type: 'group',
    key: toolsKey ?? `group-${item.key || chunks[0]?.key || 'x'}`,
    chunks,
  };
  item.published = published;
  item.dirty = false;
  return published;
}

function publishChunk(chunk: ChunkDraft): FeedChunk {
  if (chunk.kind === 'tools') {
    return publishToolsChunk(chunk);
  }
  if (chunk.kind === 'reasoning') {
    return publishReasoningChunk(chunk);
  }
  return publishEventChunk(chunk);
}

function publishToolsChunk(chunk: ChunkDraft): FeedChunk {
  const prev = chunk.published;
  const pairs: ToolEventPair[] = [];
  for (const pair of chunk.pairs ?? []) {
    if (!pair.dirty && pair.published !== null) {
      pairs.push(pair.published);
      continue;
    }
    const published: ToolEventPair = {
      call: pair.call,
      ...(pair.result ? { result: pair.result } : {}),
      ...(pair.ask ? { ask: pair.ask } : {}),
    };
    pair.published = published;
    pair.dirty = false;
    pairs.push(published);
  }
  if (!chunk.dirty && prev !== null && prev.type === 'tools' && sameElements(pairs, prev.pairs)) {
    chunk.dirty = false;
    return prev;
  }
  const published: FeedChunk = {
    key: chunk.pairs?.[0]?.key ?? chunk.key,
    type: 'tools',
    pairs,
  };
  chunk.published = published;
  chunk.dirty = false;
  return published;
}

function publishReasoningChunk(chunk: ChunkDraft): FeedChunk {
  const prev = chunk.published;
  const events = chunk.reasoning ?? [];
  if (!chunk.dirty && prev !== null && prev.type === 'reasoning' && prev.events === events) {
    return prev;
  }
  const published: FeedChunk = {
    key: chunk.key || 'reasoning',
    type: 'reasoning',
    events,
  };
  chunk.published = published;
  chunk.dirty = false;
  return published;
}

function publishEventChunk(chunk: ChunkDraft): FeedChunk {
  const prev = chunk.published;
  if (
    prev !== null &&
    prev.type !== 'reasoning' &&
    prev.type !== 'tools' &&
    prev.event === chunk.event
  ) {
    chunk.dirty = false;
    return prev;
  }
  const published = {
    key: chunk.key || `${chunk.kind}-x`,
    type: chunk.kind,
    event: chunk.event,
  } as FeedChunk;
  chunk.published = published;
  chunk.dirty = false;
  return published;
}
