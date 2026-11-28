import { Injectable, Logger } from '@harnesys/brix';
import type { UpdateIssueStatusBody, UpdateIssueStatusResponse } from '@harnesys/contracts';
import { SignalWakePort } from 'harnesys';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { LOCAL_EXECUTION_PROFILE_ID } from '../../domain/execution-profile/execution-profile.ts';
import { FleetContentProxyPort } from '../../domain/fleet/fleet-content-proxy.port.ts';
import { UnknownBoardStatusException } from '../../domain/issue/board.error.ts';
import type { IssueBoardRecord } from '../../domain/issue/board.ts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { IssueValidationException } from '../../domain/issue/issue.error.ts';
import type { IssuePatch, IssueRecord } from '../../domain/issue/issue.ts';
import { IssueDependencyRepositoryPort } from '../../domain/issue/issue-dependency-repository.port.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import { IssueFirePort } from '../../domain/issue/issue-fire.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { IssueLabelRepositoryPort } from '../../domain/issue/label-repository.port.ts';
import {
  applyLabelMutations,
  type ResolvedFire,
  resolveFire,
} from '../../domain/issue/resolve-fire.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { hasGitVcs } from '../../domain/source/vcs-capability.ts';
import { resolveEffectiveProfile } from '../execution-profile/resolve-effective-profile.ts';
import { applyResolvedWakes } from './apply-resolved-wakes.ts';
import { CreateIssueWorktreeUseCase } from './create-issue-worktree.use-case.ts';
import { dispatchIssueExecution } from './dispatch-issue-execution.ts';
import {
  resolveDispatchSource,
  shouldAutoCreateWorktree,
  worktreeAutoCreateFailedText,
} from './issue-dispatch-support.ts';
import { loadActiveIssueAndBoard } from './issue-guards.ts';
import { toIssuePublic } from './issue-mappers.ts';
import { fireSuppressionForBlockers, openBlockerRefs } from './issue-rule-fire.ts';
import { engineRefs } from './issue-rule-support.ts';

export interface UpdateIssueStatusRequest {
  orgId: string;
  issueId: string;
  actorAgentId?: string | null;
  body: UpdateIssueStatusBody;
}

@Injectable()
export class UpdateIssueStatusUseCase {
  private readonly log: Logger;

  constructor(
    private readonly issues: IssueRepositoryPort,
    private readonly boards: IssueBoardRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly profiles: ExecutionProfilePort,
    private readonly dependencies: IssueDependencyRepositoryPort,
    private readonly labels: IssueLabelRepositoryPort,
    private readonly executions: IssueExecutionPort,
    private readonly fire: IssueFirePort,
    private readonly events: IssueEventsPort,
    private readonly wake: SignalWakePort,
    private readonly worktrees: RepositoryWorktreePort,
    private readonly machineConfig: MachineConfigPort,
    private readonly layout: HostFsLayoutPort,
    private readonly driver: SourceDriverPort,
    private readonly contentProxy: FleetContentProxyPort,
    private readonly createIssueWorktree: CreateIssueWorktreeUseCase,
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    logger: Logger,
  ) {
    this.log = logger.child('update-issue-status');
  }

  async execute(request: UpdateIssueStatusRequest): Promise<UpdateIssueStatusResponse> {
    const { orgId, body } = request;
    const { issue, board } = loadActiveIssueAndBoard(
      this.issues,
      this.boards,
      orgId,
      request.issueId,
    );
    this.assertStatusOnBoard(board, body.statusKey);
    const explicit = this.explicitAssignee(orgId, body);
    const blockers = openBlockerRefs({
      orgId,
      issueId: issue.id,
      ports: { issues: this.issues, dependencies: this.dependencies, boards: this.boards },
    });
    const resolved = resolveFire({
      rules: board.rules,
      event: { type: 'status_entered', statusKey: body.statusKey },
      issue: {
        statusKey: issue.statusKey,
        labels: issue.labels,
        priority: issue.priority,
        type: issue.type,
        hasOpenBlockers: blockers.length > 0,
      },
      refs: engineRefs({ board, labels: this.labels, agents: this.agents, orgId }),
      explicitAssignee: explicit ?? null,
      hasOpenBlockers: blockers.length > 0,
    });
    this.warnOutcome(orgId, board.id, resolved);
    const now = new Date().toISOString();
    const finalIssue = await this.applyResolvedFire({
      orgId,
      issue,
      board,
      explicit,
      resolved,
      labelIds: applyLabelMutations(issue.labels, resolved),
      now,
      actorAgentId: request.actorAgentId ?? null,
    });
    await applyResolvedWakes({ wake: this.wake }, orgId, issue.id, resolved);
    this.events.emit(orgId, { type: 'issue', issue: finalIssue });
    this.autoCreateWorktree(orgId, finalIssue);
    for (const text of resolved.notifications) {
      this.events.emit(orgId, {
        type: 'rule-notification',
        boardId: board.id,
        issueId: issue.id,
        text,
      });
    }
    const suppressed = fireSuppressionForBlockers({ blockers, resolved, board });
    const result = toIssuePublic(finalIssue, {
      worktrees: this.worktrees,
      layout: this.layout,
      hostId: this.machineConfig.get().id,
    });
    return suppressed === null ? result : { ...result, fireSuppressed: suppressed };
  }

  private async applyResolvedFire(input: {
    orgId: string;
    issue: IssueRecord;
    board: IssueBoardRecord;
    explicit: string | null | undefined;
    resolved: ResolvedFire;
    labelIds: string[];
    now: string;
    actorAgentId: string | null;
  }): Promise<IssueRecord> {
    const { orgId, issue, board, explicit, resolved, labelIds, now } = input;
    const finalCategory = board.statuses.find(
      (status) => status.key === resolved.finalStatusKey,
    )?.category;
    const agentId = resolved.agentId;
    if (agentId === null || finalCategory !== 'started') {
      return this.persistStatus({
        orgId,
        issue,
        finalStatusKey: resolved.finalStatusKey,
        explicit,
        firedAgentId: null,
        unassign: resolved.unassign,
        labelIds,
        now,
      });
    }
    const agent = this.agents.findById(orgId, agentId);
    const effective = resolveEffectiveProfile({
      issueRuleProfileId: resolved.executionProfileId,
      agentProfileId: agent?.executionProfileId ?? null,
      orgDefaultProfileId: this.profiles.getDefault(orgId) ?? LOCAL_EXECUTION_PROFILE_ID,
    });
    let updated: IssueRecord | null = null;
    const dispatch = await dispatchIssueExecution({
      orgId,
      issue,
      board,
      statusKey: resolved.finalStatusKey,
      agentId,
      actorAgentId: input.actorAgentId,
      reason: resolved.reason,
      matchedLabelId: null,
      ownerUserId: resolved.ownerUserId,
      ruleId: resolved.ruleId,
      issueRuleProfileId: resolved.executionProfileId,
      profileId: effective.profileId,
      onReserved: () => {
        updated = this.persistStatus({
          orgId,
          issue,
          finalStatusKey: resolved.finalStatusKey,
          explicit,
          firedAgentId: agentId,
          unassign: false,
          labelIds,
          now,
        });
      },
      executions: this.executions,
      fire: this.fire,
      issues: this.issues,
      sources: this.sources,
      materializations: this.materializations,
      events: this.events,
      worktrees: this.worktrees,
      machineConfig: this.machineConfig,
      layout: this.layout,
      driver: this.driver,
      contentProxy: this.contentProxy,
    });
    if (dispatch.kind !== 'dispatched') {
      updated = this.persistStatus({
        orgId,
        issue,
        finalStatusKey: resolved.finalStatusKey,
        explicit,
        firedAgentId: null,
        unassign: resolved.unassign,
        labelIds,
        now,
      });
    }
    return updated ?? this.issues.findById(orgId, issue.id) ?? issue;
  }

  private autoCreateWorktree(orgId: string, issue: IssueRecord): void {
    const source = resolveDispatchSource(this.sources, orgId, issue);
    if (source === null || !hasGitVcs(source)) {
      return;
    }
    const branch = issue.branch?.trim() ?? '';
    const active =
      branch !== ''
        ? this.worktrees.findActiveByBranch(orgId, source.id, this.machineConfig.get().id, branch)
        : null;
    if (
      !shouldAutoCreateWorktree({
        issue,
        enteredStatusKey: issue.statusKey,
        hasActiveWorktree: active !== null,
      })
    ) {
      return;
    }
    void this.createIssueWorktree
      .execute({ orgId, issueId: issue.id, body: {} })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.log.warn({ orgId, issueId: issue.id, branch, reason }, 'worktree auto-create failed');
        this.events.emit(orgId, {
          type: 'rule-notification',
          boardId: issue.boardId,
          issueId: issue.id,
          text: worktreeAutoCreateFailedText(branch, reason),
        });
      });
  }

  private persistStatus(input: {
    orgId: string;
    issue: IssueRecord;
    finalStatusKey: string;
    explicit: string | null | undefined;
    firedAgentId: string | null;
    unassign: boolean;
    labelIds: string[];
    now: string;
  }): IssueRecord {
    const { orgId, issue, finalStatusKey, explicit, firedAgentId, unassign, labelIds, now } = input;
    const category = this.statusCategory(orgId, issue.boardId, finalStatusKey);
    const patch: IssuePatch = {
      statusKey: finalStatusKey,
      labels: labelIds,
      assigneeAgentId: resolveAssignee(explicit, firedAgentId, unassign, issue.assigneeAgentId),
      closedAt:
        category === 'finished' || category === 'cancelled' ? (issue.closedAt ?? now) : null,
      updatedAt: now,
    };
    return this.issues.update(orgId, issue.id, patch);
  }

  private statusCategory(orgId: string, boardId: string, statusKey: string) {
    const board = this.boards.findById(orgId, boardId);
    return board?.statuses.find((status) => status.key === statusKey)?.category;
  }

  private assertStatusOnBoard(board: IssueBoardRecord, statusKey: string): void {
    const keys = board.statuses.map((status) => status.key);
    if (!keys.includes(statusKey)) {
      throw new UnknownBoardStatusException(statusKey, keys);
    }
  }

  private explicitAssignee(orgId: string, body: UpdateIssueStatusBody): string | null | undefined {
    if (body.assigneeAgentId === undefined) {
      return undefined;
    }
    if (body.assigneeAgentId !== null && !this.agents.findById(orgId, body.assigneeAgentId)) {
      throw new IssueValidationException(`unknown assignee agent: ${body.assigneeAgentId}`);
    }
    return body.assigneeAgentId;
  }

  private warnOutcome(orgId: string, boardId: string, resolved: ResolvedFire): void {
    this.warnDeadRefs(orgId, boardId, resolved);
    this.warnStop(orgId, boardId, resolved);
  }

  private warnDeadRefs(orgId: string, boardId: string, resolved: ResolvedFire): void {
    const dead = resolved.skippedRules.filter((entry) => entry.reason === 'dead-ref');
    if (dead.length === 0) {
      return;
    }
    this.log.warn(
      { orgId, boardId, ruleIds: dead.map((entry) => entry.ruleId) },
      'board rules skipped for dead references',
    );
  }

  private warnStop(orgId: string, boardId: string, resolved: ResolvedFire): void {
    if (resolved.stop === null) {
      return;
    }
    this.log.warn(
      { orgId, boardId, reason: resolved.stop.reason, statusKey: resolved.stop.statusKey },
      'board rule cascade stopped',
    );
  }
}

function resolveAssignee(
  explicit: string | null | undefined,
  firedAgentId: string | null,
  unassign: boolean,
  current: string | null,
): string | null {
  if (explicit !== undefined) {
    return explicit;
  }
  if (firedAgentId !== null) {
    return firedAgentId;
  }
  if (unassign) {
    return null;
  }
  return current;
}
