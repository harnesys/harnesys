import type { Logger } from '@harnesys/brix';
import type { IssueBlockerRef, IssueFireSuppression } from '@harnesys/contracts';
import type { SignalWakePort } from 'harnesys';
import type { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import type { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { LOCAL_EXECUTION_PROFILE_ID } from '../../domain/execution-profile/execution-profile.ts';
import type { IssueBoardRecord } from '../../domain/issue/board.ts';
import type { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { hasOpenBlockers } from '../../domain/issue/dependency-cycle.ts';
import type { IssueRecord } from '../../domain/issue/issue.ts';
import type { IssueDependencyRepositoryPort } from '../../domain/issue/issue-dependency-repository.port.ts';
import type { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import type { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import type { IssueFirePort } from '../../domain/issue/issue-fire.port.ts';
import type { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import type { IssueLabelRepositoryPort } from '../../domain/issue/label-repository.port.ts';
import {
  applyLabelMutations,
  type ResolvedFire,
  resolveFire,
} from '../../domain/issue/resolve-fire.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import type { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import type { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import type { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import type { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { resolveEffectiveProfile } from '../execution-profile/resolve-effective-profile.ts';
import { applyResolvedWakes } from './apply-resolved-wakes.ts';
import { dispatchIssueExecution } from './dispatch-issue-execution.ts';
import { engineRefs, issueClosedChecker } from './issue-rule-support.ts';
import { persistRuleOutcome } from './persist-rule-outcome.ts';

export interface IssueRuleFireDeps {
  issues: IssueRepositoryPort;
  boards: IssueBoardRepositoryPort;
  dependencies: IssueDependencyRepositoryPort;
  agents: AgentRegistryPort;
  labels: IssueLabelRepositoryPort;
  executions: IssueExecutionPort;
  fire: IssueFirePort;
  events: IssueEventsPort;
  sources: SourceRegistryPort;
  profiles: ExecutionProfilePort;
  worktrees: RepositoryWorktreePort;
  machineConfig: MachineConfigPort;
  layout: HostFsLayoutPort;
  driver: SourceDriverPort;
  materializations: SourceMaterializationPort;
  wake: SignalWakePort;
  log: Logger;
}

export interface IssueFireResult {
  issue: IssueRecord;
  fireSuppressed: IssueFireSuppression | null;
}

const FIRE_SUPPRESSION_MESSAGE =
  'no agent was fired: open blockers suppress agent firing (an explicit assignee included); the status change itself was applied';

export function openBlockerRefs(input: {
  orgId: string;
  issueId: string;
  ports: Pick<IssueRuleFireDeps, 'issues' | 'dependencies' | 'boards'>;
}): IssueBlockerRef[] {
  const isClosed = issueClosedChecker({
    orgId: input.orgId,
    issues: input.ports.issues,
    boards: input.ports.boards,
  });
  return input.ports.dependencies
    .listAll(input.orgId)
    .filter((dependency) => hasOpenBlockers([dependency], input.issueId, isClosed))
    .map((dependency) => input.ports.issues.findById(input.orgId, dependency.dependsOnIssueId))
    .filter((blocker): blocker is IssueRecord => blocker !== undefined)
    .map((blocker) => ({ id: blocker.id, title: blocker.title }));
}

export function fireSuppressionForBlockers(input: {
  blockers: IssueBlockerRef[];
  resolved: ResolvedFire;
  board: IssueBoardRecord;
}): IssueFireSuppression | null {
  const landedCategory = input.board.statuses.find(
    (status) => status.key === input.resolved.finalStatusKey,
  )?.category;
  if (!input.resolved.fireBlockedByBlockers || landedCategory !== 'started') {
    return null;
  }
  return { blockers: input.blockers, message: FIRE_SUPPRESSION_MESSAGE };
}

export async function fireIssueRules(
  deps: IssueRuleFireDeps,
  input: {
    orgId: string;
    issue: IssueRecord;
    board: IssueBoardRecord;
    explicitAssignee: string | null;
  },
): Promise<IssueFireResult> {
  const { orgId, issue, board, explicitAssignee } = input;
  const blockers = openBlockerRefs({ orgId, issueId: issue.id, ports: deps });
  const resolved = resolveFire({
    rules: board.rules,
    event: [{ type: 'issue_created' }, { type: 'status_entered', statusKey: issue.statusKey }],
    issue: {
      statusKey: issue.statusKey,
      labels: issue.labels,
      priority: issue.priority,
      type: issue.type,
      hasOpenBlockers: blockers.length > 0,
    },
    refs: engineRefs({ board, labels: deps.labels, agents: deps.agents, orgId }),
    explicitAssignee,
    hasOpenBlockers: blockers.length > 0,
  });
  const fireSuppressed = fireSuppressionForBlockers({ blockers, resolved, board });
  warnStop(deps.log, orgId, board.id, resolved);
  const labelIds = applyLabelMutations(issue.labels, resolved);
  if (resolved.agentId === null) {
    emitNotifications(deps, orgId, board.id, issue.id, resolved);
    const persisted = persistRuleOutcome(deps, {
      orgId,
      issue,
      finalStatusKey: resolved.finalStatusKey,
      firedAgentId: null,
      labelIds,
      unassign: resolved.unassign,
    });
    await applyResolvedWakes(deps, orgId, issue.id, resolved);
    return { issue: persisted, fireSuppressed };
  }
  const finalCategory = board.statuses.find(
    (status) => status.key === resolved.finalStatusKey,
  )?.category;
  if (finalCategory !== 'started') {
    emitNotifications(deps, orgId, board.id, issue.id, resolved);
    const persisted = persistRuleOutcome(deps, {
      orgId,
      issue,
      finalStatusKey: resolved.finalStatusKey,
      firedAgentId: null,
      labelIds,
      unassign: resolved.unassign,
    });
    await applyResolvedWakes(deps, orgId, issue.id, resolved);
    return { issue: persisted, fireSuppressed };
  }
  const agent = deps.agents.findById(orgId, resolved.agentId);
  const effective = resolveEffectiveProfile({
    issueRuleProfileId: resolved.executionProfileId,
    agentProfileId: agent?.executionProfileId ?? null,
    orgDefaultProfileId: deps.profiles.getDefault(orgId) ?? LOCAL_EXECUTION_PROFILE_ID,
  });
  let updated: IssueRecord | null = null;
  const dispatch = await dispatchIssueExecution({
    orgId,
    issue,
    board,
    statusKey: resolved.finalStatusKey,
    agentId: resolved.agentId,
    reason: resolved.reason,
    matchedLabelId: null,
    ownerUserId: resolved.ownerUserId,
    ruleId: resolved.ruleId,
    issueRuleProfileId: resolved.executionProfileId,
    profileId: effective.profileId,
    onReserved: () => {
      updated = persistRuleOutcome(deps, {
        orgId,
        issue,
        finalStatusKey: resolved.finalStatusKey,
        firedAgentId: resolved.agentId,
        labelIds,
        unassign: false,
      });
    },
    executions: deps.executions,
    fire: deps.fire,
    issues: deps.issues,
    sources: deps.sources,
    materializations: deps.materializations,
    events: deps.events,
    worktrees: deps.worktrees,
    machineConfig: deps.machineConfig,
    layout: deps.layout,
    driver: deps.driver,
  });
  if (dispatch.kind === 'blocked') {
    updated = persistRuleOutcome(deps, {
      orgId,
      issue,
      finalStatusKey: resolved.finalStatusKey,
      firedAgentId: null,
      labelIds,
      unassign: resolved.unassign,
    });
  }
  emitNotifications(deps, orgId, board.id, issue.id, resolved);
  const result = updated ?? deps.issues.findById(orgId, issue.id) ?? issue;
  await applyResolvedWakes(deps, orgId, issue.id, resolved);
  return { issue: result, fireSuppressed };
}

function emitNotifications(
  deps: IssueRuleFireDeps,
  orgId: string,
  boardId: string,
  issueId: string,
  resolved: ResolvedFire,
): void {
  for (const text of resolved.notifications) {
    deps.events.emit(orgId, { type: 'rule-notification', boardId, issueId, text });
  }
}

function warnStop(log: Logger, orgId: string, boardId: string, resolved: ResolvedFire): void {
  if (resolved.stop === null) {
    return;
  }
  log.warn(
    { orgId, boardId, reason: resolved.stop.reason, statusKey: resolved.stop.statusKey },
    'board rule cascade stopped',
  );
}
