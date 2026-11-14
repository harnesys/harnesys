import type { AutomationKind } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightIcon, PlusIcon } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import type { Agent } from '@/entities/agent';
import { CORE_AUTOMATION_INTEGRATION_ID } from '@/entities/automation';
import { useActiveOrgStore } from '@/entities/org-machine';
import { useAutomationConfig } from '@/features/manage-automations';
import type { WebuiIntegrationDescriptor } from '@/integrations/registry';
import { findIntegrationUi } from '@/integrations/registry';
import { listAutomationKinds } from '@/shared/api';
import { orgAddonsQuery } from '@/shared/api/addons';
import { useOrgId } from '@/shared/config/location';
import { softTint } from '@/shared/lib/color';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { IconRef } from '@/shared/ui/icon';

interface PickerData {
  orgId: string;
  kinds: AutomationKind[];
}
type PickerChoice =
  | { source: 'integration'; integrationId: string; kind: string }
  | { source: 'addon'; integrationId: string; kind: string };

const INTEGRATION_CARD_COLOR = '#8b5cf6';
const ADDON_CARD_COLOR = '#10b981';

function AutomationCreatePickerDialog({
  onResolve,
  data,
}: DialogComponentProps<PickerChoice | null, PickerData>) {
  const addons = useQuery(orgAddonsQuery(data?.orgId ?? ''));
  const contributions = (data?.kinds ?? []).filter(
    (kind) => kind.integrationId !== CORE_AUTOMATION_INTEGRATION_ID,
  );
  const addonTitle = (addonId: string) =>
    addons.data?.items.find((item) => item.addonId === addonId)?.title ?? addonId;
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {contributions.map((kind) =>
        kind.source === 'addon' ? (
          <AutomationCard
            key={`${kind.integrationId}:${kind.kind}`}
            testId={`automation-create-${kind.kind}`}
            iconSlot={<IconRef icon={kind.icon || 'puzzle'} className="size-4.5" />}
            color={kind.color || ADDON_CARD_COLOR}
            title={kind.label}
            meta={
              kind.requiresConnection && !kind.connected
                ? `${addonTitle(kind.integrationId)} · Connect required`
                : addonTitle(kind.integrationId)
            }
            description={kind.description}
            onPick={() =>
              onResolve?.({
                source: 'addon',
                integrationId: kind.integrationId,
                kind: kind.kind,
              })
            }
          />
        ) : (
          <AutomationCard
            key={`${kind.integrationId}:${kind.kind}`}
            testId={`automation-create-${kind.kind}`}
            iconSlot={integrationCardSlot(kind, findIntegrationUi(kind.integrationId))}
            color={kind.color || INTEGRATION_CARD_COLOR}
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
        ),
      )}
    </div>
  );
}

function integrationCardSlot(
  kind: AutomationKind,
  descriptor: WebuiIntegrationDescriptor | undefined,
): ReactNode {
  if (descriptor) {
    const Icon: ComponentType<{ className?: string }> = descriptor.icon;
    return <Icon className="size-4.5" />;
  }
  return <IconRef icon={kind.icon} className="size-4.5" />;
}

function AutomationCard({
  testId,
  iconSlot,
  color,
  title,
  meta,
  description,
  onPick,
}: {
  testId: string;
  iconSlot: ReactNode;
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
      className="group flex h-full flex-col gap-2.5 rounded-xl border bg-popover p-3.5 text-left outline-none transition-all hover:border-foreground/20 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span className="flex items-center gap-2.5">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: softTint(color), color }}
        >
          {iconSlot}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-sm">{title}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{meta}</span>
        </span>
        <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
      <span className="line-clamp-3 text-muted-foreground text-xs">{description}</span>
    </button>
  );
}
function openAutomationCreatePicker(kinds: AutomationKind[], orgId: string) {
  return dialog.open(AutomationCreatePickerDialog, {
    title: 'New automation',
    description: 'Choose how the agent should be triggered.',
    className: 'sm:max-w-3xl',
    testId: 'automation-create-picker',
    data: { orgId, kinds },
  });
}
export function useCreateAutomation(agents: Agent[], onDone?: () => void): () => void {
  const configure = useAutomationConfig();
  const urlOrgId = useOrgId();
  const storeOrgId = useActiveOrgStore((state) => state.orgId);
  const orgId = urlOrgId ?? storeOrgId ?? '';
  return () => {
    const scopeId = orgId;
    const orgAgents = agents.filter(
      (item) => item.orgId === scopeId || item.orgId === orgId || !item.orgId,
    );
    const createFromIntegration = async (choice: {
      source: 'integration' | 'addon';
      integrationId: string;
      kind: string;
    }) => {
      await configure({
        integrationId: choice.integrationId,
        kind: choice.kind,
        source: choice.source,
        scopeId,
        agents: orgAgents,
        automation: null,
      });
      onDone?.();
    };
    void (async () => {
      const kinds = orgId ? await listAutomationKinds(orgId).catch(() => []) : [];
      const choice = await openAutomationCreatePicker(kinds, orgId);
      if (!choice) {
        return;
      }
      await createFromIntegration(choice);
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
