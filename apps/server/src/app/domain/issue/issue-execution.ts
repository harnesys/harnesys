export type IssueExecutionState = 'reserved' | 'active' | 'handoff' | 'released';

export const ISSUE_EXECUTION_ACTIVE_STATES: readonly IssueExecutionState[] = [
  'reserved',
  'active',
  'handoff',
];

export interface IssueExecution {
  id: string;
  orgId: string;
  issueId: string;
  runId: string | null;
  agentId: string;
  worktreeId: string | null;
  correlationId: string;
  leaseEpoch: number;
  state: IssueExecutionState;
  requestedStatus: string;
  ruleId: string | null;
  profileId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssueHandoffBlockers {
  activeRun: boolean;
  dirty: boolean;
  unpushed: boolean;
}

export type IssueReservationDecision =
  | { kind: 'proceed' }
  | { kind: 'idempotent'; execution: IssueExecution }
  | { kind: 'conflict'; execution: IssueExecution }
  | { kind: 'handoff-blocked'; blockers: IssueHandoffBlockers; reason: string };

export function isActiveIssueExecutionState(state: IssueExecutionState): boolean {
  return ISSUE_EXECUTION_ACTIVE_STATES.includes(state);
}

export function issueExecutionCorrelationId(
  issueId: string,
  status: string,
  agentId: string,
): string {
  return `issue:${issueId}:${status}:${agentId}`;
}

export function issueHandoffBlockers(input: {
  hasActiveExecution: boolean;
  dirty: boolean;
  unpushed: boolean;
}): IssueHandoffBlockers {
  return {
    activeRun: input.hasActiveExecution,
    dirty: input.dirty,
    unpushed: input.unpushed,
  };
}

export function canIssueHandoff(blockers: IssueHandoffBlockers): boolean {
  return !blockers.activeRun && !blockers.dirty && !blockers.unpushed;
}

export function explainIssueHandoffBlock(blockers: IssueHandoffBlockers): string | null {
  if (canIssueHandoff(blockers)) {
    return null;
  }
  const reasons: string[] = [];
  if (blockers.activeRun) {
    reasons.push('active run');
  }
  if (blockers.dirty) {
    reasons.push('uncommitted changes');
  }
  if (blockers.unpushed) {
    reasons.push('unpushed commits');
  }
  return `issue handoff blocked: ${reasons.join(', ')}`;
}

export function decideIssueReservation(input: {
  existing: IssueExecution | null;
  correlationId: string;
  handoffObservation: { dirty: boolean; unpushed: boolean } | null;
  checkHandoff: boolean;
}): IssueReservationDecision {
  const { existing } = input;
  if (existing && isActiveIssueExecutionState(existing.state)) {
    if (existing.correlationId === input.correlationId) {
      return { kind: 'idempotent', execution: existing };
    }
    return { kind: 'conflict', execution: existing };
  }
  if (input.checkHandoff && input.handoffObservation) {
    const blockers = issueHandoffBlockers({
      hasActiveExecution: false,
      dirty: input.handoffObservation.dirty,
      unpushed: input.handoffObservation.unpushed,
    });
    if (!canIssueHandoff(blockers)) {
      return {
        kind: 'handoff-blocked',
        blockers,
        reason: explainIssueHandoffBlock(blockers) ?? 'issue handoff blocked',
      };
    }
  }
  return { kind: 'proceed' };
}

export function isOwnIssueExecutionTransition(input: {
  existing: IssueExecution;
  actorAgentId: string | null | undefined;
  correlationId: string;
}): boolean {
  return (
    input.actorAgentId !== null &&
    input.actorAgentId !== undefined &&
    isActiveIssueExecutionState(input.existing.state) &&
    input.existing.agentId === input.actorAgentId &&
    input.existing.correlationId !== input.correlationId
  );
}

export type IssueExecutionReconcileAction =
  | { kind: 'keep' }
  | { kind: 'release'; reason: 'terminal-run' | 'reserved-stale' };

export function reconcileIssueExecution(input: {
  execution: IssueExecution;
  runStatus: string | null;
  startup?: boolean;
}): IssueExecutionReconcileAction {
  if (input.execution.state === 'released') {
    return { kind: 'keep' };
  }
  if (input.execution.state === 'reserved' && !input.execution.runId) {
    return input.startup === true
      ? { kind: 'release', reason: 'reserved-stale' }
      : { kind: 'keep' };
  }
  if (!input.execution.runId || input.runStatus === null) {
    return { kind: 'keep' };
  }
  if (
    input.runStatus === 'completed' ||
    input.runStatus === 'failed' ||
    input.runStatus === 'cancelled'
  ) {
    return { kind: 'release', reason: 'terminal-run' };
  }
  return { kind: 'keep' };
}
