import type {
  BoardRuleInput,
  BoardRule as BoardRuleRecord,
  BoardStatus,
  RuleAction,
  RuleCondition,
  RuleTrigger,
  StatusCategory,
} from '@harnesys/contracts';
import type { CapabilityScope } from '../domain/pack.ts';

export type {
  BoardRuleInput,
  BoardRuleRecord,
  BoardStatus,
  RuleAction,
  RuleCondition,
  RuleTrigger,
  StatusCategory,
};
export type IssueType = 'task' | 'bug' | 'research' | 'feature' | 'improvement' | 'review';
export type IssueDependencyType = 'blocks' | 'relates' | 'duplicate';
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
  fireTrail: Array<{
    agentId: string;
    statusKey: string;
    reason: 'rule' | 'override';
    outcome?: 'fired' | 'thread-busy' | 'failed';
    at: string;
  }>;
  sourceId: string | null;
  branch: string | null;
  worktreeOnStatus: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface IssueCommentRecord {
  id: string;
  issueId: string;
  authorType: 'human' | 'agent';
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
export interface IssueAttachmentRecord {
  id: string;
  issueId: string;
  kind: 'file' | 'source';
  name: string;
  mediaType: string;
  kindMedia: 'image' | 'audio' | 'video' | 'file';
  sizeBytes: number;
  sourceId: string | null;
  sourcePath: string | null;
  createdAt: string;
}
export interface IssueLabelRecord {
  id: string;
  title: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}
export interface IssueBoardRecord {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  status: 'active' | 'archived';
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  statuses: BoardStatus[];
  rules: BoardRuleRecord[];
}
export interface IssueDetail {
  issue: IssueRecord;
  comments: IssueCommentRecord[];
  subtasks: IssueRecord[];
  dependencies: IssueDependencyRecord[];
  dependents: IssueDependencyRecord[];
  attachments: IssueAttachmentRecord[];
  rules: BoardRuleRecord[];
}
export interface IssueCreateInput {
  boardId: string;
  title: string;
  description?: string;
  statusKey?: string;
  priority?: number;
  type?: IssueType;
  labels?: string[];
  assigneeAgentId?: string | null;
  parentIssueId?: string;
  dueDate?: string | null;
  dependencies?: Array<{ dependsOnIssueId: string; type?: IssueDependencyType }>;
  sourceId?: string;
  branch?: string;
  worktreeOnStatus?: string;
}
export interface IssueUpdateInput {
  boardId?: string;
  title?: string;
  description?: string;
  priority?: number;
  type?: IssueType;
  labels?: string[];
  assigneeAgentId?: string | null;
  dueDate?: string | null;
  sourceId?: string | null;
  branch?: string | null;
  worktreeOnStatus?: string | null;
}
export interface IssueSourceSummary {
  id: string;
  name: string;
  kind: 'git' | 'folder';
  defaultBranch: string | null;
  isWorkspace: boolean;
}
export interface IssueMoveInput {
  to: string;
  assigneeAgentId?: string | null;
  comment?: string;
}
export interface IssueListFilter {
  boardId?: string;
  statusKey?: string;
  assigneeAgentId?: string;
  labelId?: string;
  priority?: number;
  type?: IssueType;
  limit?: number;
}
export interface IssueSourceAttachmentInput {
  sourceId: string;
  sourcePath: string;
  name?: string;
}
export interface IssueLabelCreateInput {
  title: string;
  color?: string;
}
export type BoardTemplateKey = 'dev' | 'simple' | 'crm' | 'blank';
export interface IssueBoardCreateInput {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  template: BoardTemplateKey;
}
export interface IssueBoardUpdateInput {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
}
export interface IssueTrackerPort {
  listBoards(scope: CapabilityScope): Promise<IssueBoardRecord[]>;
  listSources(scope: CapabilityScope): Promise<IssueSourceSummary[]>;
  list(scope: CapabilityScope, filter?: IssueListFilter): Promise<IssueRecord[]>;
  get(scope: CapabilityScope, issueId: string): Promise<IssueDetail>;
  create(scope: CapabilityScope, input: IssueCreateInput): Promise<IssueRecord>;
  update(scope: CapabilityScope, issueId: string, patch: IssueUpdateInput): Promise<IssueRecord>;
  move(scope: CapabilityScope, issueId: string, input: IssueMoveInput): Promise<IssueRecord>;
  nudge(scope: CapabilityScope, issueId: string): Promise<IssueRecord>;
  comment(scope: CapabilityScope, issueId: string, body: string): Promise<IssueCommentRecord>;
  addDependency(
    scope: CapabilityScope,
    issueId: string,
    dependsOnIssueId: string,
    type?: IssueDependencyType,
  ): Promise<void>;
  removeDependency(
    scope: CapabilityScope,
    issueId: string,
    dependsOnIssueId: string,
  ): Promise<void>;
  addSourceAttachment(
    scope: CapabilityScope,
    issueId: string,
    input: IssueSourceAttachmentInput,
  ): Promise<IssueAttachmentRecord>;
  listLabels(scope: CapabilityScope): Promise<IssueLabelRecord[]>;
  createLabel(scope: CapabilityScope, input: IssueLabelCreateInput): Promise<IssueLabelRecord>;
  createBoard(scope: CapabilityScope, input: IssueBoardCreateInput): Promise<IssueBoardRecord>;
  updateBoard(
    scope: CapabilityScope,
    boardId: string,
    patch: IssueBoardUpdateInput,
  ): Promise<IssueBoardRecord>;
  deleteBoard(scope: CapabilityScope, boardId: string): Promise<void>;
  deleteLabel(scope: CapabilityScope, labelId: string): Promise<void>;
  saveBoardRule(
    scope: CapabilityScope,
    boardId: string,
    input: BoardRuleInput,
    ruleId?: string,
  ): Promise<IssueBoardRecord>;
  deleteBoardRule(scope: CapabilityScope, boardId: string, ruleId: string): Promise<void>;
}
