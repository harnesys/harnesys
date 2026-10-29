import type { SessionEvent } from '@harnesys/studio-shared';
import { stableEventKey } from '../event-keys';
import type { MapInfo, MapItemInfo, SpawnSeenAt } from './feed-types';

const PREVIEW_MAX = 120;

export interface ItemDraft {
  info: MapItemInfo;
  deltaId: string | undefined;
  deltaText: string;
  reasoningId: string | undefined;
  reasoningText: string;
  dirty: boolean;
  published: MapItemInfo | null;
}
export interface MapDraft {
  info: Omit<MapInfo, 'items'> & { items: MapItemInfo[] };
  itemsByWorker: Map<string, ItemDraft>;
  legacyKey: number;
  dirty: boolean;
  published: MapInfo | null;
}

export interface MapFold {
  drafts: MapDraft[];
  current: MapDraft | undefined;
  workerIds: Set<string>;
  itemDrafts: Map<string, ItemDraft>;
  legacyIndex: number;
  legacyOpen: Map<number, MapDraft>;
  toolQueues: Map<string, string[]>;
  published: MapInfo[];
}

export function createMapFold(): MapFold {
  return {
    drafts: [],
    current: undefined,
    workerIds: new Set(),
    itemDrafts: new Map(),
    legacyIndex: -1,
    legacyOpen: new Map(),
    toolQueues: new Map(),
    published: [],
  };
}

function truncate(text: string): string {
  if (text.length <= PREVIEW_MAX) {
    return text;
  }
  return `${Array.from(text).slice(0, PREVIEW_MAX).join('')}…`;
}

function seenOr(
  prev: number | undefined,
  seenAt: SpawnSeenAt | undefined,
  ev: SessionEvent,
): number | undefined {
  if (seenAt === undefined) {
    return prev;
  }
  const key = stableEventKey(ev);
  if (key === undefined) {
    return prev;
  }
  return seenAt[key] ?? prev;
}

function createItemDraft(
  workerId: string,
  index: number,
  seenAt: SpawnSeenAt | undefined,
  ev: SessionEvent,
): ItemDraft {
  return {
    info: {
      index,
      workerId,
      status: 'running',
      startedAt: seenOr(undefined, seenAt, ev),
      lastSeenAt: seenOr(undefined, seenAt, ev),
    },
    deltaId: undefined,
    deltaText: '',
    reasoningId: undefined,
    reasoningText: '',
    dirty: true,
    published: null,
  };
}

export function mapProcess(
  fold: MapFold,
  ev: SessionEvent,
  spawnIds: Set<string>,
  seenAt: SpawnSeenAt | undefined,
): boolean {
  if (ev.type === 'map.started') {
    applyMapStarted(fold, ev, seenAt);
    return true;
  }
  if (ev.type === 'map.item.started' && fold.current) {
    applyItemStarted(fold, ev, seenAt);
    return true;
  }
  if ((ev.type === 'map.item.completed' || ev.type === 'map.item.failed') && fold.current) {
    applyItemFinished(fold, ev, seenAt);
    return true;
  }
  if (ev.type === 'map.completed' && fold.current) {
    applyMapCompleted(fold, ev, seenAt);
    return true;
  }
  if (ev.type === 'tool' && ev.name === 'map' && ev.phase === 'completed') {
    applyToolCompleted(fold, ev);
    return false;
  }
  if (applyLegacySpawn(fold, ev, spawnIds, seenAt)) {
    return true;
  }
  return applyWorkerEvent(fold, ev, seenAt);
}

function applyMapStarted(
  fold: MapFold,
  ev: SessionEvent & { type: 'map.started' },
  seenAt: SpawnSeenAt | undefined,
): void {
  const draft: MapDraft = {
    info: {
      nodeId: ev.nodeId,
      parentRunId: ev.runId,
      count: ev.count,
      concurrency: ev.concurrency,
      status: 'running',
      ok: 0,
      failed: 0,
      items: [],
      startedAt: seenOr(undefined, seenAt, ev),
    },
    itemsByWorker: new Map(),
    legacyKey: 0,
    dirty: true,
    published: null,
  };
  fold.drafts.push(draft);
  fold.current = draft;
  fold.legacyIndex += 1;
  draft.legacyKey = fold.legacyIndex;
  fold.legacyOpen.set(fold.legacyIndex, draft);
}

function applyItemStarted(
  fold: MapFold,
  ev: SessionEvent & { type: 'map.item.started' },
  seenAt: SpawnSeenAt | undefined,
): void {
  const current = fold.current;
  if (!current) {
    return;
  }
  const item = createItemDraft(ev.workerId, ev.index, seenAt, ev);
  current.itemsByWorker.set(ev.workerId, item);
  current.info.items.push(item.info);
  fold.workerIds.add(ev.workerId);
  fold.itemDrafts.set(ev.workerId, item);
  current.dirty = true;
  fold.legacyOpen.delete(current.legacyKey);
}

function applyItemFinished(
  fold: MapFold,
  ev: SessionEvent & { type: 'map.item.completed' | 'map.item.failed' },
  seenAt: SpawnSeenAt | undefined,
): void {
  const current = fold.current;
  if (!current) {
    return;
  }
  const item = current.itemsByWorker.get(ev.workerId);
  if (!item) {
    return;
  }
  item.info.status = ev.type === 'map.item.completed' ? 'done' : 'failed';
  item.info.lastSeenAt = seenOr(item.info.lastSeenAt, seenAt, ev);
  if (ev.type === 'map.item.failed') {
    item.info.code = ev.code;
    item.info.message = ev.message;
  }
  item.dirty = true;
  current.dirty = true;
}

function applyMapCompleted(
  fold: MapFold,
  ev: SessionEvent & { type: 'map.completed' },
  seenAt: SpawnSeenAt | undefined,
): void {
  const current = fold.current;
  if (!current) {
    return;
  }
  current.info.status = ev.failed > 0 ? 'failed' : 'done';
  current.info.ok = ev.ok;
  current.info.failed = ev.failed;
  current.info.timedOut = ev.timedOut;
  current.info.completedAt = seenOr(undefined, seenAt, ev);
  for (const item of current.info.items) {
    if (item.status !== 'running') {
      continue;
    }
    const draft = current.itemsByWorker.get(item.workerId);
    if (draft) {
      draft.info.status = 'done';
      draft.dirty = true;
    } else {
      item.status = 'done';
    }
  }
  current.dirty = true;
  fold.legacyOpen.delete(fold.legacyIndex);
  fold.current = undefined;
}

function applyToolCompleted(fold: MapFold, ev: SessionEvent & { type: 'tool' }): void {
  if (ev.runId === undefined || !ev.toolCallId) {
    return;
  }
  const queue = fold.toolQueues.get(ev.runId);
  if (queue) {
    queue.push(ev.toolCallId);
  } else {
    fold.toolQueues.set(ev.runId, [ev.toolCallId]);
  }
  for (const draft of fold.drafts) {
    if (draft.info.parentRunId !== ev.runId || draft.info.toolCallId) {
      continue;
    }
    const callId = fold.toolQueues.get(ev.runId)?.shift();
    if (callId) {
      draft.info.toolCallId = callId;
      draft.dirty = true;
    }
    break;
  }
}

function applyLegacySpawn(
  fold: MapFold,
  ev: SessionEvent,
  spawnIds: Set<string>,
  seenAt: SpawnSeenAt | undefined,
): boolean {
  if (ev.runId === undefined || fold.workerIds.has(ev.runId) || spawnIds.has(ev.runId)) {
    return false;
  }
  const map = lastLegacyOpen(fold);
  if (!map || map.info.parentRunId === ev.runId || map.itemsByWorker.has(ev.runId)) {
    return false;
  }
  const item = createItemDraft(ev.runId, map.info.items.length, seenAt, ev);
  item.info.status = map.info.status === 'running' ? 'running' : 'done';
  map.info.items.push(item.info);
  map.itemsByWorker.set(ev.runId, item);
  map.dirty = true;
  fold.workerIds.add(ev.runId);
  fold.itemDrafts.set(ev.runId, item);
  return true;
}

function applyWorkerEvent(
  fold: MapFold,
  ev: SessionEvent,
  seenAt: SpawnSeenAt | undefined,
): boolean {
  if (ev.runId === undefined) {
    return false;
  }
  const draft = fold.itemDrafts.get(ev.runId);
  if (!draft) {
    return false;
  }
  draft.info.lastSeenAt = seenOr(draft.info.lastSeenAt, seenAt, ev);
  if (ev.type === 'text-delta') {
    const continues = ev.id !== undefined && ev.id === draft.deltaId && draft.deltaText !== '';
    draft.deltaText = continues ? draft.deltaText + ev.text : ev.text;
    draft.deltaId = ev.id;
    draft.info.preview = truncate(draft.deltaText);
  } else if (ev.type === 'reasoning-delta') {
    const continues =
      ev.id !== undefined && ev.id === draft.reasoningId && draft.reasoningText !== '';
    draft.reasoningText = continues ? draft.reasoningText + ev.text : ev.text;
    draft.reasoningId = ev.id;
    if (!draft.info.preview) {
      draft.info.preview = truncate(draft.reasoningText);
    }
  } else if (ev.type === 'done') {
    draft.info.status = draft.info.status === 'failed' ? 'failed' : 'done';
    if (typeof ev.text === 'string' && ev.text) {
      draft.info.preview = truncate(ev.text);
    }
  } else if (ev.type === 'error') {
    draft.info.status = 'failed';
    draft.info.message = ev.message;
    draft.info.code = ev.code;
  }
  draft.dirty = true;
  return true;
}

function lastLegacyOpen(fold: MapFold): MapDraft | undefined {
  let last: MapDraft | undefined;
  for (const draft of fold.legacyOpen.values()) {
    last = draft;
  }
  return last;
}
