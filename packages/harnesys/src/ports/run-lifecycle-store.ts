import type { PendingSessionEvent } from './run-event-store.ts';
export type RunLifecycleStatus =
  | 'queued'
  | 'running'
  | 'needs_input'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'dead_lettered';
export { RUN_NON_TERMINAL } from '../constants.ts';
export type RunVia = 'direct' | 'agent';
export interface RunAttribution {
  startedByUserId?: string;
  via: RunVia;
  onNodeId?: string | null;
}
export interface RunRecord {
  runId: string;
  threadId: string;
  status: RunLifecycleStatus;
  interruptId?: string;
  waitFireAt?: number;
  parentRunId?: string;
  attempt: number;
  leaseInstanceId?: string;
  leaseExpiresAt?: number;
  leaseEpoch: number;
  lastSeq: number;
  createdAt: string;
  updatedAt: string;
  attribution?: RunAttribution;
}
export interface RunCreateInput {
  runId: string;
  threadId: string;
  parentRunId?: string;
  attribution?: RunAttribution;
}
export interface RunTransitionPatch {
  from: RunLifecycleStatus;
  to: RunLifecycleStatus;
  interruptId?: string | null;
  waitFireAt?: number | null;
  advanceAttempt?: boolean;
  events?: PendingSessionEvent[];
}
export interface RunLifecycleStore {
  create(run: RunCreateInput, events?: PendingSessionEvent[]): Promise<RunRecord>;
  get(runId: string): Promise<RunRecord | null>;
  activeByThread(threadId: string): Promise<RunRecord | null>;
  childrenByParent(parentRunId: string): Promise<RunRecord[]>;
  claim(runId: string, instanceId: string, ttlMs: number): Promise<RunRecord | null>;
  transition(runId: string, expectedEpoch: number, patch: RunTransitionPatch): Promise<RunRecord>;
  renewLease(runId: string, instanceId: string, ttlMs: number): Promise<boolean>;
  listClaimable(opts?: { limit?: number; before?: string }): Promise<RunRecord[]>;
  listDueTimers(opts?: { limit?: number; now?: number }): Promise<RunRecord[]>;
  listStaleRunning(opts?: { limit?: number; now?: number; graceMs?: number }): Promise<RunRecord[]>;
}
