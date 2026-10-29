import { randomUUID } from 'node:crypto';
import type { FleetContentProxyPort } from '../../domain/fleet/fleet-content-proxy.port.ts';
import type { IssueBoardRecord } from '../../domain/issue/board.ts';
import {
  IssueExecutionActiveException,
  IssueHandoffBlockedException,
} from '../../domain/issue/issue.error.ts';
import type { IssueFireReason, IssueRecord } from '../../domain/issue/issue.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import type { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import {
  decideIssueReservation,
  isOwnIssueExecutionTransition,
  issueExecutionCorrelationId,
} from '../../domain/issue/issue-execution.ts';
import type { IssueFirePort } from '../../domain/issue/issue-fire.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import type { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import type { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import {
  blockedWorktreeNotificationText,
  checkoutSiblingNotificationText,
  type IssueWorkspaceResolution,
  pickCheckoutSibling,
  resolveIssueWorkspace,
} from './issue-dispatch-support.ts';
import { type IssueWorktreeBinding, observeWorktreeBinding } from './issue-worktree-binding.ts';

export interface DispatchIssueExecutionInput {
  orgId: string;
  issue: IssueRecord;
  board: IssueBoardRecord;
  statusKey: string;
  agentId: string;
  actorAgentId?: string | null;
  reason: IssueFireReason;
  matchedLabelId: string | null;
  ownerUserId?: string | null;
  ruleId?: string | null;
  issueRuleProfileId?: string | null;
  profileId?: string | null;
  onReserved?: () => void;
  executions: IssueExecutionPort;
  fire: IssueFirePort;
  issues: IssueRepositoryPort;
  sources: SourceRegistryPort;
  materializations: SourceMaterializationPort;
  events: IssueEventsPort;
  worktrees: RepositoryWorktreePort;
  machineConfig: MachineConfigPort;
  layout: HostFsLayoutPort;
  driver: SourceDriverPort;
  contentProxy?: FleetContentProxyPort;
}

export type DispatchIssueExecutionResult =
  | { kind: 'blocked' }
  | { kind: 'idempotent' }
  | { kind: 'dispatched'; runId: string | null; outcome: string };

export async function dispatchIssueExecution(
  input: DispatchIssueExecutionInput,
): Promise<DispatchIssueExecutionResult> {
  const correlationId = issueExecutionCorrelationId(input.issue.id, input.statusKey, input.agentId);
  const workspace = await resolveIssueWorkspace({
    orgId: input.orgId,
    localHostId: input.machineConfig.get().id,
    issue: input.issue,
    sources: input.sources,
    worktrees: input.worktrees,
    materializations: input.materializations,
    layout: input.layout,
    driver: input.driver,
  });
  if (workspace.plan === 'blocked') {
    input.events.emit(input.orgId, {
      type: 'rule-notification',
      boardId: input.board.id,
      issueId: input.issue.id,
      text: blockedWorktreeNotificationText(workspace.branch ?? ''),
    });
    return { kind: 'blocked' };
  }
  const observation = await resolveObservation(input, workspace);
  if (reserveDecision(input, correlationId, observation) === 'idempotent') {
    return { kind: 'idempotent' };
  }
  if (workspace.plan === 'checkout') {
    emitCheckoutWarning(input, workspace);
  }

  const now = new Date().toISOString();
  const reserved = input.executions.reserve({
    id: randomUUID(),
    orgId: input.orgId,
    issueId: input.issue.id,
    agentId: input.agentId,
    correlationId,
    requestedStatus: input.statusKey,
    ruleId: input.ruleId ?? null,
    profileId: input.profileId ?? null,
    worktreeId: observation?.worktreeId ?? null,
    createdAt: now,
    updatedAt: now,
  });
  input.onReserved?.();
  try {
    return await fireReservedExecution({
      input,
      reservedId: reserved.id,
      binding: observation,
      sourceId: workspace.plan === 'unbound' ? null : workspace.sourceId,
      branch: workspace.plan === 'checkout' ? workspace.branch : null,
      correlationId,
    });
  } catch (error) {
    input.executions.release(input.orgId, reserved.id, new Date().toISOString());
    throw error;
  }
}

async function resolveObservation(
  input: DispatchIssueExecutionInput,
  workspace: IssueWorkspaceResolution,
): Promise<IssueWorktreeBinding | null> {
  if (workspace.worktree === null) {
    return null;
  }
  return observeWorktreeBinding(
    {
      orgId: input.orgId,
      machineConfig: input.machineConfig,
      layout: input.layout,
      driver: input.driver,
      ...(input.contentProxy ? { contentProxy: input.contentProxy } : {}),
    },
    workspace.worktree,
  );
}

type ReservationDecision = ReturnType<typeof decideIssueReservation>;

function reserveDecision(
  input: DispatchIssueExecutionInput,
  correlationId: string,
  observation: IssueWorktreeBinding | null,
): 'ready' | 'idempotent' {
  const existing = input.executions.findActiveByIssue(input.orgId, input.issue.id);
  const ownTransition =
    existing !== null &&
    isOwnIssueExecutionTransition({
      existing,
      actorAgentId: input.actorAgentId,
      correlationId,
    });
  const decision = decideIssueReservation({
    existing: ownTransition ? null : existing,
    correlationId,
    handoffObservation: observation
      ? { dirty: observation.dirty, unpushed: observation.unpushed }
      : null,
    checkHandoff: observation !== null && (existing === null || ownTransition),
  });
  assertDecisionDispatchable(decision, input.issue.id);
  if (decision.kind === 'idempotent') {
    return 'idempotent';
  }
  if (ownTransition && existing) {
    input.executions.release(input.orgId, existing.id, new Date().toISOString());
  }
  return 'ready';
}

function assertDecisionDispatchable(decision: ReservationDecision, issueId: string): void {
  if (decision.kind === 'conflict') {
    throw new IssueExecutionActiveException(issueId, decision.execution.id);
  }
  if (decision.kind === 'handoff-blocked') {
    throw new IssueHandoffBlockedException(issueId, decision.reason);
  }
}

function emitCheckoutWarning(
  input: DispatchIssueExecutionInput,
  workspace: IssueWorkspaceResolution,
): void {
  const sibling = pickCheckoutSibling(
    input.issues.listByOrg(input.orgId),
    input.issue,
    workspace.sourceId,
    workspace.branch,
  );
  if (sibling === null) {
    return;
  }
  input.events.emit(input.orgId, {
    type: 'rule-notification',
    boardId: input.board.id,
    issueId: input.issue.id,
    text: checkoutSiblingNotificationText(sibling, workspace.branch ?? ''),
  });
}

async function fireReservedExecution(args: {
  input: DispatchIssueExecutionInput;
  reservedId: string;
  binding: IssueWorktreeBinding | null;
  sourceId: string | null;
  branch: string | null;
  correlationId: string;
}): Promise<DispatchIssueExecutionResult> {
  const { input, reservedId, binding, sourceId, branch, correlationId } = args;
  if (binding) {
    input.executions.setWorktree(
      input.orgId,
      reservedId,
      binding.worktreeId,
      new Date().toISOString(),
    );
  }
  const fired = await input.fire.fire({
    orgId: input.orgId,
    issueId: input.issue.id,
    agentId: input.agentId,
    statusKey: input.statusKey,
    reason: input.reason,
    matchedLabelId: input.matchedLabelId,
    ownerUserId: input.ownerUserId ?? null,
    correlationId,
    issueRuleProfileId: input.issueRuleProfileId ?? null,
    ...(sourceId !== null ? { sourceId } : {}),
    ...(branch !== null ? { branch } : {}),
    ...(binding ? { worktreeId: binding.worktreeId } : {}),
  });
  if (fired.outcome === 'fired') {
    input.executions.activate(input.orgId, reservedId, fired.runId, new Date().toISOString());
    return { kind: 'dispatched', runId: fired.runId, outcome: fired.outcome };
  }
  input.executions.release(input.orgId, reservedId, new Date().toISOString());
  return { kind: 'dispatched', runId: null, outcome: fired.outcome };
}
