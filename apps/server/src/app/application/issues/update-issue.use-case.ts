import { Injectable } from '@harnesys/brix';
import type { IssuePublic, UpdateIssueBody } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { LOCAL_EXECUTION_PROFILE_ID } from '../../domain/execution-profile/execution-profile.ts';
import { FleetContentProxyPort } from '../../domain/fleet/fleet-content-proxy.port.ts';
import type { IssueBoardRecord } from '../../domain/issue/board.ts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { decideWorktreeFieldPatch } from '../../domain/issue/decide-worktree-field-patch.ts';
import {
  IssueBoardArchivedException,
  IssueBoardNotFoundException,
  IssueExecutionActiveException,
  IssueNotFoundException,
  IssueValidationException,
  IssueWorktreeBoundException,
} from '../../domain/issue/issue.error.ts';
import type { IssuePatch, IssueRecord } from '../../domain/issue/issue.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import { IssueFirePort } from '../../domain/issue/issue-fire.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { IssueLabelRepositoryPort } from '../../domain/issue/label-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import type { RepositoryWorktree } from '../../domain/source/repository-worktree.ts';
import { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { resolveEffectiveProfile } from '../execution-profile/resolve-effective-profile.ts';
import { dispatchIssueExecution } from './dispatch-issue-execution.ts';
import { toIssuePublic } from './issue-mappers.ts';
import { validateWorkspaceSubpath } from './issue-subpath.ts';
import { resolveIssueLabels } from './resolve-issue-labels.ts';

export interface UpdateIssueRequest {
  orgId: string;
  issueId: string;
  actorAgentId?: string | null;
  body: UpdateIssueBody;
}

@Injectable()
export class UpdateIssueUseCase {
  constructor(
    private readonly issues: IssueRepositoryPort,
    private readonly boards: IssueBoardRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly labels: IssueLabelRepositoryPort,
    private readonly executions: IssueExecutionPort,
    private readonly fire: IssueFirePort,
    private readonly events: IssueEventsPort,
    private readonly sources: SourceRegistryPort,
    private readonly worktrees: RepositoryWorktreePort,
    private readonly machineConfig: MachineConfigPort,
    private readonly layout: HostFsLayoutPort,
    private readonly profiles: ExecutionProfilePort,
    private readonly materializations: SourceMaterializationPort,
    private readonly driver: SourceDriverPort,
    private readonly contentProxy?: FleetContentProxyPort,
  ) {}

  async execute(request: UpdateIssueRequest): Promise<IssuePublic> {
    const { orgId } = request;
    const issue = this.issues.findById(orgId, request.issueId);
    if (!issue) {
      throw new IssueNotFoundException(request.issueId);
    }
    const board = this.boards.findById(orgId, issue.boardId);
    if (!board) {
      throw new IssueBoardNotFoundException(issue.boardId);
    }
    if (board.status === 'archived') {
      throw new IssueBoardArchivedException(board.id);
    }
    const patch = this.buildPatch(request, issue);
    let updated = this.issues.update(orgId, issue.id, patch);
    if (this.shouldFire(board, issue, updated)) {
      updated = await this.fireAssignee(request, updated, board);
    }
    this.events.emit(orgId, { type: 'issue', issue: updated });
    return toIssuePublic(updated, {
      worktrees: this.worktrees,
      layout: this.layout,
      hostId: this.machineConfig.get().id,
    });
  }

  private shouldFire(
    board: IssueBoardRecord,
    previous: IssueRecord,
    updated: IssueRecord,
  ): boolean {
    if (updated.assigneeAgentId === null || updated.assigneeAgentId === previous.assigneeAgentId) {
      return false;
    }
    const status = board.statuses.find((row) => row.key === updated.statusKey);
    return status?.category === 'started';
  }

  private async fireAssignee(
    request: UpdateIssueRequest,
    updated: IssueRecord,
    board: IssueBoardRecord,
  ): Promise<IssueRecord> {
    const { orgId } = request;
    const agentId = updated.assigneeAgentId;
    if (agentId === null) {
      return updated;
    }
    const active = this.executions.findActiveByIssue(orgId, updated.id);
    if (active) {
      throw new IssueExecutionActiveException(updated.id, active.id);
    }
    const agent = this.agents.findById(orgId, agentId);
    const issueRuleProfileId = null;
    const effective = resolveEffectiveProfile({
      issueRuleProfileId,
      agentProfileId: agent?.executionProfileId ?? null,
      orgDefaultProfileId: this.profiles.getDefault(orgId) ?? LOCAL_EXECUTION_PROFILE_ID,
    });
    await dispatchIssueExecution({
      orgId,
      issue: updated,
      board,
      statusKey: updated.statusKey,
      agentId,
      reason: 'override',
      matchedLabelId: null,
      ownerUserId: null,
      ruleId: null,
      issueRuleProfileId,
      profileId: effective.profileId,
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
      ...(this.contentProxy ? { contentProxy: this.contentProxy } : {}),
    });
    return updated;
  }

  private buildPatch(request: UpdateIssueRequest, issue: IssueRecord): IssuePatch {
    const { body } = request;
    const patch: IssuePatch = { updatedAt: new Date().toISOString() };
    if (body.boardId !== undefined && body.boardId !== issue.boardId) {
      patch.boardId = this.validatedBoardId(request, body.boardId);
    }
    if (body.title !== undefined) {
      patch.title = body.title;
    }
    if (body.description !== undefined) {
      patch.description = body.description;
    }
    if (body.priority !== undefined) {
      patch.priority = body.priority;
    }
    if (body.type !== undefined) {
      patch.type = body.type;
    }
    if (body.labels !== undefined) {
      patch.labels = this.validatedLabels(request, body.labels);
    }
    if (body.dueDate !== undefined) {
      patch.dueDate = body.dueDate;
    }
    if (body.worktreeOnStatus !== undefined) {
      patch.worktreeOnStatus = body.worktreeOnStatus;
    }
    if (body.workspaceSubpath !== undefined) {
      patch.workspaceSubpath =
        body.workspaceSubpath === null ? null : validateWorkspaceSubpath(body.workspaceSubpath);
    }
    this.applyWorktreeFields(request, issue, body, patch);
    patch.assigneeAgentId = this.validatedAssignee(request, body.assigneeAgentId);
    return patch;
  }

  private applyWorktreeFields(
    request: UpdateIssueRequest,
    issue: IssueRecord,
    body: UpdateIssueBody,
    patch: IssuePatch,
  ): void {
    if (body.sourceId === undefined && body.branch === undefined) {
      return;
    }
    const worktrees = this.worktrees.listForIssue(request.orgId, issue.id);
    const bound = worktrees.find(
      (row): row is RepositoryWorktree & { state: 'ready' | 'creating' } =>
        row.state === 'ready' || row.state === 'creating',
    );
    const decision = decideWorktreeFieldPatch({
      current: { sourceId: issue.sourceId, branch: issue.branch },
      body,
      activeWorktreeState: bound?.state ?? null,
      sourceExists: (sourceId) => this.sources.findById(request.orgId, sourceId) !== undefined,
    });
    if (decision.kind === 'bound') {
      throw new IssueWorktreeBoundException(issue.id, bound?.id ?? '');
    }
    if (decision.kind === 'unknown-source') {
      throw new IssueValidationException(`unknown source: ${decision.sourceId}`);
    }
    Object.assign(patch, decision.patch);
    if (
      patch.sourceId !== undefined &&
      patch.sourceId !== issue.sourceId &&
      body.workspaceSubpath === undefined
    ) {
      patch.workspaceSubpath = null;
    }
  }

  private validatedBoardId(request: UpdateIssueRequest, boardId: string): string {
    const target = this.boards.findById(request.orgId, boardId);
    if (!target) {
      throw new IssueBoardNotFoundException(boardId);
    }
    if (target.status === 'archived') {
      throw new IssueBoardArchivedException(target.id);
    }
    return boardId;
  }

  private validatedLabels(request: UpdateIssueRequest, labels: string[]): string[] {
    return resolveIssueLabels(this.labels, request.orgId, labels);
  }

  private validatedAssignee(
    request: UpdateIssueRequest,
    assigneeAgentId: string | null | undefined,
  ): string | null | undefined {
    if (assigneeAgentId === undefined) {
      return undefined;
    }
    if (assigneeAgentId !== null && !this.agents.findById(request.orgId, assigneeAgentId)) {
      throw new IssueValidationException(`unknown assignee agent: ${assigneeAgentId}`);
    }
    return assigneeAgentId;
  }
}
