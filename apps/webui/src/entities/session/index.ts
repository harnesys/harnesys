export { dropDeletedEvents } from './model/apply-deletions.ts';
export { coalesceStreamDeltas } from './model/coalesce-events.ts';
export { eventKey, stableEventKey } from './model/event-keys.ts';
export {
  type CompactionCoverage,
  type CompactionCoverageMode,
  compactionCoverage,
  coveredRunCount,
  firstLiveRunIndex,
  isRunCovered,
} from './model/feed/compaction-coverage.ts';
export {
  useFeedMap,
  useFeedSpawn,
  useFeedSpawns,
  useThreadFeed,
} from './model/feed/feed-hooks.ts';
export { mapForToolCall, mapLineHint } from './model/feed/feed-map-snapshot.ts';
export { hasCompactedAnchor, hasRunningCompaction, splitRuns } from './model/feed/feed-run-fold.ts';
export {
  createSpawnFold,
  spawnProcess,
  spawnSnapshot,
  spawnTaskText,
} from './model/feed/feed-spawns.ts';
export type {
  CompactionSegmentMeta,
  CompactionStatus,
  FeedChunk,
  FeedItem,
  FeedRun,
  FeedRunTerminal,
  FeedSegment,
  GroupFeedChunk,
  MapInfo,
  MapItemInfo,
  MapItemStatus,
  MemoryEvent,
  SpawnInfo,
  SpawnSeenAt,
  SpawnStatus,
  SpawnToolChip,
  SpawnToolPhase,
  SpawnToolStat,
  ThreadFeed,
  ToolCallDone,
  ToolCallEvent,
  ToolEventPair,
} from './model/feed/feed-types.ts';
export type { LiveTail } from './model/live-tail.ts';
export { useLiveTail } from './model/live-tail.ts';
export { normalizeThreadEvents } from './model/normalize-events.ts';
export { hasPendingAppend } from './model/pending-appends.ts';
export {
  type ActiveRun,
  type RunFailure,
  type ThreadHistoryWindow,
  useSessionStore,
} from './model/session.store.ts';
export { TERMINAL_EVENT_TYPES } from './model/session-types.ts';
export {
  type CacheRatioInput,
  type CacheSplitInput,
  cacheHitRatio,
  cacheMissTokens,
  contextUsedRatio,
  estimateTokens,
  formatDuration,
  formatTokenCount,
  type MessageUsage,
  type OutputSplitInput,
  rollupUsage,
  type ToolRunStat,
  textOutputTokens,
  tokensLeft,
  tokensUsed,
  type UsageRollup,
  usageFromGeneration,
} from './model/usage.ts';
