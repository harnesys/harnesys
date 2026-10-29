import type {
  IssueAttachmentKind,
  IssueCommentAuthorType,
  IssueDependencyType,
  IssueFireOutcome,
  IssueFireReason,
  IssueFireTrailEntry,
  IssuePriority,
  IssueType,
} from '@harnesys/contracts';

export interface IssueRecord {
  id: string;
  orgId: string;
  boardId: string;
  title: string;
  description: string;
  statusKey: string;
  priority: IssuePriority;
  type: IssueType;
  assigneeAgentId: string | null;
  labels: string[];
  parentIssueId: string | null;
  dueDate: string | null;
  closedAt: string | null;
  fireTrail: IssueFireTrailEntry[];
  sourceId: string | null;
  branch: string | null;
  worktreeOnStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssueInsert {
  id: string;
  orgId: string;
  boardId: string;
  title: string;
  description: string;
  statusKey: string;
  priority: IssuePriority;
  type: IssueType;
  assigneeAgentId: string | null;
  labels: string[];
  parentIssueId: string | null;
  dueDate: string | null;
  closedAt: string | null;
  fireTrail: IssueFireTrailEntry[];
  sourceId: string | null;
  branch: string | null;
  worktreeOnStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

export type IssuePatch = Partial<{
  boardId: string;
  title: string;
  description: string;
  statusKey: string;
  priority: IssuePriority;
  type: IssueType;
  assigneeAgentId: string | null;
  labels: string[];
  parentIssueId: string | null;
  dueDate: string | null;
  closedAt: string | null;
  fireTrail: IssueFireTrailEntry[];
  sourceId: string | null;
  branch: string | null;
  worktreeOnStatus: string | null;
  updatedAt: string;
}>;

export interface IssueCommentRecord {
  id: string;
  orgId: string;
  issueId: string;
  authorType: IssueCommentAuthorType;
  authorAgentId: string | null;
  body: string;
  createdAt: string;
}

export interface IssueCommentInsert {
  id: string;
  orgId: string;
  issueId: string;
  authorType: IssueCommentAuthorType;
  authorAgentId: string | null;
  body: string;
  createdAt: string;
}

export interface IssueDependencyRecord {
  orgId: string;
  issueId: string;
  dependsOnIssueId: string;
  type: IssueDependencyType;
  createdAt: string;
}

export interface IssueDependencyInsert {
  orgId: string;
  issueId: string;
  dependsOnIssueId: string;
  type: IssueDependencyType;
  createdAt: string;
}

export interface IssueAttachmentRecord {
  id: string;
  orgId: string;
  issueId: string;
  kind: IssueAttachmentKind;
  name: string;
  mediaType: string;
  kindMedia: 'image' | 'audio' | 'video' | 'file';
  sizeBytes: number;
  path: string | null;
  sourceId: string | null;
  sourcePath: string | null;
  createdAt: string;
}

export type {
  IssueAttachmentKind,
  IssueCommentAuthorType,
  IssueDependencyType,
  IssueFireOutcome,
  IssueFireReason,
  IssueFireTrailEntry,
  IssuePriority,
  IssueType,
};

export const ISSUE_FIRE_TRAIL_LIMIT = 10;

export function appendFireTrail(
  trail: IssueFireTrailEntry[],
  entry: IssueFireTrailEntry,
): IssueFireTrailEntry[] {
  return [...trail, entry].slice(-ISSUE_FIRE_TRAIL_LIMIT);
}
