import type { UpdateIssueBody } from '@harnesys/contracts';
import type { IssueRecord, IssueType } from '@harnesys/studio-shared';

export interface IssueFormDraft {
  title: string;
  description: string;
  statusKey: string;
  priority: number;
  type: IssueType;
  labels: string[];
  assigneeAgentId: string;
  dueDate: string | null;
  sourceId: string;
  branch: string | null;
}

export const ISSUE_DRAFT_DEFAULT_PRIORITY = 2;
export const ISSUE_DRAFT_DEFAULT_TYPE: IssueType = 'task';

export function emptyIssueDraft(statusKey = ''): IssueFormDraft {
  return {
    title: '',
    description: '',
    statusKey,
    priority: ISSUE_DRAFT_DEFAULT_PRIORITY,
    type: ISSUE_DRAFT_DEFAULT_TYPE,
    labels: [],
    assigneeAgentId: '',
    dueDate: null,
    sourceId: '',
    branch: null,
  };
}

export function draftFromIssue(issue: IssueRecord): IssueFormDraft {
  return {
    title: issue.title,
    description: issue.description,
    statusKey: issue.statusKey,
    priority: issue.priority,
    type: issue.type,
    labels: [...issue.labels],
    assigneeAgentId: issue.assigneeAgentId ?? '',
    dueDate: issue.dueDate,
    sourceId: issue.sourceId ?? '',
    branch: issue.branch,
  };
}

export function draftFromSubtask(parent: IssueRecord): IssueFormDraft {
  return {
    ...emptyIssueDraft(parent.statusKey),
    dueDate: parent.dueDate,
  };
}

export function draftFromRecord(issue: IssueRecord): IssueFormDraft {
  return draftFromIssue(issue);
}

export function draftDiff(issue: IssueRecord, draft: IssueFormDraft): UpdateIssueBody {
  const body: UpdateIssueBody = {};
  const title = draft.title.trim();
  if (title && title !== issue.title) {
    body.title = title;
  }
  if (draft.description !== issue.description) {
    body.description = draft.description;
  }
  if (draft.priority !== issue.priority) {
    body.priority = draft.priority;
  }
  if (draft.type !== issue.type) {
    body.type = draft.type;
  }
  if (draft.labels.join() !== issue.labels.join()) {
    body.labels = draft.labels;
  }
  if ((draft.assigneeAgentId || null) !== issue.assigneeAgentId) {
    body.assigneeAgentId = draft.assigneeAgentId || null;
  }
  if (draft.dueDate !== issue.dueDate) {
    body.dueDate = draft.dueDate;
  }
  if ((draft.sourceId || null) !== issue.sourceId) {
    body.sourceId = draft.sourceId || null;
  }
  const branch = draft.branch?.trim() || null;
  if (branch !== issue.branch) {
    body.branch = branch;
  }
  return body;
}
