import { Injectable, Logger } from '@harnesys/brix';
import type { CreateIssueBody, CreateIssueResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { BoardValidationException } from '../../domain/issue/board.error.ts';
import type { IssueBoardRecord } from '../../domain/issue/board.ts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import type { BoardValidationIssue } from '../../domain/issue/board-validation.ts';
import { createsBlocksCycle } from '../../domain/issue/dependency-cycle.ts';
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
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { toIssuePublic } from './issue-mappers.ts';
import { fireIssueRules } from './issue-rule-fire.ts';
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
    if (body.deferRules === true) {
      return this.publicIssue(issue);
    }
    issue = await this.fireRules(orgId, issue, board, body.assigneeAgentId ?? null);
    this.events.emit(orgId, { type: 'issue', issue });
    return this.publicIssue(issue);
  }

  async commit(request: {
    orgId: string;
    issueId: string;
    statusKey?: string;
  }): Promise<CreateIssueResponse> {
    const { orgId, issueId } = request;
    const found = this.issues.findById(orgId, issueId);
    if (!found) {
      throw new IssueNotFoundException(issueId);
    }
    const board = this.boards.findById(orgId, found.boardId);
    if (!board) {
      throw new IssueBoardNotFoundException(found.boardId);
    }
    const issue = this.applyCommitStatus(orgId, found, board, request.statusKey);
    const updated = await this.fireRules(orgId, issue, board, issue.assigneeAgentId);
    this.events.emit(orgId, { type: 'issue', issue: updated });
    return this.publicIssue(updated);
  }

  private applyCommitStatus(
    orgId: string,
    issue: IssueRecord,
    board: IssueBoardRecord,
    statusKey: string | undefined,
  ): IssueRecord {
    if (statusKey === undefined || statusKey === issue.statusKey) {
      return issue;
    }
    if (!board.statuses.some((status) => status.key === statusKey)) {
      const issues: BoardValidationIssue[] = [
        { field: 'statuses', code: 'unknown-key', key: statusKey },
      ];
      throw new BoardValidationException(issues);
    }
    const category = board.statuses.find((status) => status.key === statusKey)?.category;
    const closed = category === 'finished' || category === 'cancelled';
    return this.issues.update(orgId, issue.id, {
      statusKey,
      closedAt: closed ? (issue.closedAt ?? new Date().toISOString()) : null,
      updatedAt: new Date().toISOString(),
    });
  }

  private publicIssue(issue: IssueRecord): CreateIssueResponse {
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

  private fireRules(
    orgId: string,
    issue: IssueRecord,
    board: IssueBoardRecord,
    explicitAssignee: string | null,
  ): Promise<IssueRecord> {
    return fireIssueRules(
      {
        issues: this.issues,
        boards: this.boards,
        dependencies: this.dependencies,
        agents: this.agents,
        labels: this.labels,
        executions: this.executions,
        fire: this.fire,
        events: this.events,
        sources: this.sources,
        profiles: this.profiles,
        worktrees: this.worktrees,
        machineConfig: this.machineConfig,
        layout: this.layout,
        driver: this.driver,
        materializations: this.materializations,
        log: this.log,
      },
      { orgId, issue, board, explicitAssignee },
    );
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
