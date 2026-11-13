import type {
  FieldSpec,
  FieldValue,
  OrgAddonDetail,
  TriggerInstanceView,
} from '@harnesys/contracts';
import { type AgentMode, DEFAULT_MODE, DEFAULT_MODE_ID } from '@harnesys/studio-shared';
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { RowListSkeleton, SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { Textarea } from '@/shared/ui/textarea';
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
    className: 'sm:max-w-2xl',
    data,
  });
}

export function AddonTriggerConfigDialog({
  data,
  onResolve,
}: DialogComponentProps<AddonTriggerDialogResult, AddonTriggerDialogData>) {
  const detail = useQuery(orgAddonDetailQuery(data?.orgId ?? '', data?.addonId ?? ''));
  const instances = useQuery(orgAddonTriggersQuery(data?.orgId ?? '', data?.addonId ?? ''));
  const agents = data?.agents ?? [];
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
      agents={agents}
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
    instructions: instance?.instructions ?? '',
    config: (instance?.config ?? {}) as Record<string, FieldValue>,
  });
  const selectedAgent = agents.find((agent) => agent.id === draft.agentId);
  const agentModes =
    selectedAgent && 'modes' in selectedAgent ? ((selectedAgent.modes ?? []) as AgentMode[]) : [];
  const modeItems = [
    { value: DEFAULT_MODE_ID, label: DEFAULT_MODE.name },
    ...agentModes.map((mode) => ({ value: mode.id, label: mode.name })),
  ];
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
        instructions: draft.instructions.trim(),
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
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FieldGroup>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{detail.title}</Badge>
            <span className="text-muted-foreground text-xs">
              {resolveL10n(descriptor.title, 'en')}
            </span>
          </div>
          {error ? <SettingsErrorBanner message={error} testId="addon-trigger-error" /> : null}
          {missingConnection ? (
            <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-destructive text-sm">
                Connect a {connection?.label ?? descriptor.connection} account on the add-on page
                first.
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
          <Field data-invalid={draft.label.trim().length === 0 || undefined}>
            <FieldLabel htmlFor="addon-trigger-label">Name</FieldLabel>
            <div className="grid items-start gap-1.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Name</span>
                <Input
                  id="addon-trigger-label"
                  value={draft.label}
                  placeholder="New Gmail message"
                  aria-invalid={draft.label.trim().length === 0 || undefined}
                  onChange={(event) => update('label', event.target.value)}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Agent</span>
                <Select
                  items={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
                  value={draft.agentId || null}
                  onValueChange={(value) => {
                    if (typeof value === 'string') {
                      const agent = agents.find((entry) => entry.id === value);
                      setDraft((current) => ({
                        ...current,
                        agentId: value,
                        threadId: '',
                        modeId: agent?.defaultModeId ?? DEFAULT_MODE_ID,
                      }));
                    }
                  }}
                >
                  <SelectTrigger id="addon-trigger-agent" className="w-full">
                    <SelectValue placeholder="Select agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Field>
          <TriggerTargetField
            orgId={orgId}
            agentId={draft.agentId}
            value={draft.threadId}
            onChange={(threadId) => update('threadId', threadId)}
            currentThreadId={target.threadId}
          />
          <Field>
            <FieldLabel htmlFor="addon-trigger-mode">Mode</FieldLabel>
            <Select
              items={modeItems}
              value={draft.modeId}
              onValueChange={(value) => {
                if (typeof value === 'string') {
                  update('modeId', value);
                }
              }}
            >
              <SelectTrigger id="addon-trigger-mode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {modeItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {fields.length > 0 ? (
            <div className="flex flex-col gap-3 border-border/40 border-t pt-3">
              <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                {resolveL10n(descriptor.title, 'en')} settings
              </p>
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
          <Field>
            <FieldLabel htmlFor="addon-trigger-instructions">Instructions</FieldLabel>
            <Textarea
              id="addon-trigger-instructions"
              value={draft.instructions}
              onChange={(event) => update('instructions', event.target.value)}
              placeholder="What the agent should do with the trigger data"
              className="min-h-20"
              data-testid="addon-trigger-instructions"
            />
            <FieldDescription>
              Sent to the agent with every fired trigger, on top of the event data.
            </FieldDescription>
          </Field>
          {Object.keys(validation).length > 0 ? (
            <p className="text-destructive text-xs">Fill the required settings before saving.</p>
          ) : null}
        </FieldGroup>
      </div>
      <DialogFooter>
        {automation ? (
          <Button
            type="button"
            variant="ghost"
            className="mr-auto text-destructive hover:text-destructive"
            onClick={() => void remove()}
            disabled={!detail.installed}
          >
            Delete
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void save()} disabled={!canSave}>
          {automation ? 'Save' : 'Create automation'}
        </Button>
      </DialogFooter>
    </>
  );
}
