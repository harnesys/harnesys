import type { IssueExecution, IssueExecutionState } from './issue-execution.ts';

export interface ReserveIssueExecutionInput {
  id: string;
  orgId: string;
  issueId: string;
  agentId: string;
  correlationId: string;
  requestedStatus: string;
  ruleId?: string | null;
  profileId?: string | null;
  worktreeId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export abstract class IssueExecutionPort {
  abstract findById(orgId: string, id: string): IssueExecution | null;
  abstract findActiveByIssue(orgId: string, issueId: string): IssueExecution | null;
  abstract findByCorrelationId(orgId: string, correlationId: string): IssueExecution | null;
  abstract findByRunId(orgId: string, runId: string): IssueExecution | null;
  abstract listActive(orgId: string): IssueExecution[];
  abstract reserve(input: ReserveIssueExecutionInput): IssueExecution;
  abstract setWorktree(
    orgId: string,
    id: string,
    worktreeId: string,
    updatedAt: string,
  ): IssueExecution | null;
  abstract activate(
    orgId: string,
    id: string,
    runId: string,
    updatedAt: string,
  ): IssueExecution | null;
  abstract setState(
    orgId: string,
    id: string,
    state: IssueExecutionState,
    updatedAt: string,
  ): IssueExecution | null;
  abstract release(orgId: string, id: string, updatedAt: string): IssueExecution | null;
  abstract releaseByRunId(orgId: string, runId: string, updatedAt: string): IssueExecution | null;
}
