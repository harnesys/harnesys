import type {
  FieldSpec,
  FieldValue,
  OrgAddonDetail,
  TriggerInstanceView,
} from '@harnesys/contracts';
import { DEFAULT_MODE_ID } from '@harnesys/studio-shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Agent } from '@/entities/agent';
import type { ClientAutomation } from '@/entities/automation';
import { deskAutomationsQueryKey } from '@/features/desk';
import {
  type AddonTriggerDescriptor,
  triggerDescriptorsFromDetail,
} from '@/features/manage-addons/lib/view-sections';
import {
  createOrgAddonTrigger,
  deleteOrgAddonTrigger,
  orgAddonDetailQuery,
  orgAddonDetailQueryKey,
  orgAddonTriggersQuery,
  patchOrgAddonTrigger,
} from '@/shared/api/addons';
import { studioPath } from '@/shared/config/routes';
import { buildValidator, FieldRenderer } from '@/shared/descriptor-forms';
import { resolveL10n } from '@/shared/lib/l10n';
import { type DialogComponentProps, dialog } from '@/shared/services/overlay';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { RowListSkeleton, SettingsErrorBanner } from '@/shared/ui/settings-kit';
import type {
  AddonTriggerDialogData,
  AddonTriggerDialogResult,
  AddonTriggerDraft,
} from '../model/addon-trigger';
import { resolveTriggerThread, TriggerTargetField } from './trigger-target-field';

function targetOf(target: unknown): {
  threadId?: string;
  agentId?: string;
  modeId?: string;
} {
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    return {};
  }
  const record = target as Record<string, unknown>;
  return {
    ...(typeof record.threadId === 'string' ? { threadId: record.threadId } : {}),
    ...(typeof record.agentId === 'string' ? { agentId: record.agentId } : {}),
    ...(typeof record.modeId === 'string' ? { modeId: record.modeId } : {}),
  };
}

export function openAddonTriggerConfigDialog(
  data: AddonTriggerDialogData,
): Promise<AddonTriggerDialogResult | null> {
  return dialog.open(AddonTriggerConfigDialog, {
    title: data.automation ? 'Edit automation' : 'New automation',
    className: 'sm:max-w-lg',
    data,
  });
}

export function AddonTriggerConfigDialog({
  data,
  onResolve,
}: DialogComponentProps<AddonTriggerDialogResult, AddonTriggerDialogData>) {
  const detail = useQuery(orgAddonDetailQuery(data?.orgId ?? '', data?.addonId ?? ''));
  const instances = useQuery(orgAddonTriggersQuery(data?.orgId ?? '', data?.addonId ?? ''));
  if (!data) {
    return null;
  }
  if (detail.isPending || instances.isPending) {
    return <RowListSkeleton rows={3} testId="addon-trigger-loading" />;
  }
  if (detail.isError || !detail.data) {
    return (
      <SettingsErrorBanner
        message={
          detail.error instanceof Error ? detail.error.message : 'Add-on details are unavailable.'
        }
      />
    );
  }
  const descriptor = triggerDescriptorsFromDetail(detail.data).find(
    (entry) => `${data.addonId}.${entry.kind}` === data.kind,
  );
  if (!descriptor) {
    return <SettingsErrorBanner message="This add-on no longer declares the selected trigger." />;
  }
  const instance = data.automation
    ? (instances.data?.items.find((entry) => entry.instanceId === data.automation?.id) ?? null)
    : null;
  return (
    <AddonTriggerForm
      orgId={data.orgId}
      addonId={data.addonId}
      agents={data.agents}
      automation={data.automation}
      instance={instance}
      descriptor={descriptor}
      detail={detail.data}
      onResolve={onResolve}
    />
  );
}

function AddonTriggerForm({
  orgId,
  addonId,
  agents,
  automation,
  instance,
  descriptor,
  detail,
  onResolve,
}: {
  orgId: string;
  addonId: string;
  agents: Agent[];
  automation: ClientAutomation | null;
  instance: TriggerInstanceView | null;
  descriptor: AddonTriggerDescriptor;
  detail: OrgAddonDetail;
  onResolve?: (value?: AddonTriggerDialogResult) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const target = targetOf(instance?.target);
  const firstAgent = agents.find((agent) => agent.id === target.agentId) ?? agents[0];
  const [draft, setDraft] = useState<AddonTriggerDraft>({
    label: automation?.label ?? resolveL10n(descriptor.title, 'en'),
    agentId: firstAgent?.id ?? '',
    threadId: target.threadId ?? '',
    modeId: target.modeId ?? firstAgent?.defaultModeId ?? DEFAULT_MODE_ID,
    config: (instance?.config ?? {}) as Record<string, FieldValue>,
  });
  const [error, setError] = useState<string | null>(null);
  const fields = descriptor.configFields ?? [];
  const connection = descriptor.connection
    ? detail.connections.find((entry) => entry.connectionId === descriptor.connection)
    : undefined;
  const missingConnection = connection ? connection.accountIds.length === 0 : false;
  const validation = buildValidator(fields)(draft.config, {});
  const canSave =
    draft.label.trim().length > 0 &&
    draft.agentId.length > 0 &&
    !missingConnection &&
    Object.keys(validation).length === 0;

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orgAddonDetailQueryKey(orgId, addonId) }),
      queryClient.invalidateQueries({ queryKey: deskAutomationsQueryKey(orgId) }),
    ]);
  const save = async () => {
    setError(null);
    try {
      const threadId = await resolveTriggerThread({
        agentId: draft.agentId,
        threadId: draft.threadId,
        label: draft.label.trim(),
      });
      const body = {
        triggerId: descriptor.kind,
        label: draft.label.trim(),
        config: draft.config,
        target: { threadId, agentId: draft.agentId, modeId: draft.modeId },
        enabled: true,
      };
      if (automation) {
        await patchOrgAddonTrigger(orgId, addonId, automation.id, body);
      } else {
        await createOrgAddonTrigger(orgId, addonId, body);
      }
      await invalidate();
      onResolve?.({ deleted: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const remove = async () => {
    if (!automation) {
      return;
    }
    setError(null);
    try {
      await deleteOrgAddonTrigger(orgId, addonId, automation.id);
      await invalidate();
      onResolve?.({ deleted: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const update = <K extends keyof AddonTriggerDraft>(key: K, value: AddonTriggerDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const setConfig = (key: string, value: FieldValue) => {
    setDraft((current) => ({ ...current, config: { ...current.config, [key]: value } }));
  };

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex items-center gap-2">
        <Badge variant="outline">{detail.title}</Badge>
        <span className="text-muted-foreground text-xs">{resolveL10n(descriptor.title, 'en')}</span>
      </div>
      {error ? <SettingsErrorBanner message={error} testId="addon-trigger-error" /> : null}
      {missingConnection ? (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-destructive text-sm">
            Connect a {connection?.label ?? descriptor.connection} account on the add-on page first.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => {
              onResolve?.();
              void navigate(studioPath.addon(orgId, addonId));
            }}
          >
            Open add-on
          </Button>
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <label className="font-medium text-xs" htmlFor="addon-trigger-label">
          Label
        </label>
        <input
          id="addon-trigger-label"
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
          value={draft.label}
          onChange={(event) => update('label', event.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="font-medium text-xs" htmlFor="addon-trigger-agent">
            Agent
          </label>
          <select
            id="addon-trigger-agent"
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
            value={draft.agentId}
            onChange={(event) => {
              const agent = agents.find((entry) => entry.id === event.target.value);
              setDraft((current) => ({
                ...current,
                agentId: event.target.value,
                threadId: '',
                modeId: agent?.defaultModeId ?? DEFAULT_MODE_ID,
              }));
            }}
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>
        <TriggerTargetField
          orgId={orgId}
          agentId={draft.agentId}
          value={draft.threadId}
          onChange={(threadId) => update('threadId', threadId)}
          currentThreadId={target.threadId}
        />
      </div>
      {fields.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="font-medium text-xs">{resolveL10n(descriptor.title, 'en')} settings</p>
          {fields.map((field: FieldSpec) => (
            <FieldRenderer
              key={field.key}
              field={field}
              value={draft.config[field.key]}
              onChange={(value) => setConfig(field.key, value)}
              disabled={false}
            />
          ))}
        </div>
      ) : null}
      {Object.keys(validation).length > 0 ? (
        <p className="text-destructive text-xs">Fill the required settings before saving.</p>
      ) : null}
      <DialogFooter>
        {automation ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            onClick={() => void remove()}
            disabled={!detail.installed}
          >
            Delete
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => onResolve?.()}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={!canSave}>
            {automation ? 'Save' : 'Create automation'}
          </Button>
        </div>
      </DialogFooter>
    </div>
  );
}
