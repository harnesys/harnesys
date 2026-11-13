import type { FieldValue, OrgAddonDetail, TriggerInstanceView } from '@harnesys/contracts';
import { type AgentMode, DEFAULT_MODE, DEFAULT_MODE_ID } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Agent } from '@/entities/agent';
import type { ClientAutomation } from '@/entities/automation';
import {
  type AddonTriggerDescriptor,
  triggerDescriptorsFromDetail,
} from '@/features/manage-addons/lib/view-sections';
import { CronComposer } from '@/features/manage-schedule/ui/cron-composer';
import { orgAddonDetailQuery, orgAddonTriggersQuery } from '@/shared/api/addons';
import { studioPath } from '@/shared/config/routes';
import {
  buildValidator,
  FieldsRenderer,
  type FormWidgetProps,
  initialFieldValues,
  registerFormWidget,
} from '@/shared/descriptor-forms';
import { resolveL10n } from '@/shared/lib/l10n';
import { type DialogComponentProps, dialog } from '@/shared/services/overlay';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { RowListSkeleton, SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { Textarea } from '@/shared/ui/textarea';
import type {
  AddonTriggerDialogData,
  AddonTriggerDialogResult,
  AddonTriggerDraft,
} from '../model/addon-trigger';
import { useAddonTriggerActions } from '../model/addon-trigger';
import { ModeBlock, NameAgentBlock } from './trigger-standard-blocks';
import { resolveTriggerThread, TriggerTargetField } from './trigger-target-field';

function CronField({ value, onChange }: FormWidgetProps) {
  return (
    <CronComposer
      value={typeof value === 'string' ? value : ''}
      onChange={(cron) => onChange(cron)}
    />
  );
}

registerFormWidget('cron', CronField);

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
  const navigate = useNavigate();
  const target = targetOf(instance?.target);
  const [draft, setDraft] = useState<AddonTriggerDraft>(() =>
    initialDraft({ descriptor, automation, instance, agents, target }),
  );
  const selectedAgent = agents.find((agent) => agent.id === draft.agentId);
  const agentModes =
    selectedAgent && 'modes' in selectedAgent ? ((selectedAgent.modes ?? []) as AgentMode[]) : [];
  const modeItems = [
    { value: DEFAULT_MODE_ID, label: DEFAULT_MODE.name },
    ...agentModes.map((mode) => ({ value: mode.id, label: mode.name })),
  ];
  const [error, setError] = useState<string | null>(null);
  const fields = descriptor.configFields ?? [];
  const standard = descriptor.standard ?? {};
  const connection = descriptor.connection
    ? detail.connections.find((entry) => entry.connectionId === descriptor.connection)
    : undefined;
  const missingConnection = connection ? connection.accountIds.length === 0 : false;
  const validation = buildValidator(fields)(draft.config, {});
  const instructionsMissing =
    standard.instructions?.required === true && draft.instructions.trim().length === 0;
  const canSave =
    draft.label.trim().length > 0 &&
    draft.agentId.length > 0 &&
    !missingConnection &&
    !instructionsMissing &&
    Object.keys(validation).length === 0;

  const actions = useAddonTriggerActions(orgId, addonId, automation);
  const save = async () => {
    setError(null);
    try {
      const threadId = await resolveTriggerThread({
        agentId: draft.agentId,
        threadId: draft.threadId,
        label: draft.label.trim(),
      });
      await actions.save(
        {
          triggerId: descriptor.kind,
          label: draft.label.trim(),
          config: draft.config,
          instructions: draft.instructions.trim(),
          target: { threadId, agentId: draft.agentId, modeId: draft.modeId },
          enabled: true,
        },
        threadId,
      );
      onResolve?.({ deleted: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const remove = async () => {
    setError(null);
    try {
      const deleted = await actions.remove();
      onResolve?.({ deleted });
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
            <ConnectionMissingBanner
              label={connection?.label ?? descriptor.connection ?? 'required'}
              onOpen={() => {
                onResolve?.();
                void navigate(studioPath.addon(orgId, addonId));
              }}
            />
          ) : null}
          {standard.name?.disabled ? null : (
            <NameAgentBlock
              standard={standard}
              label={draft.label}
              agents={agents}
              agentId={draft.agentId}
              onLabel={(value) => update('label', value)}
              onAgent={(value) => {
                const agent = agents.find((entry) => entry.id === value);
                setDraft((current) => ({
                  ...current,
                  agentId: value,
                  threadId: '',
                  modeId: agent?.defaultModeId ?? DEFAULT_MODE_ID,
                }));
              }}
            />
          )}
          {standard.target?.disabled ? null : (
            <TriggerTargetField
              orgId={orgId}
              agentId={draft.agentId}
              value={draft.threadId}
              onChange={(threadId) => update('threadId', threadId)}
              currentThreadId={target.threadId}
            />
          )}
          {standard.mode?.disabled ? null : (
            <ModeBlock
              standard={standard}
              modeItems={modeItems}
              modeId={draft.modeId}
              onChange={(value) => update('modeId', value)}
            />
          )}
          {fields.length > 0 ? (
            <div className="flex flex-col gap-3 border-border/40 border-t pt-3">
              <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                {resolveL10n(descriptor.title, 'en')} settings
              </p>
              <FieldsRenderer
                fields={fields}
                values={draft.config}
                errors={validation}
                onChange={setConfig}
              />
            </div>
          ) : null}{' '}
          {standard.instructions?.disabled ? null : (
            <Field>
              <FieldLabel htmlFor="addon-trigger-instructions">
                {standard.instructions?.label ?? 'Instructions'}
                {standard.instructions?.required ? (
                  <span className="text-destructive"> *</span>
                ) : null}
              </FieldLabel>
              <Textarea
                id="addon-trigger-instructions"
                value={draft.instructions}
                onChange={(event) => update('instructions', event.target.value)}
                placeholder="What the agent should do with the trigger data"
                className="min-h-20"
                data-testid="addon-trigger-instructions"
              />
              <FieldDescription>
                {standard.instructions?.help ??
                  'Sent to the agent with every fired trigger, on top of the event data.'}
              </FieldDescription>
            </Field>
          )}
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

function initialDraft(input: {
  descriptor: AddonTriggerDescriptor;
  automation: ClientAutomation | null;
  instance: TriggerInstanceView | null;
  agents: Agent[];
  target: { threadId?: string; agentId?: string; modeId?: string };
}): AddonTriggerDraft {
  const firstAgent =
    input.agents.find((agent) => agent.id === input.target.agentId) ?? input.agents[0];
  return {
    label: input.automation?.label ?? resolveL10n(input.descriptor.title, 'en'),
    agentId: firstAgent?.id ?? '',
    threadId: input.target.threadId ?? '',
    modeId: input.target.modeId ?? firstAgent?.defaultModeId ?? DEFAULT_MODE_ID,
    instructions: input.instance?.instructions ?? '',
    config: initialFieldValues(
      input.descriptor.configFields ?? [],
      (input.instance?.config ?? {}) as Record<string, FieldValue>,
    ),
  };
}
