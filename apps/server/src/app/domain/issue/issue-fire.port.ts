import type { IssueFireOutcome, IssueFireReason } from './issue.ts';

export interface IssueFireRequest {
  orgId: string;
  issueId: string;
  agentId: string;
  statusKey: string;
  reason: IssueFireReason;
  matchedLabelId: string | null;
  ownerUserId?: string | null;
  correlationId?: string;
  issueRuleProfileId?: string | null;
  sourceId?: string;
  worktreeId?: string;
  branch?: string;
}

export type IssueFireResult =
  | { outcome: 'fired'; runId: string }
  | { outcome: Exclude<IssueFireOutcome, 'fired'>; error?: string };

export abstract class IssueFirePort {
  abstract fire(request: IssueFireRequest): Promise<IssueFireResult>;
}

export type { IssueFireOutcome };
