import type { AutomationKind } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { type ClientAutomation, isCoreAutomation, useAutomationStore } from '@/entities/automation';
import { listAutomationKinds } from '@/shared/api';

export interface ThreadTrigger {
  automation: ClientAutomation;
  kind?: AutomationKind;
}

export function useThreadTrigger(threadId: string, orgId: string): ThreadTrigger | null {
  const automation = useAutomationStore((state) =>
    state.items.find(
      (item) => item.projectId === orgId && item.threadId === threadId && !isCoreAutomation(item),
    ),
  );
  const kinds = useQuery({
    queryKey: ['automation-kinds', orgId],
    queryFn: () => listAutomationKinds(orgId),
    enabled: Boolean(orgId) && Boolean(automation),
  });
  if (!automation) {
    return null;
  }
  const kind = kinds.data?.find(
    (item) => item.integrationId === automation.integrationId && item.kind === automation.kind,
  );
  return { automation, kind };
}
