import type { Source } from '@harnesys/contracts';
import type { IssueSourceSummary } from '../../ports/issue-tracker.ts';
export function issueSourceSummaryOf(source: Source): IssueSourceSummary {
  return {
    id: source.id,
    name: source.name,
    kind: source.vcs !== null ? 'git' : 'folder',
    defaultBranch: source.vcs?.defaultBranch ?? null,
    isWorkspace: source.managed,
  };
}
