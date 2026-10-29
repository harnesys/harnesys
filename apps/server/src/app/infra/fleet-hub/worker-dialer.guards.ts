import { type TaskEnvelope, TaskEnvelopeSchema } from '@harnesys/contracts';

export function isRunPlaceCommand(
  value: unknown,
): value is { type: 'RUN_PLACE'; envelope: TaskEnvelope } {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record.type !== 'RUN_PLACE') {
    return false;
  }
  const parsed = TaskEnvelopeSchema.safeParse(record.envelope);
  if (!parsed.success) {
    return false;
  }
  (record as { envelope: TaskEnvelope }).envelope = parsed.data;
  return true;
}

export function isWorkCancelCommand(
  value: unknown,
): value is { type: 'WORK_CANCEL'; runId: string } {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.type === 'WORK_CANCEL' && typeof record.runId === 'string';
}

export function isWorkAskResumeCommand(value: unknown): value is {
  type: 'WORK_ASK_RESUME';
  runId: string;
  askId: string;
  action: 'respond' | 'reject';
  payload?: unknown;
  note?: string;
  clientEventId?: string;
  threadId?: string;
  relayLastSeq?: number;
  leaseEpoch?: number;
} {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.type === 'WORK_ASK_RESUME' &&
    typeof record.runId === 'string' &&
    typeof record.askId === 'string' &&
    (record.action === 'respond' || record.action === 'reject') &&
    (record.note === undefined || typeof record.note === 'string') &&
    (record.clientEventId === undefined || typeof record.clientEventId === 'string') &&
    (record.threadId === undefined || typeof record.threadId === 'string') &&
    (record.relayLastSeq === undefined || typeof record.relayLastSeq === 'number') &&
    (record.leaseEpoch === undefined || typeof record.leaseEpoch === 'number')
  );
}

export function isApprovalResumeCommand(value: unknown): value is {
  type: 'APPROVAL_RESUME';
  approvalId: string;
  runId: string;
  interruptId: string;
  decision: 'approve' | 'approve_once' | 'deny';
  scope?: 'once' | 'run' | 'always';
  note?: string;
} {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.type === 'APPROVAL_RESUME' &&
    typeof record.approvalId === 'string' &&
    typeof record.runId === 'string' &&
    typeof record.interruptId === 'string' &&
    (record.decision === 'approve' ||
      record.decision === 'approve_once' ||
      record.decision === 'deny') &&
    (record.scope === undefined ||
      record.scope === 'once' ||
      record.scope === 'run' ||
      record.scope === 'always') &&
    (record.note === undefined || typeof record.note === 'string')
  );
}

export function isSourceMaterializeCommand(value: unknown): value is {
  type: 'SOURCE_MATERIALIZE';
  operationId: string;
  sourceId: string;
  sourceRevision: number;
  projectionRevision: number;
  worktreeId?: string;
  secretName?: string;
} {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.type === 'SOURCE_MATERIALIZE' &&
    typeof record.operationId === 'string' &&
    typeof record.sourceId === 'string' &&
    typeof record.sourceRevision === 'number' &&
    typeof record.projectionRevision === 'number' &&
    (record.worktreeId === undefined || typeof record.worktreeId === 'string') &&
    (record.secretName === undefined || typeof record.secretName === 'string')
  );
}

export function isSourceAttachCommand(value: unknown): value is {
  type: 'SOURCE_ATTACH';
  operationId: string;
  sourceId: string;
  localPath: string;
  revision: number;
} {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.type === 'SOURCE_ATTACH' &&
    typeof record.operationId === 'string' &&
    typeof record.sourceId === 'string' &&
    typeof record.localPath === 'string' &&
    typeof record.revision === 'number'
  );
}

export function isSourceRefreshCommand(value: unknown): value is {
  type: 'SOURCE_REFRESH';
  operationId: string;
  sourceId: string;
  sourceRevision: number;
  projectionRevision: number;
  worktreeId?: string;
  secretName?: string;
} {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.type === 'SOURCE_REFRESH' &&
    typeof record.operationId === 'string' &&
    typeof record.sourceId === 'string' &&
    typeof record.sourceRevision === 'number' &&
    typeof record.projectionRevision === 'number' &&
    (record.worktreeId === undefined || typeof record.worktreeId === 'string') &&
    (record.secretName === undefined || typeof record.secretName === 'string')
  );
}

export function isSourceWorktreeCreateCommand(value: unknown): value is {
  type: 'SOURCE_WORKTREE_CREATE';
  operationId: string;
  sourceId: string;
  sourceRevision: number;
  worktreeId: string;
  branch: string;
  createBranch: boolean;
  from?: string;
} {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.type === 'SOURCE_WORKTREE_CREATE' &&
    typeof record.operationId === 'string' &&
    typeof record.sourceId === 'string' &&
    typeof record.sourceRevision === 'number' &&
    typeof record.worktreeId === 'string' &&
    typeof record.branch === 'string' &&
    typeof record.createBranch === 'boolean'
  );
}

export function isSourceWorktreeRemoveCommand(value: unknown): value is {
  type: 'SOURCE_WORKTREE_REMOVE';
  operationId: string;
  sourceId: string;
  sourceRevision: number;
  worktreeId: string;
} {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.type === 'SOURCE_WORKTREE_REMOVE' &&
    typeof record.operationId === 'string' &&
    typeof record.sourceId === 'string' &&
    typeof record.sourceRevision === 'number' &&
    typeof record.worktreeId === 'string'
  );
}

export function isNodeRemovedCommand(
  value: unknown,
): value is { type: 'NODE_REMOVED'; orgId: string } {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.type === 'NODE_REMOVED' && typeof record.orgId === 'string';
}

export function isOrgDeletedCommand(
  value: unknown,
): value is { type: 'ORG_DELETED'; orgId: string } {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.type === 'ORG_DELETED' && typeof record.orgId === 'string';
}
