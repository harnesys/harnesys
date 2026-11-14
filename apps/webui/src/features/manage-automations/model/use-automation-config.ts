import { useQueryClient } from '@tanstack/react-query';
import { deskAutomationsQueryKey } from '@/features/desk';
import { findIntegrationUi } from '@/integrations/registry';
import type { AutomationConfigInput } from '@/integrations/types';
import { openAddonTriggerConfigDialog } from '../ui/addon-trigger-config-dialog';

export function useAutomationConfig(): (input: AutomationConfigInput) => Promise<void> {
  const queryClient = useQueryClient();
  return async (input: AutomationConfigInput): Promise<void> => {
    if (input.source === 'addon') {
      await openAddonTriggerConfigDialog({
        orgId: input.scopeId,
        addonId: input.integrationId,
        kind: input.kind,
        agents: input.agents,
        automation: input.automation,
      });
    } else {
      const entry = findIntegrationUi(input.integrationId)?.automationKinds[input.kind];
      if (!entry) {
        return;
      }
      await entry.openConfig(input);
    }
    void queryClient.invalidateQueries({ queryKey: deskAutomationsQueryKey(input.scopeId) });
  };
}
