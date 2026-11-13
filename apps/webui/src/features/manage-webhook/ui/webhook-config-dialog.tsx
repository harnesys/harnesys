import { type AgentMode, DEFAULT_MODE, DEFAULT_MODE_ID } from '@harnesys/studio-shared';
import { useState } from 'react';
import type { Agent } from '@/entities/agent';
import { WEBHOOK_STATUSES, type Webhook, webhookStatusLabel } from '@/entities/webhook';
import { TriggerTargetField } from '@/features/manage-automations/ui/trigger-target-field';
import { cn } from '@/shared/lib/utils';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { confirmDeleteWebhook } from '../model/delete-webhook';
import type { WebhookConfigResult } from '../model/webhook-dialogs';
import {
  defaultWebhookMode,
  draftFrom,
  emptyWebhookDraft,
  type WebhookFormDraft,
} from '../model/webhook-draft';
export interface WebhookConfigData {
  agents: Agent[];
  projectId: string;
  webhook: Webhook | null;
}

interface AgentModesLike {
  modes?: AgentMode[];
}
function hasAgentModes(agent: Agent): agent is Agent & AgentModesLike {
  return 'modes' in agent;
}
export function WebhookConfigDialog({
  onResolve,
  data,
}: DialogComponentProps<WebhookConfigResult, WebhookConfigData>) {
  const agents = data?.agents ?? [];
  const projectId = data?.projectId ?? '';
  const webhook = data?.webhook ?? null;
  const [draft, setDraft] = useState<WebhookFormDraft>(() =>
    webhook ? draftFrom(webhook) : emptyWebhookDraft(agents),
  );
  const canSave = draft.name.trim().length > 0 && agents.length > 0;
  const agent = agents.find((item) => item.id === draft.targetAgentId);
  const agentModes = agent !== undefined && hasAgentModes(agent) ? (agent.modes ?? []) : [];
  const modeItems = [
    { value: DEFAULT_MODE_ID, label: DEFAULT_MODE.name },
    ...agentModes.map((mode) => ({ value: mode.id, label: mode.name })),
  ];
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FieldGroup>
          <Field data-invalid={draft.name.trim().length === 0 || undefined}>
            <FieldLabel htmlFor="webhook-name">Name</FieldLabel>
            <div
              className={cn(
                'grid items-start gap-1.5',
                webhook
                  ? 'sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]'
                  : 'sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]',
              )}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Name</span>
                <Input
                  id="webhook-name"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="GitHub pull request"
                  aria-invalid={draft.name.trim().length === 0 || undefined}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Agent</span>
                <Select
                  items={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
                  value={draft.targetAgentId}
                  onValueChange={(value) => {
                    if (typeof value === 'string') {
                      const next = agents.find((item) => item.id === value);
                      setDraft({
                        ...draft,
                        targetAgentId: value,
                        mode: defaultWebhookMode(next),
                        threadId: null,
                      });
                    }
                  }}
                >
                  <SelectTrigger id="webhook-agent" className="w-full">
                    <SelectValue />
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
              {webhook ? (
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Status</span>
                  <Select
                    items={WEBHOOK_STATUSES.map((status) => ({
                      value: status,
                      label: webhookStatusLabel(status),
                    }))}
                    value={draft.status}
                    onValueChange={(value) => {
                      if (value === 'active' || value === 'paused' || value === 'failed') {
                        setDraft({ ...draft, status: value });
                      }
                    }}
                  >
                    <SelectTrigger id="webhook-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {WEBHOOK_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {webhookStatusLabel(status)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          </Field>
          <TriggerTargetField
            orgId={projectId}
            agentId={draft.targetAgentId}
            value={draft.threadId ?? ''}
            onChange={(threadId) => setDraft({ ...draft, threadId: threadId || null })}
            currentThreadId={webhook?.threadId}
          />
          <Field>
            <FieldLabel htmlFor="webhook-mode">Mode</FieldLabel>
            <Select
              items={modeItems}
              value={draft.mode}
              onValueChange={(value) => {
                if (typeof value === 'string') {
                  setDraft({ ...draft, mode: value });
                }
              }}
            >
              <SelectTrigger id="webhook-mode" className="w-full">
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
          <Field>
            <FieldLabel htmlFor="webhook-detail">Instructions</FieldLabel>
            <Textarea
              id="webhook-detail"
              value={draft.detail}
              onChange={(event) => setDraft({ ...draft, detail: event.target.value })}
              placeholder="What this webhook triggers"
              className="min-h-24"
            />
          </Field>
        </FieldGroup>
      </div>
      <DialogFooter>
        {webhook ? (
          <Button
            variant="ghost"
            className="mr-auto text-destructive hover:text-destructive"
            data-testid="webhook-config-delete"
            onClick={() => {
              void confirmDeleteWebhook(webhook).then((confirmed) => {
                if (confirmed) {
                  onResolve?.({ draft: null, deleted: true });
                }
              });
            }}
          >
            Delete
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button disabled={!canSave} onClick={() => onResolve?.({ draft, deleted: false })}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
