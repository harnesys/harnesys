import type { IssueInsert, IssuePatch, IssueRecord } from './issue.ts';

export abstract class IssueRepositoryPort {
  abstract listByOrg(orgId: string): IssueRecord[];
  abstract findById(orgId: string, id: string): IssueRecord | undefined;
  abstract listChildren(orgId: string, parentIssueId: string): IssueRecord[];
  abstract insert(rec: IssueInsert): IssueRecord;
  abstract update(orgId: string, id: string, patch: IssuePatch): IssueRecord;
  abstract delete(orgId: string, id: string): void;
  abstract clearLabelFromAll(orgId: string, labelId: string): void;
}
