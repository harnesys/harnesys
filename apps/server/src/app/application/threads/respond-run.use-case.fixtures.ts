import type { RunRecord } from 'harnesys';
import type { ApprovalRecord } from '../../domain/approval/approval.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';

export const ORG = 'org-1';
export const THREAD_ID = 'thread-1';
export const RUN_ID = 'run-1';
export const ASK_ID = 'ask/1/0';
export const APPROVAL_ID = 'approval-1';

export function makeThread(): ThreadRecord {
  return {
    id: THREAD_ID,
    orgId: ORG,
    agentId: 'agent-1',
    originAgentId: 'agent-1',
    title: 'test',
    kind: 'chat',
    parentThreadId: null,
    forkAt: null,
    inheritedEventCount: 0,
    metadata: {},
    runProfileId: null,
    runDirectory: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastReadAt: new Date().toISOString(),
  };
}

export function makeApproval(overrides: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    id: APPROVAL_ID,
    runId: RUN_ID,
    agentId: 'agent-1',
    threadId: THREAD_ID,
    interruptId: ASK_ID,
    kind: 'tool',
    question: 'allow?',
    options: ['approve', 'approve_once', 'deny'],
    context: { source: 'permission', ops: ['fs.write'] },
    status: 'pending',
    decidedBy: null,
    decidedAt: null,
    decisionSeq: 0,
    resumeState: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function makeRunRecord(): RunRecord {
  return {
    runId: RUN_ID,
    threadId: THREAD_ID,
    status: 'needs_input' as const,
    leaseEpoch: 0,
    attempt: 0,
    lastSeq: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
