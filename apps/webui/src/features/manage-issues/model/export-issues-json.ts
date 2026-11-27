import type { IssueBoardRecord, IssueRecord } from '@harnesys/studio-shared';
import { downloadJson } from '@/shared/lib/download-json';

export function issuesJsonFilename(board: IssueBoardRecord, now: Date = new Date()): string {
  const slug = board.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `issues-${slug || 'board'}-${now.toISOString().slice(0, 10)}.json`;
}

export function exportBoardIssuesJson(board: IssueBoardRecord, issues: IssueRecord[]): void {
  const sorted = [...issues].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  downloadJson(issuesJsonFilename(board), {
    exportedAt: new Date().toISOString(),
    board: {
      id: board.id,
      name: board.name,
      description: board.description,
      statuses: board.statuses,
    },
    issueCount: sorted.length,
    issues: sorted,
  });
}
