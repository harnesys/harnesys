import type { ApprovalDecisionScope, TaskEnvelope } from '@harnesys/contracts';

export type WorkerCommand =
  | {
      type: 'HTTP_PROXY';
      requestId: string;
      method: string;
      path: string;
      body?: string | null;
      contentType?: string | null;
    }
  | {
      type: 'RUN_PLACE';
      envelope: TaskEnvelope;
    }
  | {
      type: 'WORK_CANCEL';
      runId: string;
    }
  | {
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
    }
  | {
      type: 'APPROVAL_RESUME';
      approvalId: string;
      runId: string;
      interruptId: string;
      decision: 'approve' | 'approve_once' | 'deny' | 'close';
      extend?: number;
      scope?: ApprovalDecisionScope;
      note?: string;
    }
  | {
      type: 'NODE_DRAIN';
    }
  | {
      type: 'NODE_RESUME';
    }
  | {
      type: 'NODE_REMOVED';
      orgId: string;
    }
  | {
      type: 'ORG_DELETED';
      orgId: string;
    }
  | {
      type: 'SOURCE_MATERIALIZE';
      operationId: string;
      sourceId: string;
      sourceRevision: number;

      projectionRevision: number;
      worktreeId?: string;

      secretName?: string;
    }
  | {
      type: 'SOURCE_ATTACH';
      operationId: string;
      sourceId: string;
      localPath: string;
      revision: number;
    }
  | {
      type: 'SOURCE_REFRESH';
      operationId: string;
      sourceId: string;
      sourceRevision: number;
      projectionRevision: number;
      worktreeId?: string;

      secretName?: string;
    }
  | {
      type: 'SOURCE_WORKTREE_CREATE';
      operationId: string;
      sourceId: string;
      sourceRevision: number;
      worktreeId: string;
      branch: string;
      createBranch: boolean;
      from?: string;
    }
  | {
      type: 'SOURCE_WORKTREE_REMOVE';
      operationId: string;
      sourceId: string;
      sourceRevision: number;
      worktreeId: string;
    };

export function isQueueableCommand(command: WorkerCommand): boolean {
  return (
    command.type === 'RUN_PLACE' ||
    command.type === 'WORK_CANCEL' ||
    command.type === 'WORK_ASK_RESUME' ||
    command.type === 'APPROVAL_RESUME' ||
    command.type === 'NODE_RESUME' ||
    command.type === 'SOURCE_MATERIALIZE' ||
    command.type === 'SOURCE_ATTACH' ||
    command.type === 'SOURCE_REFRESH' ||
    command.type === 'SOURCE_WORKTREE_CREATE' ||
    command.type === 'SOURCE_WORKTREE_REMOVE'
  );
}
