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
import type { FeedDecision, SpawnSeenAt, ThreadFeed, ThreadFeeds } from './feed-types';

interface RegionFold {
  spawns: ReturnType<typeof createSpawnFold>;
  maps: ReturnType<typeof createMapFold>;
  runs: ReturnType<typeof createRunFold>;
  nextIndex: number;
}
interface ThreadFold {
  boundary: number;
  placementCursor: PlacementCursor;
  inherited: RegionFold;
  own: RegionFold;
}

const folds = new Map<string, ThreadFold>();
const boundaries = new Map<string, number>();

function createRegion(nextIndex: number, placementCursor: PlacementCursor): RegionFold {
  return {
    spawns: createSpawnFold(),
    maps: createMapFold(),
    runs: createRunFold(placementCursor),
    nextIndex,
  };
}

export function feedBoundary(threadId: string): number {
  return boundaries.get(threadId) ?? 0;
}

export function feedSetBoundary(threadId: string, count: number): boolean {
  if ((boundaries.get(threadId) ?? 0) === count) {
    return false;
  }
  boundaries.set(threadId, count);
  folds.delete(threadId);
  return true;
}

export function feedDrop(threadIds: string[]): void {
  for (const id of threadIds) {
    folds.delete(id);
    boundaries.delete(id);
  }
}

function processEvent(
  region: RegionFold,
  ev: SessionEvent,
  seenAt: SpawnSeenAt,
  advance: boolean,
): void {
  const runId = ev.runId ?? '';
  if (region.spawns.spawnIds.has(runId)) {
    spawnProcessOwned(region.spawns, ev, runId, seenAt);
    return;
  }
  if (ev.type === 'agent.spawned' || ev.type === 'agent.completed' || ev.type === 'agent.failed') {
    spawnProcess(region.spawns, ev, seenAt);
  }
  if (mapProcess(region.maps, ev, region.spawns.spawnIds, seenAt)) {
    return;
  }
  runProcess(region.runs, ev, region.nextIndex);
  if (advance) {
    region.nextIndex += 1;
  }
}

function snapshotRegion(region: RegionFold): ThreadFeed {
  return {
    runs: runSnapshot(region.runs),
    spawns: spawnSnapshot(region.spawns),
    maps: mapSnapshot(region.maps),
  };
}

function snapshotFold(fold: ThreadFold): ThreadFeeds {
  return { inherited: snapshotRegion(fold.inherited), own: snapshotRegion(fold.own) };
}

function rebuild(fold: ThreadFold, events: SessionEvent[], seenAt: SpawnSeenAt): ThreadFeeds {
  fold.placementCursor.lastSelectedNodeId = null;
  fold.inherited = createRegion(0, fold.placementCursor);
  fold.own = createRegion(fold.boundary, fold.placementCursor);
  for (let index = 0; index < events.length; index += 1) {
    const region = index < fold.boundary ? fold.inherited : fold.own;
    processEvent(region, events[index], seenAt, true);
  }
  return snapshotFold(fold);
}

export function feedUpdate(
  threadId: string,
  events: SessionEvent[],
  seenAt: SpawnSeenAt,
  decisions: FeedDecision[] | null,
): ThreadFeeds {
  const boundary = feedBoundary(threadId);
  let fold = folds.get(threadId);
  if (!fold || fold.boundary !== boundary) {
    const placementCursor = createPlacementCursor();
    fold = {
      boundary,
      placementCursor,
      inherited: createRegion(0, placementCursor),
      own: createRegion(boundary, placementCursor),
    };
    folds.set(threadId, fold);
    return rebuild(fold, events, seenAt);
  }
  if (!decisions) {
    return rebuild(fold, events, seenAt);
  }
  for (const decision of decisions) {
    if (decision.replaces) {
      return rebuild(fold, events, seenAt);
    }
    const region = decision.index < boundary ? fold.inherited : fold.own;
    if (!decision.merged && region.nextIndex !== decision.index) {
      return rebuild(fold, events, seenAt);
    }
    processEvent(region, decision.ev, seenAt, !decision.merged);
  }
  return snapshotFold(fold);
}
