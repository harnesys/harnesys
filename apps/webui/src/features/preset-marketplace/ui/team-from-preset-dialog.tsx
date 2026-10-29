import type { CreateTeamResponse, TeamPresetDetail } from '@harnesys/contracts';
import { useState } from 'react';
import { toClientAgentFromPublic, useAgentStore } from '@/entities/agent';
import { ModelSelect } from '@/features/manage-agent/ui/model-select';
import { createTeam } from '@/shared/api';
import { type DialogComponentProps, dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';

export interface TeamFromPresetData {
  orgId: string;
  detail: TeamPresetDetail;
}

export function openTeamFromPresetDialog(
  orgId: string,
  detail: TeamPresetDetail,
): Promise<CreateTeamResponse | null> {
  return dialog.open(TeamFromPresetDialog, {
    title: 'New team',
    description: 'Agents, a board and rules from the preset.',
    className: 'sm:max-h-[74vh] sm:max-w-xl',
    testId: 'team-from-preset-dialog',
    data: { orgId, detail },
  });
}

function TeamFromPresetDialog({
  onResolve,
  data,
}: DialogComponentProps<CreateTeamResponse | null, TeamFromPresetData>) {
  const orgId = data?.orgId ?? '';
  const detail = data?.detail;
  const [name, setName] = useState(detail?.name ?? '');
  const [sharedModel, setSharedModel] = useState('');
  const [roleModels, setRoleModels] = useState<Record<string, string>>({});
  const [digestCron, setDigestCron] = useState(detail?.body.digest.cronDefault ?? '');
  const [submitting, setSubmitting] = useState(false);

  if (!detail) {
    return null;
  }

  const roles = detail.body.roles;
  const modelFor = (roleKey: string): string => roleModels[roleKey] ?? sharedModel;
  const models = Object.fromEntries(
    roles
      .filter((role) => role.requiresModel)
      .map((role) => [role.roleKey, modelFor(role.roleKey).trim()])
      .filter(([, modelId]) => modelId !== ''),
  );
  const missingModel = roles.some(
    (role) => role.requiresModel && modelFor(role.roleKey).trim() === '',
  );
  const canSubmit = name.trim().length > 0 && !missingModel && !submitting;

  const submit = async () => {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    try {
      const result = await createTeam(orgId, {
        presetId: detail.id,
        name: name.trim(),
        models,
        ...(digestCron.trim() ? { digestCron: digestCron.trim() } : {}),
      });
      for (const record of result.agents) {
        useAgentStore.getState().upsert(toClientAgentFromPublic(record));
      }
      toast.add({ title: `Team created — ${result.agents.length} agents` });
      onResolve?.(result);
    } catch (error) {
      toast.add({ title: error instanceof Error ? error.message : 'Could not create team' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <Field>
          <FieldLabel htmlFor="team-name">Team name</FieldLabel>
          <Input
            id="team-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </Field>
        <Field>
          <FieldLabel>
            Model for all <span className="text-muted-foreground/60">(applies to every role)</span>
          </FieldLabel>
          <ModelSelect
            value={sharedModel || null}
            onChange={(value) => setSharedModel(value ?? '')}
            triggerClassName="w-full"
            size="sm"
          />
        </Field>
        <Collapsible>
          <CollapsibleTrigger className="text-muted-foreground text-xs">
            Per-role models
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-2 pt-2">
            {roles.map((role) => (
              <div key={role.roleKey} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs">{role.name}</span>
                <ModelSelect
                  value={modelFor(role.roleKey) || null}
                  onChange={(value) => {
                    setRoleModels((prev) => ({ ...prev, [role.roleKey]: value ?? '' }));
                  }}
                  triggerClassName="w-48"
                  size="sm"
                />
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
        <Field>
          <FieldLabel htmlFor="team-digest">
            Digest cron{' '}
            <span className="text-muted-foreground/60">(clear to skip the schedule)</span>
          </FieldLabel>
          <Input
            id="team-digest"
            value={digestCron}
            onChange={(event) => setDigestCron(event.target.value)}
            className="font-mono"
          />
        </Field>
        <Collapsible>
          <CollapsibleTrigger className="text-muted-foreground text-xs">Preview</CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-2 pt-2">
            {roles.map((role) => (
              <div key={role.roleKey} className="flex items-baseline justify-between gap-3">
                <span className="truncate text-xs">{role.name}</span>
                <span className="truncate font-mono text-[10px] text-muted-foreground">
                  {role.agentRef} · {modelFor(role.roleKey) || 'no model'}
                </span>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground text-xs">Board</span>
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {detail.body.board.name ?? detail.name} · {detail.body.board.statuses.length}{' '}
                statuses
              </span>
            </div>
            {detail.body.board.rules.map((rule, index) => (
              <div
                key={`${rule.trigger.type}-${index}`}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="text-muted-foreground text-xs">
                  {rule.trigger.type === 'status_entered' ? rule.trigger.statusKey : 'rule'}
                </span>
                <span className="truncate font-mono text-[10px] text-muted-foreground">
                  {rule.actions
                    .map((action) =>
                      action.type === 'assign_agent' ? action.roleKey : action.type,
                    )
                    .join(', ')}
                </span>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.(null)}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!canSubmit}
          data-testid="team-from-preset-create"
          onClick={() => {
            void submit();
          }}
        >
          {submitting ? 'Creating…' : 'Create team'}
        </Button>
      </DialogFooter>
    </div>
  );
}
