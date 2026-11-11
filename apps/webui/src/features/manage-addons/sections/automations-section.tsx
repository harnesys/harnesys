import type { FieldValue, OrgAddonDetail, TriggerInstanceView } from '@harnesys/contracts';
import { DEFAULT_MODE_ID } from '@harnesys/studio-shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  resolveTriggerThread,
  TriggerTargetField,
} from '@/features/manage-automations/ui/trigger-target-field';
import {
  createOrgAddonTrigger,
  deleteOrgAddonTrigger,
  orgAddonDetailQueryKey,
  orgAddonTriggersQuery,
  setOrgAddonTriggerEnabled,
} from '@/shared/api/addons';
import { orgAgentsQuery } from '@/shared/api/org-agents';
import { FieldRenderer } from '@/shared/descriptor-forms';
import { resolveL10n } from '@/shared/lib/l10n';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { RowItem, RowSection } from '@/shared/ui/capability-rows';
import { SettingsErrorBanner, SettingsField } from '@/shared/ui/settings-kit';
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
    <RowSection label="Automations" count={visible.length}>
      <TriggerList orgId={orgId} addonId={detail.addonId} />
      <TriggerCreateForm orgId={orgId} detail={detail} descriptors={visible} />
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

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {error ? <SettingsErrorBanner message={error} testId="addon-triggers-error" /> : null}
      {instances.length === 0 ? (
        <RowItem title="No trigger instances" description="Create one below." />
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

function TriggerCreateForm({
  orgId,
  detail,
  descriptors,
}: {
  orgId: string;
  detail: OrgAddonDetail;
  descriptors: AddonTriggerDescriptor[];
}) {
  const queryClient = useQueryClient();
  const agents = useQuery(orgAgentsQuery);
  const [kind, setKind] = useState(descriptors[0]?.kind ?? '');
  const [label, setLabel] = useState('');
  const [agentId, setAgentId] = useState('');
  const [threadId, setThreadId] = useState('');
  const [modeId, setModeId] = useState(DEFAULT_MODE_ID);
  const [config, setConfig] = useState<Record<string, FieldValue>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const descriptor = descriptors.find((item) => item.kind === kind);
  const fields = descriptor?.configFields ?? [];
  const connectionDescriptor = descriptor?.connection
    ? detail.connections.find((connection) => connection.connectionId === descriptor.connection)
    : undefined;

  const submit = async () => {
    if (!label || !descriptor) {
      setError('Label is required');
      return;
    }
    if (!agentId) {
      setError('Target agent is required');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const resolvedThreadId = await resolveTriggerThread({ agentId, threadId, label });
      await createOrgAddonTrigger(orgId, detail.addonId, {
        triggerId: descriptor.kind,
        label,
        config: config as Record<string, unknown>,
        target: { threadId: resolvedThreadId, agentId, modeId },
        enabled: true,
      });
      setLabel('');
      setConfig({});
      setAgentId('');
      setThreadId('');
      setModeId(DEFAULT_MODE_ID);
      await queryClient.invalidateQueries({
        queryKey: orgAddonDetailQueryKey(orgId, detail.addonId),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-md border px-3 py-2"
      data-testid="addon-trigger-create"
    >
      <p className="font-medium text-sm">New trigger instance</p>
      <SettingsField label="Trigger kind">
        <select
          className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value);
            setConfig({});
          }}
          data-testid="addon-trigger-kind"
        >
          {descriptors.map((item) => (
            <option key={item.kind} value={item.kind}>
              {resolveL10n(item.title, 'en')}
            </option>
          ))}
        </select>
      </SettingsField>
      <SettingsField label="Label">
        <input
          className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="When to fire"
          data-testid="addon-trigger-label"
        />
      </SettingsField>
      {fields.map((field) => (
        <SettingsField key={field.key} label={field.label} description={field.help}>
          <FieldRenderer
            field={field}
            value={config[field.key]}
            onChange={(next) => setConfig((current) => ({ ...current, [field.key]: next }))}
          />
        </SettingsField>
      ))}
      {connectionDescriptor ? (
        <SettingsField
          label={`Account for ${connectionDescriptor.label}`}
          description="The trigger listens through this connection. Manage bindings in Connections."
        >
          <p className="text-muted-foreground text-sm">
            {connectionDescriptor.accountIds.length === 0
              ? 'No account bound'
              : connectionDescriptor.accountIds.join(', ')}
          </p>
        </SettingsField>
      ) : null}
      <SettingsField label="Target agent" description="Which agent handles the fired trigger.">
        <select
          className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          value={agentId}
          onChange={(event) => {
            setAgentId(event.target.value);
            setThreadId('');
            setModeId(DEFAULT_MODE_ID);
          }}
          data-testid="addon-trigger-agent"
        >
          <option value="">Select an agent...</option>
          {(agents.data ?? [])
            .filter((agent) => agent.status === 'active')
            .map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
        </select>
      </SettingsField>
      <TriggerTargetField orgId={orgId} agentId={agentId} value={threadId} onChange={setThreadId} />
      {error ? <SettingsErrorBanner message={error} testId="addon-trigger-create-error" /> : null}
      <div>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => void submit()}
          data-testid="addon-trigger-create-submit"
        >
          Create trigger
        </Button>
      </div>
    </div>
  );
}
