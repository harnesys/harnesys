import type { SessionEvent } from '@harnesys/studio-shared';
import { mapSnapshot } from './feed-map-snapshot';
import { createMapFold, mapProcess } from './feed-maps';
import {
  createPlacementCursor,
  createRunFold,
  type PlacementCursor,
  runProcess,
} from './feed-run-fold';
import { runSnapshot } from './feed-run-publish';
import { createSpawnFold, spawnProcess, spawnProcessOwned, spawnSnapshot } from './feed-spawns';
import type { FeedDecision, SpawnSeenAt, ThreadFeed } from './feed-types';

interface ThreadFold {
  placementCursor: PlacementCursor;
  spawns: ReturnType<typeof createSpawnFold>;
  maps: ReturnType<typeof createMapFold>;
  runs: ReturnType<typeof createRunFold>;
  nextIndex: number;
}

const folds = new Map<string, ThreadFold>();

export function feedDrop(threadIds: string[]): void {
  for (const id of threadIds) {
    folds.delete(id);
  }
}

export function feedHasFold(threadId: string): boolean {
  return folds.has(threadId);
}

function createFold(placementCursor: PlacementCursor): ThreadFold {
  return {
    placementCursor,
    spawns: createSpawnFold(),
    maps: createMapFold(),
    runs: createRunFold(placementCursor),
    nextIndex: 0,
  };
}

function processEvent(
  fold: ThreadFold,
  ev: SessionEvent,
  seenAt: SpawnSeenAt,
  advance: boolean,
): void {
  const index = fold.nextIndex;
  if (advance) {
    fold.nextIndex += 1;
  }
  const runId = ev.runId ?? '';
  if (fold.spawns.spawnIds.has(runId)) {
    spawnProcessOwned(fold.spawns, ev, runId, seenAt);
    return;
  }
  if (ev.type === 'agent.spawned' || ev.type === 'agent.completed' || ev.type === 'agent.failed') {
    spawnProcess(fold.spawns, ev, seenAt);
  }
  if (mapProcess(fold.maps, ev, fold.spawns.spawnIds, seenAt)) {
    return;
  }
  runProcess(fold.runs, ev, index);
}

function snapshot(fold: ThreadFold): ThreadFeed {
  return {
    runs: runSnapshot(fold.runs),
    spawns: spawnSnapshot(fold.spawns),
    maps: mapSnapshot(fold.maps),
  };
}

function rebuild(fold: ThreadFold, events: SessionEvent[], seenAt: SpawnSeenAt): ThreadFeed {
  fold.placementCursor.lastSelectedNodeId = null;
  fold.spawns = createSpawnFold();
  fold.maps = createMapFold();
  fold.runs = createRunFold(fold.placementCursor);
  fold.nextIndex = 0;
  for (const ev of events) {
    processEvent(fold, ev, seenAt, true);
  }
  return snapshot(fold);
}

export function feedUpdate(
  threadId: string,
  events: SessionEvent[],
  seenAt: SpawnSeenAt,
  decisions: FeedDecision[] | null,
  prunedBefore = 0,
): ThreadFeed {
  let fold = folds.get(threadId);
  if (!fold) {
    fold = createFold(createPlacementCursor());
    folds.set(threadId, fold);
    return rebuild(fold, events, seenAt);
  }
  if (!decisions) {
    return rebuild(fold, events, seenAt);
  }
  if (prunedBefore > 0) {
    fold.nextIndex = Math.max(0, fold.nextIndex - prunedBefore);
  }
  for (const decision of decisions) {
    if (decision.replaces) {
      return rebuild(fold, events, seenAt);
    }
    if (!decision.merged && fold.nextIndex !== decision.index) {
      return rebuild(fold, events, seenAt);
    }
    processEvent(fold, decision.ev, seenAt, !decision.merged);
  }
  return snapshot(fold);
}
