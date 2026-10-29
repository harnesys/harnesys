import type { IssueCommentInsert, IssueCommentRecord } from './issue.ts';

export interface IssueCommentCount {
  issueId: string;
  count: number;
}

export abstract class IssueCommentRepositoryPort {
  abstract listByIssue(orgId: string, issueId: string): IssueCommentRecord[];
  abstract countsByIssue(orgId: string): IssueCommentCount[];
  abstract insert(rec: IssueCommentInsert): IssueCommentRecord;
  abstract deleteByIssue(orgId: string, issueId: string): void;
}
