import { useIssueStore } from '@/entities/issue';
import { listIssues } from '@/shared/api';

export async function refreshIssueAttachmentCounts(orgId: string): Promise<void> {
  const items = await listIssues(orgId);
  const store = useIssueStore.getState();
  for (const issue of items) {
    store.setAttachmentCount(issue.id, issue.attachmentCount ?? 0);
  }
}
