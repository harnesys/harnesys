import type { IssueAttachmentRecord } from './issue.ts';

export interface IssueAttachmentCount {
  issueId: string;
  count: number;
}

export abstract class IssueAttachmentRepositoryPort {
  abstract listByIssue(orgId: string, issueId: string): IssueAttachmentRecord[];
  abstract countsByIssue(orgId: string): IssueAttachmentCount[];
  abstract findById(
    orgId: string,
    issueId: string,
    attachmentId: string,
  ): IssueAttachmentRecord | undefined;
  abstract insert(rec: IssueAttachmentRecord): IssueAttachmentRecord;
  abstract delete(orgId: string, issueId: string, attachmentId: string): void;
  abstract deleteByIssue(orgId: string, issueId: string): void;
}
