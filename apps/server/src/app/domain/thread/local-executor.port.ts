import type { CancelRunResponse, RetryRunResponse, RunAcceptedResponse } from '@harnesys/contracts';
import type {
  Attachment,
  McpServerInfo,
  RunAttribution,
  RunEventStore,
  RunLifecycleStore,
  SessionEvent,
  SessionHandle,
  TruncateThreadResult,
} from 'harnesys';
import type { RunIsolation } from '../fleet/placement.ts';
import type { RunTriggerKind } from './prepare-runtime-input.ts';

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
  clientEventId?: string;
  origin?: string;
  originConnectorId?: string;
  correlationId?: string;
  directory?: string;
  sourceId?: string;
  worktreeId?: string;
  isolation?: RunIsolation;
  triggerKind?: RunTriggerKind;
  branch?: string;
  attribution?: RunAttribution;
  agentId: string;
  triggerThreadSeq?: number;
}

export type CompactSkipReason =
  | 'no-context-window'
  | 'invalid-output-reserve'
  | 'empty-history'
  | 'resume-pending'
  | 'already-covered'
  | 'no-cut-plan'
  | 'hook-blocked'
  | 'empty-window'
  | 'breaker-open'
  | 'rapid-refill';

export type CompactThreadResult =
  | {
      compacted: true;
      id: string;
      coveredFrom: number;
      coveredUntil: number;
      tokensBefore: number;
      tokensAfter: number;
    }
  | { compacted: false; reason?: CompactSkipReason };

export abstract class LocalExecutorPort {
  abstract lifecycle(orgId: string): Promise<RunLifecycleStore>;
  abstract events(orgId: string): Promise<RunEventStore>;
  abstract sessionFor(orgId: string, threadId: string, agentId: string): Promise<SessionHandle>;
  abstract send(input: SendLocalRunInput): Promise<RunAcceptedResponse>;
  abstract compact(orgId: string, threadId: string): Promise<CompactThreadResult>;
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
  abstract countWaitingTimers(orgId: string): Promise<number>;
  abstract listMcpServers(orgId: string): Promise<McpServerInfo[]>;
  abstract invalidateRuntime(orgId: string): Promise<void>;
}
