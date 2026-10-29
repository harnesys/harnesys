import { Fragment, type ReactNode } from 'react';
import type { Agent } from '@/entities/agent';
import type { Schedule } from '@/entities/schedule';
import { useThreadStore } from '@/entities/thread';
import type { Webhook } from '@/entities/webhook';
import { useIdeStore } from '@/features/ide';
import {
  deleteSchedule,
  openScheduleConfigDialog,
  updateSchedule,
} from '@/features/manage-schedule';
import { deleteWebhook, openWebhookConfigDialog, updateWebhook } from '@/features/manage-webhook';
import { useOrgId } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import {
  AutomationsSectionCreateButton,
  useCreateAutomation,
} from './automation-create-picker-dialog';
import { ScheduleRow } from './schedule-row';
import { SidebarEmpty } from './sidebar-empty';
import { WebhookRow } from './webhook-row';
export const AutomationsSectionActions = AutomationsSectionCreateButton;
export interface AutomationsSectionProps {
  agents: Agent[];
  schedules: Schedule[];
  webhooks: Webhook[];
  activeScheduleId: string | null;
  activeWebhookId: string | null;
  activeThreadId: string | null;
  onSelectDone: () => void;
}
interface AutomationEntry {
  key: string;
  updatedAt: string;
  node: ReactNode;
}
export function AutomationsSection({
  agents,
  schedules,
  webhooks,
  activeScheduleId,
  activeWebhookId,
  activeThreadId,
  onSelectDone,
}: AutomationsSectionProps) {
  const orgId = useOrgId() ?? '';
  const { openDesk, openSchedule, openWebhook } = useStudioNavigation();
  const createAutomation = useCreateAutomation(agents, onSelectDone);
  const openScheduleTab = (item: Schedule) => {
    useIdeStore.getState().openSchedule(item.projectId, item.id, item.threadId, item.targetAgentId);
    openSchedule(item.projectId, item.id);
  };
  const openWebhookTab = (item: Webhook) => {
    const agentId = useThreadStore.getState().byId(item.threadId)?.agentId;
    useIdeStore
      .getState()
      .openWebhook(item.projectId, item.id, item.threadId, agentId ?? item.targetAgentId);
    openWebhook(item.projectId, item.id);
  };
  const projectAgentsFor = (scopeId: string): Agent[] =>
    agents.filter((item) => item.orgId === scopeId || item.orgId === orgId);
  const scheduleEntry = (item: Schedule): AutomationEntry => ({
    key: `scheduler:${item.id}`,
    updatedAt: item.updatedAt,
    node: (
      <ScheduleRow
        schedule={item}
        selected={activeScheduleId === item.id}
        onSelect={() => {
          openScheduleTab(item);
          onSelectDone();
        }}
        onSettings={() => {
          void openScheduleConfigDialog(
            projectAgentsFor(item.projectId),
            item.projectId,
            item,
          ).then(async (result) => {
            if (!result) {
              return;
            }
            if (result.deleted) {
              const removed = await deleteSchedule(item.projectId, item.id);
              if (removed) {
                useIdeStore.getState().closeByEntity(item.projectId, 'schedule', item.id);
                if (item.threadId === activeThreadId || activeScheduleId === item.id) {
                  openDesk();
                }
              }
              return;
            }
            await updateSchedule(item.projectId, item.id, result.draft);
          });
        }}
      />
    ),
  });
  const webhookEntry = (item: Webhook): AutomationEntry => ({
    key: `webhook:${item.id}`,
    updatedAt: item.updatedAt,
    node: (
      <WebhookRow
        webhook={item}
        selected={activeWebhookId === item.id}
        onSelect={() => {
          openWebhookTab(item);
          onSelectDone();
        }}
        onSettings={() => {
          void openWebhookConfigDialog(projectAgentsFor(item.projectId), item.projectId, item).then(
            async (result) => {
              if (!result) {
                return;
              }
              if (result.deleted) {
                await deleteWebhook(item.projectId, item);
                useIdeStore.getState().closeByEntity(item.projectId, 'webhook', item.id);
                if (item.threadId === activeThreadId || activeWebhookId === item.id) {
                  openDesk();
                }
                return;
              }
              await updateWebhook(item.projectId, item.id, result.draft);
            },
          );
        }}
      />
    ),
  });
  const entries: AutomationEntry[] = [
    ...schedules.map(scheduleEntry),
    ...webhooks.map(webhookEntry),
  ];
  entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (entries.length === 0) {
    return (
      <SidebarEmpty
        title="No automations yet"
        onAction={createAutomation}
        testId="automations-empty"
      />
    );
  }
  return (
    <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:items-center">
      {entries.map((entry) => (
        <Fragment key={entry.key}>{entry.node}</Fragment>
      ))}
    </div>
  );
}
