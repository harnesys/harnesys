import type { OrgAddonDetail, TriggerInstanceView } from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ClientAutomation } from '@/entities/automation';
import { useAgentStore } from '@/entities/agent';
import { openAddonTriggerConfigDialog } from '@/features/manage-automations/ui/addon-trigger-config-dialog';
import {
  deleteOrgAddonTrigger,
  orgAddonDetailQueryKey,
  orgAddonTriggersQuery,
  setOrgAddonTriggerEnabled,
} from '@/shared/api/addons';
import { resolveL10n } from '@/shared/lib/l10n';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { RowItem, RowSection } from '@/shared/ui/capability-rows';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { Switch } from '@/shared/ui/switch';
import type { SectionProps } from '../lib/section-props';
import type { AddonTriggerDescriptor } from '../lib/view-sections';
import { triggerDescriptorsFromDetail } from '../lib/view-sections';

export function AutomationsSection({ orgId, detail, section }: SectionProps) {
  const descriptors = triggerDescriptorsFromDetail(detail);
  const onlyTriggers = Array.isArray(section.triggers) ? (section.triggers as string[]) : undefined;
  const visible = onlyTriggers
    ? descriptors.filter((descriptor) => onlyTriggers.includes(descriptor.kind))
    : descriptors;
  if (visible.length === 0) {
    return null;
  }
  return (
    <RowSection
      label="Automations"
      count={visible.length}
      actions={<NewTriggerButton orgId={orgId} detail={detail} descriptors={visible} />}
    >
      <TriggerList orgId={orgId} addonId={detail.addonId} />
    </RowSection>
  );
}

function TriggerList({ orgId, addonId }: { orgId: string; addonId: string }) {
  const queryClient = useQueryClient();
  const result = useQuery(orgAddonTriggersQuery(orgId, addonId));
  const instances = result.data?.items ?? [];
  const [error, setError] = useState<string | null>(null);
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: orgAddonDetailQueryKey(orgId, addonId),
    });

  const toggle = async (instance: TriggerInstanceView) => {
    setError(null);
    try {
      await setOrgAddonTriggerEnabled(orgId, addonId, instance.instanceId, !instance.enabled);
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const remove = async (instance: TriggerInstanceView) => {
    setError(null);
    try {
      await deleteOrgAddonTrigger(orgId, addonId, instance.instanceId);
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openEditor = (instance: TriggerInstanceView) => {
    void openAddonTriggerConfigDialog({
      orgId,
      addonId,
      kind: `${addonId}.${instance.triggerId}`,
      agents: useAgentStore.getState().inOrg(orgId),
      automation: automationFromInstance(instance, orgId, addonId),
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {error ? <SettingsErrorBanner message={error} testId="addon-triggers-error" /> : null}
      {instances.length === 0 ? (
        <RowItem title="No trigger instances" description="Create one with New trigger." />
      ) : (
        instances.map((instance) => (
          <div
            key={instance.instanceId}
            className="flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5"
            data-testid={`addon-trigger-${instance.instanceId}`}
          >
            <Switch
              checked={instance.enabled}
              onCheckedChange={() => void toggle(instance)}
              aria-label={`Toggle ${instance.label}`}
            />
            <span className="min-w-0 flex-1 truncate text-sm">{instance.label}</span>
            <Badge variant="outline">{instance.triggerId}</Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => openEditor(instance)}
              data-testid={`addon-trigger-edit-${instance.instanceId}`}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => void remove(instance)}
              data-testid={`addon-trigger-delete-${instance.instanceId}`}
            >
              Delete
            </Button>
          </div>
        ))
      )}
    </div>
  );
}

function NewTriggerButton({
  orgId,
  detail,
  descriptors,
}: {
  orgId: string;
  detail: OrgAddonDetail;
  descriptors: AddonTriggerDescriptor[];
}) {
  const open = (kind: string) => {
    void openAddonTriggerConfigDialog({
      orgId,
      addonId: detail.addonId,
      kind: `${detail.addonId}.${kind}`,
      agents: useAgentStore.getState().inOrg(orgId),
      automation: null,
    });
  };
  if (descriptors.length === 1) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => open(descriptors[0].kind)}
        data-testid="addon-trigger-new"
      >
        New trigger
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" variant="outline" size="sm" data-testid="addon-trigger-new" />
        }
      >
        New trigger
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {descriptors.map((descriptor) => (
          <DropdownMenuItem key={descriptor.kind} onClick={() => open(descriptor.kind)}>
            {resolveL10n(descriptor.title, 'en')}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function automationFromInstance(
  instance: TriggerInstanceView,
  orgId: string,
  addonId: string,
): ClientAutomation {
  return {
    id: instance.instanceId,
    projectId: orgId,
    integrationId: addonId,
    kind: instance.triggerId,
    source: 'addon',
    label: instance.label,
    description: '',
    status: instance.enabled ? 'active' : 'paused',
    threadId: null,
    targetAgentId: null,
    connection: { required: false, connected: true },
    meta: {},
    availableAt: null,
    updatedAt: instance.updatedAt,
  };
}
