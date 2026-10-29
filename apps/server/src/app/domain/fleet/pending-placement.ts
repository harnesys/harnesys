import type { RunAttribution } from 'harnesys';

export type PlacementTriggerKind = 'chat' | 'issue' | 'schedule' | 'webhook' | 'connector';

export interface PlacementTrigger {
  kind: PlacementTriggerKind;
  id: string;
}

export interface PendingPlacementPayload {
  agentId: string;
  text: string;
  attribution?: RunAttribution;
  effort?: string;
  mode?: string;
  skills?: string[];
  attachmentMetas?: Array<{
    id: string;
    name: string;
    mediaType: string;
    sizeBytes: number;
    kind: 'image' | 'audio' | 'video' | 'file';
  }>;
  clientEventId?: string;
  correlationId?: string;
  sourceId?: string;
  worktreeId?: string;
  worktreeHostId?: string;
  issueRuleProfileId?: string;
  profileSource?: 'thread' | 'issue-rule' | 'agent' | 'organization';
}

export interface PendingPlacement {
  runId: string;
  orgId: string;
  threadId: string;
  profileId: string;
  configRevision: number;
  createdAt: string;
  lastReason: string;
  attempt: number;
  priority: number;
  trigger: PlacementTrigger;
  expiresAt: string | null;
  payload: PendingPlacementPayload;
  lastCandidatesJson: string;
}

export const PLACEMENT_PRIORITY_AGING_MS = 30 * 60_000;

export function effectivePriority(priority: number, createdAt: string, nowMs: number): number {
  const ageSteps = Math.floor((nowMs - Date.parse(createdAt)) / PLACEMENT_PRIORITY_AGING_MS);
  if (!Number.isFinite(ageSteps) || ageSteps <= 0) {
    return Math.min(4, Math.max(1, priority));
  }
  return Math.max(1, priority - ageSteps);
}

export function comparePendingPlacements(
  left: PendingPlacement,
  right: PendingPlacement,
  nowMs: number,
): number {
  const leftPriority = sortPriority(left, nowMs);
  const rightPriority = sortPriority(right, nowMs);
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }
  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? -1 : 1;
  }
  if (left.runId < right.runId) {
    return -1;
  }
  if (left.runId > right.runId) {
    return 1;
  }
  return 0;
}

export function sortPendingPlacements(rows: PendingPlacement[], nowMs: number): PendingPlacement[] {
  return [...rows].sort((left, right) => comparePendingPlacements(left, right, nowMs));
}

export type PendingReconcileAction =
  | { kind: 'noop' }
  | { kind: 'delete' }
  | { kind: 'reenqueue'; nodeId: string; leaseEpoch: number }
  | { kind: 'resolve' };

export interface PendingReconcileInput {
  runStatus: string | null;
  pending: PendingPlacement | null;
  claim: { nodeId: string; leaseEpoch: number; doneAt: string | null; leaseUntil: string } | null;
  hasCommand: boolean;
  nowIso: string;
}

export function decidePendingReconcile(input: PendingReconcileInput): PendingReconcileAction {
  if (!input.pending) {
    return { kind: 'noop' };
  }
  if (
    input.runStatus === null ||
    input.runStatus === 'completed' ||
    input.runStatus === 'failed' ||
    input.runStatus === 'cancelled' ||
    input.runStatus === 'dead_lettered' ||
    input.runStatus === 'running' ||
    input.runStatus === 'needs_input'
  ) {
    return { kind: 'delete' };
  }
  if (input.pending.expiresAt !== null && input.pending.expiresAt <= input.nowIso) {
    return { kind: 'delete' };
  }
  if (input.claim && input.claim.doneAt === null && input.claim.leaseUntil > input.nowIso) {
    if (!input.hasCommand) {
      return {
        kind: 'reenqueue',
        nodeId: input.claim.nodeId,
        leaseEpoch: input.claim.leaseEpoch,
      };
    }
    return { kind: 'noop' };
  }
  return { kind: 'resolve' };
}

export function upsertPendingPlacement(
  existing: PendingPlacement | null,
  next: PendingPlacement,
): PendingPlacement {
  if (!existing || existing.runId !== next.runId) {
    return next;
  }
  return {
    ...existing,
    profileId: next.profileId,
    configRevision: next.configRevision,
    lastReason: next.lastReason,
    attempt: existing.attempt,
    priority: next.priority,
    trigger: next.trigger,
    expiresAt: next.expiresAt ?? existing.expiresAt,
    payload: next.payload,
    lastCandidatesJson: next.lastCandidatesJson,
  };
}

function sortPriority(row: PendingPlacement, nowMs: number): number {
  if (row.trigger.kind === 'issue') {
    return effectivePriority(row.priority, row.createdAt, nowMs);
  }
  return Math.min(4, Math.max(1, row.priority));
}
