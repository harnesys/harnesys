import { randomUUID } from 'node:crypto';
import type { Source, WorkerOrgOperation, WorkerOrgOperationResponse } from '@harnesys/contracts';
import {
  type BoardRuleInput,
  type CapabilityScope,
  type IssueAttachmentRecord,
  type IssueBoardCreateInput,
  type IssueBoardRecord,
  type IssueBoardUpdateInput,
  type IssueCommentRecord,
  type IssueCreateInput,
  type IssueDependencyType,
  type IssueDetail,
  type IssueLabelRecord,
  type IssueListFilter,
  type IssueRecord,
  type IssueSourceAttachmentInput,
  type IssueSourceSummary,
  type IssueTrackerPort,
  type IssueUpdateInput,
  issueSourceSummaryOf,
} from 'harnesys';

export interface RelayIssueTrackerDeps {
  relayUrl: string;
  orgId: string;
  token: string;
  runId: string;
  fetchImpl?: typeof fetch;
}

export class RelayIssueTrackerPort implements IssueTrackerPort {
  constructor(private readonly deps: RelayIssueTrackerDeps) {}

  async listBoards(_scope: CapabilityScope): Promise<IssueBoardRecord[]> {
    const res = (await this.post({ kind: 'issue.listBoards' })) as { items: IssueBoardRecord[] };
    return res.items;
  }

  async listSources(_scope: CapabilityScope): Promise<IssueSourceSummary[]> {
    const res = (await this.post({ kind: 'issue.listSources' })) as { sources: Source[] };
    return res.sources.map(issueSourceSummaryOf);
  }

  async list(_scope: CapabilityScope, filter?: IssueListFilter): Promise<IssueRecord[]> {
    const res = (await this.post({
      kind: 'issue.list',
      ...(filter?.boardId ? { boardId: filter.boardId } : {}),
    })) as { items: IssueRecord[] };
    return res.items
      .filter((issue) => (filter?.statusKey ? issue.statusKey === filter.statusKey : true))
      .filter((issue) =>
        filter?.assigneeAgentId ? issue.assigneeAgentId === filter.assigneeAgentId : true,
      )
      .slice(0, Math.min(filter?.limit ?? 50, 200));
  }

  get(_scope: CapabilityScope, issueId: string): Promise<IssueDetail> {
    return this.post({ kind: 'issue.get', issueId }) as Promise<IssueDetail>;
  }

  async create(_scope: CapabilityScope, input: IssueCreateInput): Promise<IssueRecord> {
    const res = (await this.post({
      kind: 'issue.create',
      body: {
        boardId: input.boardId,
        title: input.title,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.statusKey ? { statusKey: input.statusKey } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.type ? { type: input.type } : {}),
        ...(input.labels ? { labels: input.labels } : {}),
        ...(input.assigneeAgentId !== undefined ? { assigneeAgentId: input.assigneeAgentId } : {}),
        ...(input.parentIssueId ? { parentIssueId: input.parentIssueId } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
        ...(input.dependencies ? { dependencies: input.dependencies } : {}),
        ...(input.sourceId !== undefined ? { sourceId: input.sourceId } : {}),
        ...(input.branch !== undefined ? { branch: input.branch } : {}),
        ...(input.worktreeOnStatus !== undefined
          ? { worktreeOnStatus: input.worktreeOnStatus }
          : {}),
      },
    })) as { issue: IssueRecord };
    return res.issue;
  }

  update(_scope: CapabilityScope, issueId: string, patch: IssueUpdateInput): Promise<IssueRecord> {
    return this.post({
      kind: 'issue.update',
      issueId,
      body: {
        ...(patch.boardId ? { boardId: patch.boardId } : {}),
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.priority ? { priority: patch.priority } : {}),
        ...(patch.type ? { type: patch.type } : {}),
        ...(patch.labels ? { labels: patch.labels } : {}),
        ...(patch.assigneeAgentId !== undefined ? { assigneeAgentId: patch.assigneeAgentId } : {}),
        ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
        ...(patch.sourceId !== undefined ? { sourceId: patch.sourceId } : {}),
        ...(patch.branch !== undefined ? { branch: patch.branch } : {}),
        ...(patch.worktreeOnStatus !== undefined
          ? { worktreeOnStatus: patch.worktreeOnStatus }
          : {}),
      },
    }) as Promise<IssueRecord>;
  }

  async move(
    scope: CapabilityScope,
    issueId: string,
    input: { to: string; assigneeAgentId?: string | null; comment?: string },
  ): Promise<IssueRecord> {
    const moved = (await this.post({
      kind: 'issue.status',
      issueId,
      body: {
        statusKey: input.to,
        ...(input.assigneeAgentId !== undefined ? { assigneeAgentId: input.assigneeAgentId } : {}),
      },
    })) as IssueRecord;
    if (input.comment) {
      await this.comment(scope, issueId, input.comment);
    }
    return moved;
  }

  nudge(_scope: CapabilityScope, issueId: string): Promise<IssueRecord> {
    return this.post({ kind: 'issue.nudge', issueId }) as Promise<IssueRecord>;
  }

  async comment(
    _scope: CapabilityScope,
    issueId: string,
    body: string,
  ): Promise<IssueCommentRecord> {
    const res = (await this.post({
      kind: 'issue.comment',
      issueId,
      body: { body },
    })) as { items: IssueCommentRecord[] };
    const last = res.items.at(-1);
    if (!last) {
      throw new Error('comment was not persisted');
    }
    return last;
  }

  async addDependency(
    _scope: CapabilityScope,
    issueId: string,
    dependsOnIssueId: string,
    type?: IssueDependencyType,
  ): Promise<void> {
    await this.post({
      kind: 'issue.addDependency',
      issueId,
      body: { dependsOnIssueId, ...(type ? { type } : {}) },
    });
  }

  async removeDependency(
    _scope: CapabilityScope,
    issueId: string,
    dependsOnIssueId: string,
  ): Promise<void> {
    await this.post({ kind: 'issue.removeDependency', issueId, dependsOnIssueId });
  }

  addSourceAttachment(
    _scope: CapabilityScope,
    issueId: string,
    input: IssueSourceAttachmentInput,
  ): Promise<IssueAttachmentRecord> {
    return this.post({
      kind: 'issue.addSourceAttachment',
      issueId,
      body: {
        sourceId: input.sourceId,
        sourcePath: input.sourcePath,
        ...(input.name ? { name: input.name } : {}),
      },
    }) as Promise<IssueAttachmentRecord>;
  }

  async listLabels(_scope: CapabilityScope): Promise<IssueLabelRecord[]> {
    const res = (await this.post({ kind: 'issue.listLabels' })) as { items: IssueLabelRecord[] };
    return res.items;
  }

  async createLabel(
    _scope: CapabilityScope,
    input: { title: string; color?: string },
  ): Promise<IssueLabelRecord> {
    const res = (await this.post({
      kind: 'issue.createLabel',
      body: { title: input.title, ...(input.color ? { color: input.color } : {}) },
    })) as { items: IssueLabelRecord[] };
    const last = res.items.at(-1);
    if (!last) {
      throw new Error('label was not persisted');
    }
    return last;
  }

  async createBoard(
    _scope: CapabilityScope,
    input: IssueBoardCreateInput,
  ): Promise<IssueBoardRecord> {
    const res = (await this.post({
      kind: 'issue.createBoard',
      body: {
        name: input.name,
        template: input.template,
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    })) as { board: IssueBoardRecord };
    return res.board;
  }

  async updateBoard(
    _scope: CapabilityScope,
    boardId: string,
    patch: IssueBoardUpdateInput,
  ): Promise<IssueBoardRecord> {
    const res = (await this.post({
      kind: 'issue.updateBoard',
      boardId,
      body: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
      },
    })) as { board: IssueBoardRecord };
    return res.board;
  }

  async deleteBoard(_scope: CapabilityScope, boardId: string): Promise<void> {
    await this.post({ kind: 'issue.deleteBoard', boardId });
  }

  async deleteLabel(_scope: CapabilityScope, labelId: string): Promise<void> {
    await this.post({ kind: 'issue.deleteLabel', labelId });
  }

  async saveBoardRule(
    _scope: CapabilityScope,
    boardId: string,
    input: BoardRuleInput,
    ruleId?: string,
  ): Promise<IssueBoardRecord> {
    const res = (await this.post({
      kind: 'issue.saveBoardRule',
      boardId,
      ...(ruleId !== undefined ? { ruleId } : {}),
      body: input,
    })) as { board: IssueBoardRecord };
    return res.board;
  }

  async deleteBoardRule(_scope: CapabilityScope, boardId: string, ruleId: string): Promise<void> {
    await this.post({ kind: 'issue.deleteBoardRule', boardId, ruleId });
  }

  private async post(operation: WorkerOrgOperation): Promise<unknown> {
    const fetchImpl = this.deps.fetchImpl ?? fetch;
    const base = this.deps.relayUrl.replace(/\/+$/, '');
    const response = await fetchImpl(`${base}/api/fleet/worker/org-operation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.deps.token}`,
        'Content-Type': 'application/json',
        'X-Org-Id': this.deps.orgId,
      },
      body: JSON.stringify({
        runId: this.deps.runId,
        operationId: randomUUID(),
        operation,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`worker org operation failed: HTTP ${response.status}`);
    }
    const body = (await response.json()) as WorkerOrgOperationResponse;
    return body.result;
  }
}
