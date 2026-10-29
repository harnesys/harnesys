import type { AcceptedRunResponse, CancelRunResponse, RetryRunResponse } from '@harnesys/contracts';
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
  attachments?: Attachment[];
  skills?: string[];
  clientEventId?: string;
  origin?: string;
  correlationId?: string;
  directory?: string;
  sourceId?: string;
  worktreeId?: string;
  isolation?: RunIsolation;
  triggerKind?: RunTriggerKind;
  branch?: string;
  attribution?: RunAttribution;
}

export type CompactSkipReason =
  | 'no-context-window'
  | 'invalid-output-reserve'
  | 'empty-history'
  | 'resume-pending'
  | 'already-covered'
  | 'no-cut-plan'
  | 'hook-blocked'
  | 'empty-window';

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
  abstract sessionFor(orgId: string, threadId: string): Promise<SessionHandle>;
  abstract send(input: SendLocalRunInput): Promise<AcceptedRunResponse>;
  abstract compact(orgId: string, threadId: string): Promise<CompactThreadResult>;
  abstract drainMessageQueue(orgId: string, threadId: string): Promise<ThreadQueueDrainResult>;
  abstract cancel(orgId: string, runId: string): Promise<CancelRunResponse>;
  abstract retry(orgId: string, runId: string): Promise<RetryRunResponse>;
  abstract truncateThreadFrom(
    orgId: string,
    threadId: string,
    runId: string,
    seq: number,
  ): Promise<TruncateThreadResult>;
  abstract removeThreadEvent(
    orgId: string,
    threadId: string,
    runId: string,
    seq: number,
  ): Promise<SessionEvent>;
  abstract stream(
    orgId: string,
    runId: string,
    fromSeq?: number,
  ): Promise<AsyncIterable<SessionEvent>>;
  abstract publishEvents(orgId: string, runId: string, events: SessionEvent[]): Promise<void>;
  abstract tickWaitTimers(orgId: string): Promise<number>;
  abstract countWaitingTimers(orgId: string): Promise<number>;
  abstract listMcpServers(orgId: string): Promise<McpServerInfo[]>;
  abstract invalidateRuntime(orgId: string): Promise<void>;
}
