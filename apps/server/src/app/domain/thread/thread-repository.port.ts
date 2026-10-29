import type { ThreadActiveRun, ThreadInsert, ThreadPatch, ThreadRecord } from './thread.ts';

export abstract class ThreadRepositoryPort {
  abstract listByOrg(orgId: string): ThreadRecord[];
  abstract listActiveRuns(orgId: string): ThreadActiveRun[];
  abstract findActiveRun(orgId: string, threadId: string): ThreadActiveRun | undefined;
  abstract findById(orgId: string, id: string): ThreadRecord | undefined;
  abstract insert(rec: ThreadInsert): ThreadRecord;
  abstract patch(orgId: string, id: string, patch: ThreadPatch): ThreadRecord;
  abstract markRead(orgId: string, id: string, at: string): ThreadRecord;
  abstract updateTitle(orgId: string, id: string, title: string): ThreadRecord;
  abstract touch(orgId: string, id: string): void;
  abstract delete(orgId: string, id: string): void;
  abstract deleteByAgent(orgId: string, agentId: string): void;
  abstract listByIssue(orgId: string, issueId: string): ThreadRecord[];
  abstract findByIssueAndAgent(
    orgId: string,
    issueId: string,
    agentId: string,
  ): ThreadRecord | undefined;
  abstract threadIdsWithRuns(orgId: string): Set<string>;
}
