import { ISSUE_WAKE_PREFIX, parseIssueWakeKey, type SignalStorePort } from 'harnesys';
import { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import { isActiveIssueExecutionState } from '../../domain/issue/issue-execution.ts';

export interface AwaitSignalResolver {
  prefix: string;
  isSettled(orgId: string, wakeKey: string): boolean;
}

export interface AwaitSignalDeps {
  issueExecutions?: IssueExecutionPort;
  signals?: SignalStorePort;
}

export type AwaitSignalCheck = (wakeKey: string) => boolean;

/**
 * Extension point for state-derived signal kinds. A new trigger type registers
 * one resolver (prefix + settled check) here; free-form keys fall through to the
 * signals store without any registration.
 */
export function createAwaitSignalCheck(orgId: string, deps: AwaitSignalDeps): AwaitSignalCheck {
  const resolvers = buildResolvers(deps);
  return (wakeKey: string): boolean => {
    for (const resolver of resolvers) {
      if (wakeKey.startsWith(resolver.prefix)) {
        return resolver.isSettled(orgId, wakeKey);
      }
    }
    return deps.signals?.isFired(orgId, wakeKey) ?? false;
  };
}

function buildResolvers(deps: AwaitSignalDeps): AwaitSignalResolver[] {
  const out: AwaitSignalResolver[] = [];
  if (deps.issueExecutions !== undefined) {
    out.push(createIssueAwaitResolver(deps.issueExecutions));
  }
  return out;
}

function createIssueAwaitResolver(executions: IssueExecutionPort): AwaitSignalResolver {
  return {
    prefix: ISSUE_WAKE_PREFIX,
    isSettled(orgId: string, wakeKey: string): boolean {
      const issueId = parseIssueWakeKey(wakeKey);
      if (issueId === null) {
        return false;
      }
      const latest = executions.findLatestByIssue(orgId, issueId);
      return latest !== null && !isActiveIssueExecutionState(latest.state);
    },
  };
}
