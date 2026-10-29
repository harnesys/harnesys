import type { IssueRecord } from '@harnesys/studio-shared';
import { alert } from '@/shared/services/overlay';

export function confirmDeleteIssue(issue: IssueRecord): Promise<boolean> {
  return alert.confirm({
    title: `Delete "${issue.title}"?`,
    description: 'The issue will be permanently deleted.',
    confirmText: 'Delete issue',
    variant: 'destructive',
  });
}
