import type {
  BoardRule as BoardRuleRecord,
  BoardStatus,
  RuleAction,
  RuleCondition,
  RuleTrigger,
  StatusCategory,
} from '@harnesys/contracts';

export type {
  BoardRuleRecord,
  BoardStatus,
  RuleAction,
  RuleCondition,
  RuleTrigger,
  StatusCategory,
};

export const ISSUE_BOARD_STATUSES = ['active', 'archived'] as const;
export type IssueBoardStatus = (typeof ISSUE_BOARD_STATUSES)[number];

export const STATUS_CATEGORIES = [
  'backlog',
  'started',
  'finished',
  'cancelled',
] as const satisfies readonly StatusCategory[];

export const CLOSED_STATUS_CATEGORIES: readonly StatusCategory[] = ['finished', 'cancelled'];

export function statusIsClosed(status: BoardStatus): boolean {
  return CLOSED_STATUS_CATEGORIES.includes(status.category);
}

export const ISSUE_TYPES = ['task', 'bug', 'research', 'feature', 'improvement', 'review'] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const ISSUE_PRIORITIES = [1, 2, 3, 4] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export const ISSUE_DEPENDENCY_TYPES = ['blocks', 'relates', 'duplicate'] as const;
export type IssueDependencyType = (typeof ISSUE_DEPENDENCY_TYPES)[number];

export const ISSUE_COMMENT_AUTHOR_TYPES = ['human', 'agent'] as const;
export type IssueCommentAuthorType = (typeof ISSUE_COMMENT_AUTHOR_TYPES)[number];

export const ISSUE_ATTACHMENT_KINDS = ['file', 'source'] as const;
export type IssueAttachmentKind = (typeof ISSUE_ATTACHMENT_KINDS)[number];

export type IssueFireReason = 'rule' | 'override';

export type IssueFireOutcome = 'fired' | 'thread-busy' | 'failed';

export interface IssueFireTrailEntry {
  agentId: string;
  statusKey: string;
  reason: IssueFireReason;
  outcome?: IssueFireOutcome;
  error?: string;
  at: string;
}

export const ISSUE_FIRE_TRAIL_LIMIT = 10;

export type IssueBoardRules = BoardRuleRecord[];

export interface IssueBoardRecord {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  status: IssueBoardStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  statuses: BoardStatus[];
  rules: IssueBoardRules;
}

export interface IssueRecord {
  id: string;
  boardId: string;
  title: string;
  description: string;
  statusKey: string;
  priority: number;
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
  attachmentCount?: number;
  commentCount?: number;
}

export interface IssueCommentRecord {
  id: string;
  issueId: string;
  authorType: IssueCommentAuthorType;
  authorAgentId: string | null;
  body: string;
  createdAt: string;
}

export interface IssueDependencyRecord {
  issueId: string;
  dependsOnIssueId: string;
  type: IssueDependencyType;
  createdAt: string;
}

export interface IssueLabelRecord {
  id: string;
  title: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface IssueAttachmentRecord {
  id: string;
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
