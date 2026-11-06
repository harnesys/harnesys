import type { AutomationKind } from '@harnesys/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRightIcon, CalendarClockIcon, PlusIcon, WebhookIcon, ZapIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import type { Agent } from '@/entities/agent';
import { CORE_AUTOMATION_INTEGRATION_ID } from '@/entities/automation';
import { useActiveOrgStore } from '@/entities/org-machine';
import { useThreadStore } from '@/entities/thread';
import type { Webhook } from '@/entities/webhook';
import { deskAutomationsQueryKey } from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import { useAutomationConfig } from '@/features/manage-automations';
import { createSchedule, openScheduleConfigDialog } from '@/features/manage-schedule';
import { createWebhook, openWebhookConfigDialog } from '@/features/manage-webhook';
import type { WebuiIntegrationDescriptor } from '@/integrations/registry';
import { findIntegrationUi } from '@/integrations/registry';
import { listAutomationKinds } from '@/shared/api';
import { useOrgId } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { softTint } from '@/shared/lib/color';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';

interface PickerData {
  kinds: AutomationKind[];
}
type PickerChoice =
  | { source: 'core'; kind: 'scheduler' | 'webhook' }
  | { source: 'integration'; integrationId: string; kind: string };

const CORE_CARD_COLOR = '#f59e0b';
const WEBHOOK_CARD_COLOR = '#0ea5e9';
const INTEGRATION_CARD_COLOR = '#8b5cf6';

function AutomationCreatePickerDialog({
  onResolve,
  data,
}: DialogComponentProps<PickerChoice | null, PickerData>) {
  const contributions = (data?.kinds ?? []).filter(
    (kind) => kind.integrationId !== CORE_AUTOMATION_INTEGRATION_ID,
  );
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <AutomationCard
        testId="automation-create-scheduler"
        icon={CalendarClockIcon}
        color={CORE_CARD_COLOR}
        title="Scheduler"
        meta="Cron schedule"
        description="Run an agent on a cron"
        onPick={() => onResolve?.({ source: 'core', kind: 'scheduler' })}
      />
      <AutomationCard
        testId="automation-create-webhook"
        icon={WebhookIcon}
        color={WEBHOOK_CARD_COLOR}
        title="Webhook"
        meta="HTTP trigger"
        description="Trigger from an HTTP endpoint"
        onPick={() => onResolve?.({ source: 'core', kind: 'webhook' })}
      />
      {contributions.map((kind) => (
        <AutomationCard
          key={`${kind.integrationId}:${kind.kind}`}
          testId={`automation-create-${kind.kind}`}
          icon={integrationCardIcon(findIntegrationUi(kind.integrationId))}
          color={INTEGRATION_CARD_COLOR}
          title={kind.label}
          meta={findIntegrationUi(kind.integrationId)?.title ?? kind.integrationId}
          description={kind.description}
          onPick={() =>
            onResolve?.({
              source: 'integration',
              integrationId: kind.integrationId,
              kind: kind.kind,
            })
          }
        />
      ))}
    </div>
  );
}

function integrationCardIcon(
  descriptor: WebuiIntegrationDescriptor | undefined,
): ComponentType<{ className?: string }> {
  return descriptor?.icon ?? ZapIcon;
}

function AutomationCard({
  testId,
  icon: Icon,
  color,
  title,
  meta,
  description,
  onPick,
}: {
  testId: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  title: string;
  meta: string;
  description: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onPick}
      className="group flex flex-col gap-2.5 rounded-xl border bg-popover p-3.5 text-left outline-none transition-all hover:border-foreground/20 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span className="flex items-center gap-2.5">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: softTint(color), color }}
        >
          <Icon className="size-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-sm">{title}</span>
          <span className="block text-[11px] text-muted-foreground">{meta}</span>
        </span>
        <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
      <span className="text-muted-foreground text-xs">{description}</span>
    </button>
  );
}
function openAutomationCreatePicker(kinds: AutomationKind[]) {
  return dialog.open(AutomationCreatePickerDialog, {
    title: 'New automation',
    description: 'Choose how the agent should be triggered.',
    className: 'sm:max-w-md',
    testId: 'automation-create-picker',
    data: { kinds },
  });
}
export function useCreateAutomation(agents: Agent[], onDone?: () => void): () => void {
  const { openSchedule, openWebhook } = useStudioNavigation();
  const configure = useAutomationConfig();
  const queryClient = useQueryClient();
  const urlOrgId = useOrgId();
  const storeOrgId = useActiveOrgStore((state) => state.orgId);
  const orgId = urlOrgId ?? storeOrgId ?? '';
  return () => {
    const scopeId = orgId;
    const orgAgents = agents.filter(
      (item) => item.orgId === scopeId || item.orgId === orgId || !item.orgId,
    );
    const openWebhookTab = (item: Webhook) => {
      const agentId = useThreadStore.getState().byId(item.threadId)?.agentId;
      useIdeStore
        .getState()
        .openWebhook(scopeId, item.id, item.threadId, agentId ?? item.targetAgentId);
      openWebhook(scopeId, item.id);
    };
    const refreshAutomations = () => {
      void queryClient.invalidateQueries({ queryKey: deskAutomationsQueryKey(scopeId) });
    };
    const createFromIntegration = async (choice: { integrationId: string; kind: string }) => {
      await configure({
        integrationId: choice.integrationId,
        kind: choice.kind,
        scopeId,
        agents: orgAgents,
        automation: null,
      });
      onDone?.();
    };
    const createFromScheduler = async () => {
      const result = await openScheduleConfigDialog(orgAgents, scopeId);
      if (!result || result.deleted) {
        return;
      }
      const created = await createSchedule(scopeId, result.draft);
      if (!created) {
        return;
      }
      useIdeStore
        .getState()
        .openSchedule(scopeId, created.id, created.threadId, created.targetAgentId);
      openSchedule(scopeId, created.id);
      refreshAutomations();
      onDone?.();
    };
    const createFromWebhook = async () => {
      const result = await openWebhookConfigDialog(orgAgents, scopeId);
      if (!result || result.deleted) {
        return;
      }
      const created = await createWebhook(scopeId, result.draft);
      if (!created) {
        return;
      }
      openWebhookTab(created);
      refreshAutomations();
      onDone?.();
    };
    void (async () => {
      const kinds = orgId ? await listAutomationKinds(orgId).catch(() => []) : [];
      const choice = await openAutomationCreatePicker(kinds);
      if (!choice) {
        return;
      }
      if (choice.source === 'integration') {
        await createFromIntegration(choice);
        return;
      }
      if (choice.kind === 'scheduler') {
        await createFromScheduler();
        return;
      }
      await createFromWebhook();
    })();
  };
}

export function AutomationsSectionCreateButton({
  agents,
  onDone,
}: {
  agents: Agent[];
  onDone?: () => void;
}) {
  const createAutomation = useCreateAutomation(agents, onDone);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      title="New automation"
      aria-label="New automation"
      data-testid="automations-create"
      onClick={createAutomation}
    >
      <PlusIcon className="size-3.5 text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
      <span className="sr-only">New automation</span>
    </Button>
  );
}
