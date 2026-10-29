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
import { AddIssueCommentUseCase } from '../../../application/issues/add-issue-comment.use-case.ts';
import { AddIssueDependencyUseCase } from '../../../application/issues/add-issue-dependency.use-case.ts';
import { AddIssueSourceAttachmentUseCase } from '../../../application/issues/add-issue-source-attachment.use-case.ts';
import { CreateIssueUseCase } from '../../../application/issues/create-issue.use-case.ts';
import { CreateIssueBoardUseCase } from '../../../application/issues/create-issue-board.use-case.ts';
import { CreateIssueLabelUseCase } from '../../../application/issues/create-issue-label.use-case.ts';
import { DeleteIssueBoardUseCase } from '../../../application/issues/delete-issue-board.use-case.ts';
import { DeleteIssueLabelUseCase } from '../../../application/issues/delete-issue-label.use-case.ts';
import { GetIssueUseCase } from '../../../application/issues/get-issue.use-case.ts';
import { ListIssueBoardsUseCase } from '../../../application/issues/list-issue-boards.use-case.ts';
import { ListIssueLabelsUseCase } from '../../../application/issues/list-issue-labels.use-case.ts';
import { ListIssuesUseCase } from '../../../application/issues/list-issues.use-case.ts';
import { NudgeIssueUseCase } from '../../../application/issues/nudge-issue.use-case.ts';
import { RemoveBoardRuleUseCase } from '../../../application/issues/remove-board-rule.use-case.ts';
import { RemoveIssueDependencyUseCase } from '../../../application/issues/remove-issue-dependency.use-case.ts';
import { SaveBoardRuleUseCase } from '../../../application/issues/save-board-rule.use-case.ts';
import { UpdateIssueUseCase } from '../../../application/issues/update-issue.use-case.ts';
import { UpdateIssueBoardUseCase } from '../../../application/issues/update-issue-board.use-case.ts';
import { UpdateIssueStatusUseCase } from '../../../application/issues/update-issue-status.use-case.ts';
import { ListSourcesUseCase } from '../../../application/source/list-sources.use-case.ts';

export interface OrgIssueDeps {
  listBoards: Pick<ListIssueBoardsUseCase, 'execute'>;
  listSources: Pick<ListSourcesUseCase, 'execute'>;
  listIssues: Pick<ListIssuesUseCase, 'execute'>;
  getIssue: Pick<GetIssueUseCase, 'execute'>;
  createIssue: Pick<CreateIssueUseCase, 'execute'>;
  updateIssue: Pick<UpdateIssueUseCase, 'execute'>;
  updateStatus: Pick<UpdateIssueStatusUseCase, 'execute'>;
  nudgeIssue: Pick<NudgeIssueUseCase, 'execute'>;
  addComment: Pick<AddIssueCommentUseCase, 'execute'>;
  addDependency: Pick<AddIssueDependencyUseCase, 'execute'>;
  removeDependency: Pick<RemoveIssueDependencyUseCase, 'execute'>;
  addSourceAttachment: Pick<AddIssueSourceAttachmentUseCase, 'execute'>;
  listLabels: Pick<ListIssueLabelsUseCase, 'execute'>;
  createLabel: Pick<CreateIssueLabelUseCase, 'execute'>;
  createBoard: Pick<CreateIssueBoardUseCase, 'execute'>;
  updateBoard: Pick<UpdateIssueBoardUseCase, 'execute'>;
  deleteBoard: Pick<DeleteIssueBoardUseCase, 'execute'>;
  deleteLabel: Pick<DeleteIssueLabelUseCase, 'execute'>;
  saveBoardRule: Pick<SaveBoardRuleUseCase, 'execute'>;
  removeBoardRule: Pick<RemoveBoardRuleUseCase, 'execute'>;
}

const LIST_LIMIT_DEFAULT = 50;
const LIST_LIMIT_MAX = 200;

export class OrgIssuePort implements IssueTrackerPort {
  constructor(private readonly deps: OrgIssueDeps) {}

  listBoards(scope: CapabilityScope): Promise<IssueBoardRecord[]> {
    return Promise.resolve(this.deps.listBoards.execute(scope.orgId).items);
  }

  listSources(scope: CapabilityScope): Promise<IssueSourceSummary[]> {
    const res = this.deps.listSources.execute({ orgId: scope.orgId, surfaceHostId: null });
    return Promise.resolve(res.sources.map(issueSourceSummaryOf));
  }

  list(scope: CapabilityScope, filter?: IssueListFilter): Promise<IssueRecord[]> {
    const res = this.deps.listIssues.execute({
      orgId: scope.orgId,
      ...(filter?.boardId ? { boardId: filter.boardId } : {}),
    });
    const limit = Math.min(filter?.limit ?? LIST_LIMIT_DEFAULT, LIST_LIMIT_MAX);
    return Promise.resolve(
      res.items
        .filter((issue) => (filter?.statusKey ? issue.statusKey === filter.statusKey : true))
        .filter((issue) =>
          filter?.assigneeAgentId ? issue.assigneeAgentId === filter.assigneeAgentId : true,
        )
        .filter((issue) => (filter?.labelId ? issue.labels.includes(filter.labelId) : true))
        .filter((issue) => (filter?.priority ? issue.priority === filter.priority : true))
        .filter((issue) => (filter?.type ? issue.type === filter.type : true))
        .slice(0, limit),
    );
  }

  get(scope: CapabilityScope, issueId: string): Promise<IssueDetail> {
    return Promise.resolve(this.deps.getIssue.execute({ orgId: scope.orgId, issueId }));
  }

  async create(scope: CapabilityScope, input: IssueCreateInput): Promise<IssueRecord> {
    const res = await this.deps.createIssue.execute({
      orgId: scope.orgId,
      actorAgentId: scope.agentId,
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
    });
    return res.issue;
  }

  update(scope: CapabilityScope, issueId: string, patch: IssueUpdateInput): Promise<IssueRecord> {
    const res = this.deps.updateIssue.execute({
      orgId: scope.orgId,
      issueId,
      actorAgentId: scope.agentId,
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
    });
    return Promise.resolve(res);
  }

  async move(
    scope: CapabilityScope,
    issueId: string,
    input: { to: string; assigneeAgentId?: string | null; comment?: string },
  ): Promise<IssueRecord> {
    const moved = await this.deps.updateStatus.execute({
      orgId: scope.orgId,
      issueId,
      actorAgentId: scope.agentId,
      body: {
        statusKey: input.to,
        ...(input.assigneeAgentId !== undefined ? { assigneeAgentId: input.assigneeAgentId } : {}),
      },
    });
    if (input.comment) {
      await this.comment(scope, issueId, input.comment);
    }
    return moved;
  }

  nudge(scope: CapabilityScope, issueId: string): Promise<IssueRecord> {
    return this.deps.nudgeIssue.execute({
      orgId: scope.orgId,
      issueId,
      actorAgentId: scope.agentId,
    }) as Promise<IssueRecord>;
  }

  async comment(
    scope: CapabilityScope,
    issueId: string,
    body: string,
  ): Promise<IssueCommentRecord> {
    const res = await this.deps.addComment.execute({
      orgId: scope.orgId,
      issueId,
      authorType: 'agent',
      authorAgentId: scope.agentId,
      body: { body },
    });
    const last = res.items.at(-1);
    if (!last) {
      throw new Error('comment was not persisted');
    }
    return last;
  }

  addDependency(
    scope: CapabilityScope,
    issueId: string,
    dependsOnIssueId: string,
    type?: IssueDependencyType,
  ): Promise<void> {
    return Promise.resolve(
      this.deps.addDependency.execute({
        orgId: scope.orgId,
        issueId,
        body: { dependsOnIssueId, ...(type ? { type } : {}) },
      }),
    );
  }

  removeDependency(
    scope: CapabilityScope,
    issueId: string,
    dependsOnIssueId: string,
  ): Promise<void> {
    return Promise.resolve(
      this.deps.removeDependency.execute({ orgId: scope.orgId, issueId, dependsOnIssueId }),
    );
  }

  addSourceAttachment(
    scope: CapabilityScope,
    issueId: string,
    input: IssueSourceAttachmentInput,
  ): Promise<IssueAttachmentRecord> {
    const res = this.deps.addSourceAttachment.execute({
      orgId: scope.orgId,
      issueId,
      body: {
        sourceId: input.sourceId,
        sourcePath: input.sourcePath,
        ...(input.name ? { name: input.name } : {}),
      },
    });
    return Promise.resolve(res);
  }

  listLabels(scope: CapabilityScope): Promise<IssueLabelRecord[]> {
    return Promise.resolve(this.deps.listLabels.execute(scope.orgId).items);
  }

  async createLabel(
    scope: CapabilityScope,
    input: { title: string; color?: string },
  ): Promise<IssueLabelRecord> {
    const res = await this.deps.createLabel.execute({
      orgId: scope.orgId,
      body: { title: input.title, ...(input.color ? { color: input.color } : {}) },
    });
    const last = res.items.at(-1);
    if (!last) {
      throw new Error('label was not persisted');
    }
    return last;
  }

  createBoard(scope: CapabilityScope, input: IssueBoardCreateInput): Promise<IssueBoardRecord> {
    const res = this.deps.createBoard.execute({
      orgId: scope.orgId,
      body: {
        name: input.name,
        template: input.template,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
      },
    });
    return Promise.resolve(res.board);
  }

  updateBoard(
    scope: CapabilityScope,
    boardId: string,
    patch: IssueBoardUpdateInput,
  ): Promise<IssueBoardRecord> {
    const res = this.deps.updateBoard.execute({
      orgId: scope.orgId,
      boardId,
      body: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
      },
    });
    return Promise.resolve(res.board);
  }

  async deleteBoard(scope: CapabilityScope, boardId: string): Promise<void> {
    await this.deps.deleteBoard.execute({ orgId: scope.orgId, boardId });
  }

  async deleteLabel(scope: CapabilityScope, labelId: string): Promise<void> {
    await this.deps.deleteLabel.execute({ orgId: scope.orgId, labelId });
  }

  saveBoardRule(
    scope: CapabilityScope,
    boardId: string,
    input: BoardRuleInput,
    ruleId?: string,
  ): Promise<IssueBoardRecord> {
    const res = this.deps.saveBoardRule.execute({
      orgId: scope.orgId,
      boardId,
      ...(ruleId !== undefined ? { ruleId } : {}),
      input,
    });
    return Promise.resolve(res.board);
  }

  async deleteBoardRule(scope: CapabilityScope, boardId: string, ruleId: string): Promise<void> {
    await this.deps.removeBoardRule.execute({ orgId: scope.orgId, boardId, ruleId });
  }
}
