import type { IssueDependencyInsert, IssueDependencyRecord } from './issue.ts';

export abstract class IssueDependencyRepositoryPort {
  abstract listByIssue(orgId: string, issueId: string): IssueDependencyRecord[];
  abstract listDependents(orgId: string, issueId: string): IssueDependencyRecord[];
  abstract listAll(orgId: string): IssueDependencyRecord[];
  abstract insert(rec: IssueDependencyInsert): IssueDependencyRecord;
  abstract delete(orgId: string, issueId: string, dependsOnIssueId: string): void;
}
