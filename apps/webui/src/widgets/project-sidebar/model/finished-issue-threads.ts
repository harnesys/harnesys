import type { IssueBoardRecord, IssueRecord } from '@harnesys/studio-shared';
import type { Thread } from '@/entities/thread';
import { isClosedCategory, statusOf } from '@/features/manage-issues/model/board-columns';

export interface FinishedIssueLookup {
  issues: readonly IssueRecord[];
  boards: readonly IssueBoardRecord[];
}

export function finishedIssueThreadIds(
  threads: readonly Thread[],
  lookup: FinishedIssueLookup,
): Set<string> {
  const finished = new Set<string>();
  for (const thread of threads) {
    if (thread.kind !== 'issue' || !thread.issueId) {
      continue;
    }
    const issue = lookup.issues.find((item) => item.id === thread.issueId);
    if (!issue) {
      continue;
    }
    const statuses = lookup.boards.find((board) => board.id === issue.boardId)?.statuses ?? [];
    const status = statusOf(statuses, issue.statusKey);
    if (status && isClosedCategory(status)) {
      finished.add(thread.id);
    }
  }
  return finished;
}
