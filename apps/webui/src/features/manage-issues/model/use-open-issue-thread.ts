import { useOpenThreadTab } from '@/features/ide';
import { useOrgId } from '@/shared/config/location';

export function useOpenIssueThread() {
  const openThreadTab = useOpenThreadTab();
  const orgId = useOrgId() ?? '';
  return (threadId: string, agentId: string) => {
    openThreadTab(orgId, agentId, threadId);
  };
}
