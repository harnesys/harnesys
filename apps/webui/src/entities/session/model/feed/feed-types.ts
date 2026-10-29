import type { SessionEvent, SessionEventType } from '@harnesys/studio-shared';

export type SpawnStatus = 'running' | 'done' | 'failed';
export type SpawnToolPhase = 'requested' | 'completed' | 'failed';
export interface SpawnToolStat {
  requested: number;
  completed: number;
  failed: number;
}
export interface SpawnToolChip {
  name: string;
  phase: SpawnToolPhase;
}
export type SpawnSeenAt = Record<string, number>;
export interface SpawnInfo {
  spawnId: string;
  agentId: string;
  status: SpawnStatus;
  lastActivity: string;
  taskText?: string;
  toolStats: Record<string, SpawnToolStat>;
  recentTools: SpawnToolChip[];
  steps: number;
  tokens: number;
  preview?: string;
  spawnedAt?: number;
  lastSeenAt?: number;
}

export type MapItemStatus = 'running' | 'done' | 'failed';
export interface MapItemInfo {
  index: number;
  workerId: string;
  status: MapItemStatus;
  preview?: string;
  code?: string;
  message?: string;
  startedAt?: number;
  lastSeenAt?: number;
}
export interface MapInfo {
  nodeId: string;
  parentRunId?: string;
  toolCallId?: string;
  count: number;
  concurrency?: string;
  status: MapItemStatus;
  ok: number;
  failed: number;
  timedOut?: boolean;
  items: MapItemInfo[];
  startedAt?: number;
  completedAt?: number;
}

export interface CompactionSegmentMeta {
  id: string;
  reason: 'threshold' | 'manual';
  coveredFrom: number;
  coveredUntil: number;
  tokensBefore: number;
  tokensAfter: number;
  summary?: string;
  coveredUntilRunId?: string;
  coveredUntilSeq?: number;
}

export type ToolCallEvent = SessionEvent & {
  type: 'tool';
};
export type MemoryEvent = SessionEvent & {
  type: 'memory';
};
export type ToolCallOpen = ToolCallEvent & {
  phase: 'requested' | 'streaming';
};
export type ToolCallDone = ToolCallEvent & {
  phase: 'completed' | 'failed';
};
export type ToolAskEvent = SessionEvent & {
  type: 'ask';
};
export interface ToolEventPair {
  call: ToolCallOpen;
  result?: ToolCallDone;
  ask?: ToolAskEvent;
}

export type FeedChunk =
  | {
      key: string;
      type: 'reasoning';
      events: (SessionEvent & {
        type: 'reasoning-delta';
      })[];
    }
  | {
      key: string;
      type: 'text';
      event: SessionEvent & {
        type: 'text-delta';
      };
    }
  | {
      key: string;
      type: 'ask';
      event: SessionEvent & {
        type: 'ask';
      };
    }
  | {
      key: string;
      type: 'hook';
      event: SessionEvent & {
        type: 'hook';
      };
    }
  | {
      key: string;
      type: 'tools';
      pairs: ToolEventPair[];
    }
  | {
      key: string;
      type: 'source';
      event: SessionEvent & {
        type: 'source';
      };
    }
  | {
      key: string;
      type: 'file';
      event: SessionEvent & {
        type: 'file';
      };
    }
  | {
      key: string;
      type: 'spawn';
      event: SessionEvent & {
        type: 'agent.spawned';
      };
    };
export type GroupFeedChunk = Extract<FeedChunk, { type: 'reasoning' | 'tools' | 'spawn' }>;
export type FeedItem =
  | {
      type: 'group';
      key: string;
      chunks: GroupFeedChunk[];
    }
  | {
      type: 'chunk';
      key: string;
      chunk: Extract<
        FeedChunk,
        {
          type: 'text' | 'ask' | 'source' | 'file' | 'hook';
        }
      >;
    };

export type FeedSegment =
  | {
      key: string;
      kind: 'user';
      event: SessionEvent & {
        type: 'user';
      };
    }
  | {
      key: string;
      kind: 'text';
      id: string | undefined;
      text: string;
    }
  | {
      key: string;
      kind: 'compaction';
      text: string;
      meta: CompactionSegmentMeta;
    }
  | {
      key: string;
      kind: 'handoff';
      agentId: string;
      seq: number | undefined;
    }
  | {
      key: string;
      kind: 'memory';
      event: MemoryEvent;
    }
  | {
      key: string;
      kind: 'placement';
      summary: string;
      seq: number | undefined;
    }
  | {
      key: string;
      kind: 'activity';
      items: FeedItem[];
    };

export type FeedRunTerminal = 'done' | 'error' | 'run.completed' | 'run.failed' | 'run.cancelled';

export interface FeedRun {
  key: string;
  id: string | null;
  runId: string | undefined;
  error: string | null;
  terminal: FeedRunTerminal | null;
  firstIndex: number;
  events: SessionEvent[];
  segments: FeedSegment[];
  hasInFlight: boolean;
}

export interface ThreadFeed {
  runs: FeedRun[];
  spawns: SpawnInfo[];
  maps: MapInfo[];
}

export interface ThreadFeeds {
  inherited: ThreadFeed;
  own: ThreadFeed;
}

export interface FeedDecision {
  ev: SessionEvent;
  merged: boolean;
  index: number;
  replaces?: boolean;
}

export const RUN_TERMINAL_EVENT_TYPES = new Set<SessionEventType>([
  'done',
  'error',
  'run.completed',
  'run.failed',
  'run.cancelled',
]);
