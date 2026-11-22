import { ISSUE_WAKE_PREFIX, parseIssueWakeKey } from 'harnesys';
import { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import { isActiveIssueExecutionState } from '../../domain/issue/issue-execution.ts';

export interface AwaitSignalResolver {
  prefix: string;
  isSettled(wakeKey: string): boolean;
}

export function createAwaitSignalResolver(
  orgId: string,
  executions: IssueExecutionPort | undefined,
): (wakeKey: string) => boolean {
  const resolvers = buildResolvers(orgId, executions);
  return (wakeKey: string): boolean => {
    for (const resolver of resolvers) {
      if (wakeKey.startsWith(resolver.prefix)) {
        return resolver.isSettled(wakeKey);
      }
    }
    return false;
  };
}

function buildResolvers(
  orgId: string,
  executions: IssueExecutionPort | undefined,
): AwaitSignalResolver[] {
  if (executions === undefined) {
    return [];
  }
  return [createIssueAwaitResolver(orgId, executions)];
}

function createIssueAwaitResolver(
  orgId: string,
  executions: IssueExecutionPort,
): AwaitSignalResolver {
  return {
    prefix: ISSUE_WAKE_PREFIX,
    isSettled(wakeKey: string): boolean {
      const issueId = parseIssueWakeKey(wakeKey);
      if (issueId === null) {
        return false;
      }
      const latest = executions.findLatestByIssue(orgId, issueId);
      return latest !== null && !isActiveIssueExecutionState(latest.state);
    },
  };
}
