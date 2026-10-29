import type {
  BoardRule,
  IssueAttachmentPublic,
  IssueBoardPublic,
  IssueCommentPublic,
  IssueDependencyPublic,
  IssueLabelPublic,
  IssuePublic,
  IssueWorktreeRef,
} from '@harnesys/contracts';
import type { BoardRuleRecord, IssueBoardRecord } from '../../domain/issue/board.ts';
import type {
  IssueAttachmentRecord,
  IssueCommentRecord,
  IssueDependencyRecord,
  IssueRecord,
} from '../../domain/issue/issue.ts';
import type { IssueLabelRecord } from '../../domain/issue/label.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { gitWorktreePath } from '../../domain/source/git-repository-layout.ts';
import type { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';

export interface IssueWorktreeRefDeps {
  worktrees: RepositoryWorktreePort;
  layout: HostFsLayoutPort;
  hostId: string;
}

export function toIssuePublic(record: IssueRecord, deps?: IssueWorktreeRefDeps): IssuePublic {
  return {
    id: record.id,
    boardId: record.boardId,
    title: record.title,
    description: record.description,
    statusKey: record.statusKey,
    priority: record.priority,
    type: record.type,
    assigneeAgentId: record.assigneeAgentId,
    labels: record.labels,
    parentIssueId: record.parentIssueId,
    dueDate: record.dueDate,
    closedAt: record.closedAt,
    fireTrail: record.fireTrail,
    sourceId: record.sourceId,
    branch: record.branch,
    worktreeOnStatus: record.worktreeOnStatus,
    worktree: deps ? issueWorktreeRef(record, deps) : null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function issueWorktreeRef(
  record: IssueRecord,
  deps: IssueWorktreeRefDeps,
): IssueWorktreeRef | null {
  const branch = record.branch?.trim();
  if (!record.sourceId || !branch) {
    return null;
  }
  const row = deps.worktrees.findActiveByBranch(record.orgId, record.sourceId, deps.hostId, branch);
  if (!row || (row.state !== 'ready' && row.state !== 'creating')) {
    return null;
  }
  return {
    id: row.id,
    branch: row.branch,
    path: gitWorktreePath(
      {
        bareRepoPath: deps.layout.orgSourceDir(record.orgId, record.sourceId),
        worktreesRoot: deps.layout.sourceWorktreesDir(record.orgId, record.sourceId),
      },
      row.id,
    ),
  };
}

export function toBoardPublic(record: IssueBoardRecord): IssueBoardPublic {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    color: record.color,
    icon: record.icon,
    status: record.status,
    archivedAt: record.archivedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    statuses: record.statuses,
    rules: record.rules.map(toRulePublic),
  };
}

export function toRulePublic(record: BoardRuleRecord): BoardRule {
  return {
    id: record.id,
    trigger: record.trigger,
    conditions: record.conditions,
    actions: record.actions,
    position: record.position,
    enabled: record.enabled,
  };
}

export function toCommentPublic(record: IssueCommentRecord): IssueCommentPublic {
  return {
    id: record.id,
    issueId: record.issueId,
    authorType: record.authorType,
    authorAgentId: record.authorAgentId,
    body: record.body,
    createdAt: record.createdAt,
  };
}

export function toDependencyPublic(record: IssueDependencyRecord): IssueDependencyPublic {
  return {
    issueId: record.issueId,
    dependsOnIssueId: record.dependsOnIssueId,
    type: record.type,
    createdAt: record.createdAt,
  };
}

export function toLabelPublic(record: IssueLabelRecord): IssueLabelPublic {
  return {
    id: record.id,
    title: record.title,
    color: record.color,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function toAttachmentPublic(record: IssueAttachmentRecord): IssueAttachmentPublic {
  return {
    id: record.id,
    issueId: record.issueId,
    kind: record.kind,
    name: record.name,
    mediaType: record.mediaType,
    kindMedia: record.kindMedia,
    sizeBytes: record.sizeBytes,
    path: record.path,
    sourceId: record.sourceId,
    sourcePath: record.sourcePath,
    createdAt: record.createdAt,
  };
}
