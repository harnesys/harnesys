import { Injectable, Logger } from '@harnesys/brix';
import type { CreateIssueBody, CreateIssueResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { LOCAL_EXECUTION_PROFILE_ID } from '../../domain/execution-profile/execution-profile.ts';
import { BoardValidationException } from '../../domain/issue/board.error.ts';
import type { IssueBoardRecord } from '../../domain/issue/board.ts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import type { BoardValidationIssue } from '../../domain/issue/board-validation.ts';
import { createsBlocksCycle, hasOpenBlockers } from '../../domain/issue/dependency-cycle.ts';
import {
  IssueBoardArchivedException,
  IssueBoardNotFoundException,
  IssueDependencyCycleException,
  IssueDepthException,
  IssueNotFoundException,
  IssueValidationException,
} from '../../domain/issue/issue.error.ts';
import type { IssueInsert, IssueRecord } from '../../domain/issue/issue.ts';
import { IssueDependencyRepositoryPort } from '../../domain/issue/issue-dependency-repository.port.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import { IssueFirePort } from '../../domain/issue/issue-fire.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { IssueLabelRepositoryPort } from '../../domain/issue/label-repository.port.ts';
import { type ResolvedFire, resolveFire } from '../../domain/issue/resolve-fire.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { resolveEffectiveProfile } from '../execution-profile/resolve-effective-profile.ts';
import { dispatchIssueExecution } from './dispatch-issue-execution.ts';
import { toIssuePublic } from './issue-mappers.ts';
import { engineRefs, issueClosedChecker } from './issue-rule-support.ts';
import { resolveIssueLabels } from './resolve-issue-labels.ts';

export interface CreateIssueRequest {
  orgId: string;
  actorAgentId?: string | null;
  body: CreateIssueBody;
}

interface ValidatedIssueCreate {
  board: IssueBoardRecord;
  labels: string[];
}

@Injectable()
export class CreateIssueUseCase {
  private readonly log: Logger;

  constructor(
    private readonly issues: IssueRepositoryPort,
    private readonly boards: IssueBoardRepositoryPort,
    private readonly dependencies: IssueDependencyRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly labels: IssueLabelRepositoryPort,
    private readonly executions: IssueExecutionPort,
    private readonly fire: IssueFirePort,
    private readonly events: IssueEventsPort,
    private readonly sources: SourceRegistryPort,
    private readonly profiles: ExecutionProfilePort,
    private readonly worktrees: RepositoryWorktreePort,
    private readonly machineConfig: MachineConfigPort,
    private readonly layout: HostFsLayoutPort,
    private readonly driver: SourceDriverPort,
    private readonly materializations: SourceMaterializationPort,
    logger: Logger,
  ) {
    this.log = logger.child('create-issue');
  }

  async execute(request: CreateIssueRequest): Promise<CreateIssueResponse> {
    const { orgId, body } = request;
    const { board, labels } = this.validateCreate(request);
    const statusKey = this.initialStatusKey(board, body);
    const now = new Date().toISOString();
    const category = board.statuses.find((status) => status.key === statusKey)?.category;
    const closed = category === 'finished' || category === 'cancelled';
    const record: IssueInsert = {
      id: crypto.randomUUID(),
      orgId,
      boardId: body.boardId,
      title: body.title,
      description: body.description ?? '',
      statusKey,
      priority: body.priority ?? 3,
      type: body.type ?? 'task',
      assigneeAgentId: body.assigneeAgentId ?? null,
      labels,
      parentIssueId: body.parentIssueId ?? null,
      dueDate: body.dueDate ?? null,
      closedAt: closed ? now : null,
      fireTrail: [],
      sourceId: body.sourceId ?? null,
      branch: body.branch ?? null,
      worktreeOnStatus: body.worktreeOnStatus ?? null,
      createdAt: now,
      updatedAt: now,
    };
    let issue = this.issues.insert(record);
    this.insertDependencies(request, issue);
    issue = await this.resolveAndFire(request, issue, board);
    this.events.emit(orgId, { type: 'issue', issue });
    return {
      issue: toIssuePublic(issue, {
        worktrees: this.worktrees,
        layout: this.layout,
        hostId: this.machineConfig.get().id,
      }),
    };
  }

  private initialStatusKey(board: IssueBoardRecord, body: CreateIssueBody): string {
    if (body.statusKey !== undefined) {
      if (!board.statuses.some((status) => status.key === body.statusKey)) {
        const issues: BoardValidationIssue[] = [
          { field: 'statuses', code: 'unknown-key', key: body.statusKey },
        ];
        throw new BoardValidationException(issues);
      }
      return body.statusKey;
    }
    return board.statuses.find((status) => status.isEntry)?.key ?? board.statuses[0]?.key ?? 'todo';
  }

  private validateCreate(request: CreateIssueRequest): ValidatedIssueCreate {
    const { orgId, body } = request;
    const board = this.boards.findById(orgId, body.boardId);
    if (!board) {
      throw new IssueBoardNotFoundException(body.boardId);
    }
    if (board.status === 'archived') {
      throw new IssueBoardArchivedException(board.id);
    }
    if (body.parentIssueId !== undefined) {
      const parent = this.issues.findById(orgId, body.parentIssueId);
      if (!parent) {
        throw new IssueNotFoundException(body.parentIssueId);
      }
      if (parent.parentIssueId !== null) {
        throw new IssueDepthException();
      }
    }
    if (body.assigneeAgentId && !this.agents.findById(orgId, body.assigneeAgentId)) {
      throw new IssueValidationException(`unknown assignee agent: ${body.assigneeAgentId}`);
    }
    const labels = resolveIssueLabels(this.labels, orgId, body.labels ?? []);
    if (body.sourceId !== undefined && !this.sources.findById(orgId, body.sourceId)) {
      throw new IssueValidationException(`unknown source: ${body.sourceId}`);
    }
    return { board, labels };
  }

  private async resolveAndFire(
    request: CreateIssueRequest,
    issue: IssueRecord,
    board: IssueBoardRecord,
  ): Promise<IssueRecord> {
    const { orgId, body } = request;
    const isClosed = issueClosedChecker({ orgId, issues: this.issues, boards: this.boards });
    const resolved = resolveFire({
      rules: board.rules,
      event: [{ type: 'issue_created' }, { type: 'status_entered', statusKey: issue.statusKey }],
      issue: { statusKey: issue.statusKey, labels: issue.labels },
      refs: engineRefs({ board, labels: this.labels, agents: this.agents, orgId }),
      explicitAssignee: body.assigneeAgentId ?? null,
      hasOpenBlockers: hasOpenBlockers(this.dependencies.listAll(orgId), issue.id, isClosed),
    });
    this.warnStop(orgId, board.id, resolved);
    if (resolved.agentId === null) {
      this.emitNotifications(orgId, board.id, issue.id, resolved);
      return this.persistOutcome(orgId, issue, resolved.finalStatusKey, null);
    }
    const finalCategory = board.statuses.find(
      (status) => status.key === resolved.finalStatusKey,
    )?.category;
    if (finalCategory !== 'started') {
      this.emitNotifications(orgId, board.id, issue.id, resolved);
      return this.persistOutcome(orgId, issue, resolved.finalStatusKey, null);
    }
    const agent = this.agents.findById(orgId, resolved.agentId);
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
      agentId: resolved.agentId,
      reason: resolved.reason,
      matchedLabelId: null,
      ownerUserId: resolved.ownerUserId,
      ruleId: resolved.ruleId,
      issueRuleProfileId: resolved.executionProfileId,
      profileId: effective.profileId,
      onReserved: () => {
        updated = this.persistOutcome(orgId, issue, resolved.finalStatusKey, resolved.agentId);
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
    });
    if (dispatch.kind === 'blocked') {
      updated = this.persistOutcome(orgId, issue, resolved.finalStatusKey, null);
    }
    this.emitNotifications(orgId, board.id, issue.id, resolved);
    return updated ?? this.issues.findById(orgId, issue.id) ?? issue;
  }

  private emitNotifications(
    orgId: string,
    boardId: string,
    issueId: string,
    resolved: ResolvedFire,
  ): void {
    for (const text of resolved.notifications) {
      this.events.emit(orgId, { type: 'rule-notification', boardId, issueId, text });
    }
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

  private persistOutcome(
    orgId: string,
    issue: IssueRecord,
    finalStatusKey: string,
    firedAgentId: string | null,
  ): IssueRecord {
    if (finalStatusKey === issue.statusKey && firedAgentId === null) {
      return issue;
    }
    const board = this.boards.findById(orgId, issue.boardId);
    const category = board?.statuses.find((status) => status.key === finalStatusKey)?.category;
    const now = new Date().toISOString();
    return this.issues.update(orgId, issue.id, {
      statusKey: finalStatusKey,
      assigneeAgentId: firedAgentId ?? issue.assigneeAgentId,
      closedAt:
        category === 'finished' || category === 'cancelled' ? (issue.closedAt ?? now) : null,
      updatedAt: now,
    });
  }

  private insertDependencies(request: CreateIssueRequest, issue: IssueRecord): void {
    for (const dep of request.body.dependencies ?? []) {
      if (dep.dependsOnIssueId === issue.id) {
        throw new IssueValidationException('issue cannot depend on itself');
      }
      const target = this.issues.findById(request.orgId, dep.dependsOnIssueId);
      if (!target) {
        throw new IssueNotFoundException(dep.dependsOnIssueId);
      }
      const type = dep.type ?? 'blocks';
      if (
        type === 'blocks' &&
        createsBlocksCycle(this.dependencies.listAll(request.orgId), issue.id, target.id)
      ) {
        throw new IssueDependencyCycleException();
      }
      this.dependencies.insert({
        orgId: request.orgId,
        issueId: issue.id,
        dependsOnIssueId: target.id,
        type,
        createdAt: new Date().toISOString(),
      });
    }
  }
}
