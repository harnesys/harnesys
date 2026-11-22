import type { Logger } from '@harnesys/brix';
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
import type { IssueWakePort } from '../../domain/issue/issue-wake.port.ts';
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
  wake: IssueWakePort;
  log: Logger;
}

export async function fireIssueRules(
  deps: IssueRuleFireDeps,
  input: {
    orgId: string;
    issue: IssueRecord;
    board: IssueBoardRecord;
    explicitAssignee: string | null;
  },
): Promise<IssueRecord> {
  const { orgId, issue, board, explicitAssignee } = input;
  const isClosed = issueClosedChecker({ orgId, issues: deps.issues, boards: deps.boards });
  const openBlockers = hasOpenBlockers(deps.dependencies.listAll(orgId), issue.id, isClosed);
  const resolved = resolveFire({
    rules: board.rules,
    event: [{ type: 'issue_created' }, { type: 'status_entered', statusKey: issue.statusKey }],
    issue: {
      statusKey: issue.statusKey,
      labels: issue.labels,
      priority: issue.priority,
      type: issue.type,
      hasOpenBlockers: openBlockers,
    },
    refs: engineRefs({ board, labels: deps.labels, agents: deps.agents, orgId }),
    explicitAssignee,
    hasOpenBlockers: openBlockers,
  });
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
    return persisted;
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
    return persisted;
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
  return result;
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
