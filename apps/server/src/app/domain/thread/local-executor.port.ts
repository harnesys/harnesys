import type {
  CancelRunResponse,
  MessageQuote,
  RetryRunResponse,
  RunAcceptedResponse,
  RunEnvironment,
} from '@harnesys/contracts';
import type {
  Attachment,
  CompactionCompleted,
  CompactionSkipReason,
  McpServerInfo,
  RunAttribution,
  RunEventStore,
  RunLifecycleStore,
  SessionEvent,
  SessionHandle,
  TruncateThreadResult,
} from 'harnesys';
import type { RunIsolation } from '../fleet/placement.ts';

export type ThreadQueueDrainResult =
  | { status: 'delivered'; runId: string }
  | { status: 'empty' }
  | { status: 'busy'; reason?: 'pending_ask' };

export interface SendLocalRunInput {
  orgId: string;
  threadId: string;
  text?: string;
  effort?: string;
  mode?: string;
  attachments?: Attachment[];
  skills?: string[];
  quote?: MessageQuote;
  clientEventId?: string;
  origin?: string;
  correlationId?: string;
  environment?: RunEnvironment;
  isolation?: RunIsolation;
  branch?: string;
  attribution?: RunAttribution;
  agentId: string;
  triggerThreadSeq?: number;
}

export type CompactSkipReason =
  | CompactionSkipReason
  | 'compaction-in-progress'
  | 'run-paused'
  | 'cancelled';

export type CompactThreadResult =
  | ({ compacted: true } & CompactionCompleted)
  | { compacted: false; reason?: CompactSkipReason };

export abstract class LocalExecutorPort {
  abstract lifecycle(orgId: string): Promise<RunLifecycleStore>;
  abstract events(orgId: string): Promise<RunEventStore>;
  abstract sessionFor(orgId: string, threadId: string, agentId: string): Promise<SessionHandle>;
  abstract send(input: SendLocalRunInput): Promise<RunAcceptedResponse>;
  abstract compact(
    orgId: string,
    threadId: string,
    signal?: AbortSignal,
    onRun?: (runId: string) => void,
  ): Promise<CompactThreadResult>;
  abstract cancelCompact(orgId: string, threadId: string): Promise<boolean>;
  abstract undoThreadCompact(orgId: string, threadId: string): Promise<SessionEvent>;
  abstract drainMessageQueue(orgId: string, threadId: string): Promise<ThreadQueueDrainResult>;
  abstract cancel(orgId: string, runId: string): Promise<CancelRunResponse>;
  abstract retry(orgId: string, runId: string): Promise<RetryRunResponse>;
  abstract truncateThreadFrom(
    orgId: string,
    threadId: string,
    threadSeq: number,
  ): Promise<TruncateThreadResult>;
  abstract removeThreadEvent(
    orgId: string,
    threadId: string,
    threadSeq: number,
  ): Promise<SessionEvent>;
  abstract stream(
    orgId: string,
    runId: string,
    fromSeq?: number,
  ): Promise<AsyncIterable<SessionEvent>>;
  abstract tickWaitTimers(orgId: string): Promise<number>;
  abstract wakeRuns(orgId: string, wakeKey: string, agentId?: string): Promise<number>;
  abstract countWaitingTimers(orgId: string): Promise<number>;
  abstract listMcpServers(orgId: string): Promise<McpServerInfo[]>;
  abstract invalidateRuntime(orgId: string): Promise<void>;
}
