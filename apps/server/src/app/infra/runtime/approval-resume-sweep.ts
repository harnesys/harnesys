import type { Logger } from '@harnesys/brix';
import type { SessionHandle } from 'harnesys';
import { resumePayloadOf } from '../../application/approvals/decide-approval.use-case.ts';
import type { ApprovalRecord, ApprovalResumePlan } from '../../domain/approval/approval.ts';
import type { ApprovalEventsPort } from '../../domain/approval/approval-events.port.ts';
import type { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import type { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import type { NodeCommandQueuePort } from '../../domain/fleet/node-command-queue.port.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { runStatusOf } from './approval-reconcile.ts';

const RESUME_AFTER_MS = 10_000;
const RESUME_LIMIT = 25;
const REENQUEUE_COOLDOWN_MS = 60_000;

const TERMINAL_RUN_STATUSES: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'cancelled',
  'dead_lettered',
]);

export interface ApprovalResumeSweepDeps {
  db: OrgSqliteDb;
  orgId: string;
  approvals: ApprovalStorePort;
  claims: EventClaimPort;
  commands: NodeCommandQueuePort;
  sessionFor: (threadId: string) => Promise<SessionHandle>;
  approvalEvents?: ApprovalEventsPort;
  logger?: Logger;
}

export interface ApprovalResumeSweep {
  sweep: () => Promise<void>;
}

export function createApprovalResumeSweep(deps: ApprovalResumeSweepDeps): ApprovalResumeSweep {
  const enqueuedAt = new Map<string, number>();
  return {
    sweep: () => sweepDecided(deps, enqueuedAt),
  };
}

async function sweepDecided(
  deps: ApprovalResumeSweepDeps,
  enqueuedAt: Map<string, number>,
): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - RESUME_AFTER_MS).toISOString();
    const decided = deps.approvals.listResumable(deps.orgId, cutoff, RESUME_LIMIT);
    for (const approval of decided) {
      await resumeDecided(deps, enqueuedAt, approval);
    }
  } catch (error) {
    deps.logger?.warn({ error, orgId: deps.orgId }, 'approval resume sweep failed');
  }
}

async function resumeDecided(
  deps: ApprovalResumeSweepDeps,
  enqueuedAt: Map<string, number>,
  approval: ApprovalRecord,
): Promise<void> {
  const status = runStatusOf(deps.db, approval.runId);
  if (status === undefined || deps.approvals.get(deps.orgId, approval.id) === null) {
    return;
  }
  if (TERMINAL_RUN_STATUSES.has(status)) {
    cancelDecided(deps, approval, status);
    return;
  }
  const now = new Date().toISOString();
  const claim = deps.claims.findByRun(deps.orgId, approval.runId);
  if (claim !== null && claim.doneAt === null && claim.leaseUntil > now) {
    reenqueueResume(deps, enqueuedAt, approval, claim.nodeId);
    return;
  }
  await respondLocally(deps, approval);
}

function cancelDecided(
  deps: ApprovalResumeSweepDeps,
  approval: ApprovalRecord,
  status: string,
): void {
  const record = deps.approvals.markResumeCancelled(deps.orgId, approval.id);
  if (record === null) {
    return;
  }
  deps.logger?.info(
    { orgId: deps.orgId, runId: approval.runId, approvalId: approval.id, runStatus: status },
    'approval resume sweep: decided approval on a terminal run was cancelled',
  );
  deps.approvalEvents?.emit(deps.orgId, { type: 'cancelled', approval: record });
}

function reenqueueResume(
  deps: ApprovalResumeSweepDeps,
  enqueuedAt: Map<string, number>,
  approval: ApprovalRecord,
  nodeId: string,
): void {
  const last = enqueuedAt.get(approval.id) ?? 0;
  if (Date.now() - last < REENQUEUE_COOLDOWN_MS) {
    return;
  }
  if (hasQueuedResume(deps, nodeId, approval)) {
    return;
  }
  const plan = planOf(approval);
  deps.commands.enqueue(deps.orgId, nodeId, {
    type: 'APPROVAL_RESUME',
    approvalId: approval.id,
    runId: approval.runId,
    interruptId: approval.interruptId,
    decision: plan.decision,
    ...(plan.extend === undefined ? {} : { extend: plan.extend }),
    ...(plan.scope === undefined ? {} : { scope: plan.scope }),
    ...(approval.context.note === undefined ? {} : { note: approval.context.note }),
  });
  enqueuedAt.set(approval.id, Date.now());
  deps.logger?.info(
    { orgId: deps.orgId, runId: approval.runId, approvalId: approval.id, nodeId },
    'approval resume sweep: re-enqueued APPROVAL_RESUME for an undelivered decision',
  );
}

function hasQueuedResume(
  deps: ApprovalResumeSweepDeps,
  nodeId: string,
  approval: ApprovalRecord,
): boolean {
  return deps.commands
    .list(deps.orgId, nodeId)
    .some(
      (entry) =>
        entry.command.type === 'APPROVAL_RESUME' && entry.command.approvalId === approval.id,
    );
}

async function respondLocally(
  deps: ApprovalResumeSweepDeps,
  approval: ApprovalRecord,
): Promise<void> {
  if (approval.threadId === null) {
    return;
  }
  try {
    const session = await deps.sessionFor(approval.threadId);
    const plan = planOf(approval);
    if (plan.decision === 'deny') {
      await session.reject(approval.runId, approval.interruptId, { note: approval.context.note });
    } else {
      await session.respond(
        approval.runId,
        approval.interruptId,
        resumePayloadOf(plan.decision, plan.extend, plan.scope),
      );
    }
    markApplied(deps, approval);
  } catch (err) {
    const code = (err as { code?: string }).code ?? 'unknown';
    if (code === 'already_resumed') {
      markApplied(deps, approval);
      deps.logger?.info(
        { orgId: deps.orgId, runId: approval.runId, approvalId: approval.id },
        'approval resume sweep: interrupt was already resumed elsewhere',
      );
      return;
    }
    deps.logger?.warn(
      { err, orgId: deps.orgId, runId: approval.runId, approvalId: approval.id, code },
      'approval resume sweep: local respond failed, decision stays decided',
    );
  }
}

function markApplied(deps: ApprovalResumeSweepDeps, approval: ApprovalRecord): void {
  const record = deps.approvals.markResumeApplied(deps.orgId, approval.id);
  if (record === null) {
    return;
  }
  deps.approvalEvents?.emit(deps.orgId, { type: 'decided', approval: record });
}

function planOf(approval: ApprovalRecord): ApprovalResumePlan {
  const resume = approval.context.resume;
  if (resume !== undefined) {
    return resume;
  }
  return { decision: approval.status === 'denied' ? 'deny' : 'approve' };
}
