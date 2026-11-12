import { useQueryClient } from '@tanstack/react-query';
import {
  type ClientAutomation,
  CORE_AUTOMATION_INTEGRATION_ID,
  isScheduleAutomationKind,
} from '@/entities/automation';
import { useScheduleStore } from '@/entities/schedule';
import { useWebhookStore } from '@/entities/webhook';
import { deskAutomationsQueryKey } from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import {
  deleteSchedule,
  openScheduleConfigDialog,
  updateSchedule,
} from '@/features/manage-schedule';
import { deleteWebhook, openWebhookConfigDialog, updateWebhook } from '@/features/manage-webhook';
import { findIntegrationUi } from '@/integrations/registry';
import type { AutomationConfigInput } from '@/integrations/types';
import { openAddonTriggerConfigDialog } from '../ui/addon-trigger-config-dialog';

async function configureCoreAutomation(
  automation: ClientAutomation,
  input: AutomationConfigInput,
): Promise<void> {
  if (isScheduleAutomationKind(automation.kind)) {
    const schedule = useScheduleStore.getState().byId(automation.id);
    if (!schedule) {
      return;
    }
    const result = await openScheduleConfigDialog(input.agents, schedule.projectId, schedule);
    if (!result) {
      return;
    }
    if (result.deleted) {
      const removed = await deleteSchedule(schedule.projectId, schedule.id);
      if (removed) {
        useIdeStore.getState().closeByEntity(schedule.projectId, 'schedule', schedule.id);
      }
      return;
    }
    await updateSchedule(schedule.projectId, schedule.id, result.draft);
    return;
  }
  if (automation.kind !== 'webhook') {
    return;
  }
  const webhook = useWebhookStore.getState().byId(automation.id);
  if (!webhook) {
    return;
  }
  const result = await openWebhookConfigDialog(input.agents, webhook.projectId, webhook);
  if (!result) {
    return;
  }
  if (result.deleted) {
    await deleteWebhook(webhook.projectId, webhook);
    useIdeStore.getState().closeByEntity(webhook.projectId, 'webhook', webhook.id);
    return;
  }
  await updateWebhook(webhook.projectId, webhook.id, result.draft);
}

export function useAutomationConfig(): (input: AutomationConfigInput) => Promise<void> {
  const queryClient = useQueryClient();
  return async (input: AutomationConfigInput): Promise<void> => {
    if (input.integrationId === CORE_AUTOMATION_INTEGRATION_ID) {
      if (!input.automation) {
        return;
      }
      await configureCoreAutomation(input.automation, input);
    } else if (input.source === 'addon') {
      const result = await openAddonTriggerConfigDialog({
        orgId: input.scopeId,
        addonId: input.integrationId,
        kind: input.kind,
        automation: input.automation,
      });
      if (!result) {
        return;
      }
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
