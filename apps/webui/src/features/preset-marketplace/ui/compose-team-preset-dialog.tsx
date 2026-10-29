import type { BoardStatus, PresetBoardRule, TeamPresetBody } from '@harnesys/contracts';
import { BOARD_TEMPLATES } from '@harnesys/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAgentStore } from '@/entities/agent';
import { savePreset } from '@/shared/api';
import { type DialogComponentProps, dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';
import { agentPresetBodyFromAgent, localPresetId, roleKeyForAgent } from '../model/preset-mappers';

export interface ComposeTeamPresetPrefill {
  name: string;
  description?: string;
  statuses: BoardStatus[];
  rules: { statusKey: string; agentId: string }[];
  agentIds: string[];
}

export interface ComposeTeamPresetData {
  orgId: string;
  prefill?: ComposeTeamPresetPrefill;
}

interface RuleRow {
  statusKey: string;
  roleKey: string;
}

export function openComposeTeamPresetDialog(orgId: string, prefill?: ComposeTeamPresetPrefill) {
  return dialog.open(ComposeTeamPresetDialog, {
    title: 'Create your own preset',
    description: 'Pick agents, a board and rules.',
    className: 'sm:max-h-[74vh] sm:max-w-xl',
    testId: 'compose-team-preset-dialog',
    data: { orgId, prefill },
  });
}

function ComposeTeamPresetDialog({
  onResolve,
  data,
}: DialogComponentProps<void, ComposeTeamPresetData>) {
  const queryClient = useQueryClient();
  const orgId = data?.orgId ?? '';
  const prefill = data?.prefill;
  const agents = useAgentStore(
    useShallow((state) => state.items.filter((item) => item.orgId === orgId)),
  );
  const [name, setName] = useState(prefill?.name ?? '');
  const [description, setDescription] = useState(prefill?.description ?? '');
  const [tags, setTags] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>(prefill?.agentIds ?? []);
  const [templateKey, setTemplateKey] = useState<keyof typeof BOARD_TEMPLATES>('dev');
  const [ruleRows, setRuleRows] = useState<RuleRow[]>([]);
  const [prefillApplied, setPrefillApplied] = useState(false);
  const [digestCron, setDigestCron] = useState('');
  const [digestRole, setDigestRole] = useState('');
  const [digestDetail, setDigestDetail] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!prefill || prefillApplied) {
      return;
    }
    const all = useAgentStore.getState().inOrg(orgId);
    if (all.length === 0) {
      return;
    }
    const rows: RuleRow[] = [];
    let dropped = 0;
    for (const rule of prefill.rules) {
      const agent = all.find((item) => item.id === rule.agentId);
      if (!agent) {
        dropped += 1;
        continue;
      }
      rows.push({ statusKey: rule.statusKey, roleKey: roleKeyForAgent(agent) });
    }
    setRuleRows(rows);
    setPrefillApplied(true);
    if (dropped > 0) {
      toast.add({ title: `${dropped} rule(s) dropped — agent not found` });
    }
  }, [orgId, prefill, prefillApplied]);

  const statuses = prefill?.statuses ?? BOARD_TEMPLATES[templateKey].statuses;
  const selectedAgents = agents.filter((agent) => selectedIds.includes(agent.id));
  const canSave = name.trim().length > 0 && selectedAgents.length > 0 && !saving;

  const toggleAgent = (agentId: string) => {
    setSelectedIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId],
    );
  };

  const addRuleRow = () => {
    const status = statuses[0];
    const role = selectedAgents[0];
    if (!status || !role) {
      return;
    }
    setRuleRows((prev) => [...prev, { statusKey: status.key, roleKey: roleKeyForAgent(role) }]);
  };

  const submit = async () => {
    if (!canSave) {
      return;
    }
    setSaving(true);
    try {
      const usedRoleKeys = new Set<string>();
      const roleKeyById = new Map<string, string>();
      for (const agent of selectedAgents) {
        const base = roleKeyForAgent(agent);
        let roleKey = base;
        let suffix = 2;
        while (usedRoleKeys.has(roleKey)) {
          roleKey = `${base}-${suffix}`;
          suffix += 1;
        }
        usedRoleKeys.add(roleKey);
        roleKeyById.set(agent.id, roleKey);
      }
      const rules: PresetBoardRule[] = ruleRows
        .filter((row) => row.statusKey !== '' && row.roleKey !== '')
        .map((row, index) => ({
          trigger: { type: 'status_entered', statusKey: row.statusKey },
          conditions: [],
          actions: [{ type: 'assign_agent', roleKey: row.roleKey }],
          position: index,
          enabled: true,
        }));
      for (const agent of selectedAgents) {
        await savePreset({
          kind: 'agent',
          id: localPresetId(agent.name),
          name: agent.name,
          body: agentPresetBodyFromAgent(agent),
        });
      }
      const firstAgent = selectedAgents[0];
      if (!firstAgent) {
        return;
      }
      const body: TeamPresetBody = {
        roles: selectedAgents.map((agent) => ({
          roleKey: roleKeyById.get(agent.id) ?? roleKeyForAgent(agent),
          name: agent.name,
          agentRef: localPresetId(agent.name),
          budgetUsdDaily: agent.budgetUsdDaily ?? 0,
          requiresModel: true,
        })),
        board: { statuses: statuses.map((status) => ({ ...status })), rules },
        digest: {
          cronDefault: digestCron.trim() || '0 9 * * *',
          roleKey: digestRole || roleKeyForAgent(firstAgent),
          detail: digestDetail.trim() || 'Daily digest.',
        },
      };
      await savePreset({
        kind: 'team',
        id: localPresetId(name),
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(tags.trim()
          ? {
              tags: tags
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
            }
          : {}),
        body,
      });
      await queryClient.invalidateQueries({ queryKey: ['presets'] });
      toast.add({ title: 'Preset created' });
      onResolve?.();
    } catch (error) {
      toast.add({ title: error instanceof Error ? error.message : 'Could not create preset' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <Field>
          <FieldLabel htmlFor="compose-name">Preset name</FieldLabel>
          <Input
            id="compose-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="compose-description">Description</FieldLabel>
          <Textarea
            id="compose-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="compose-tags">
            Tags <span className="text-muted-foreground/60">(comma separated)</span>
          </FieldLabel>
          <Input id="compose-tags" value={tags} onChange={(event) => setTags(event.target.value)} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Agents</FieldLabel>
          {agents.length === 0 ? (
            <p className="text-muted-foreground text-xs">No agents in this organization yet.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs"
                >
                  <Checkbox
                    checked={selectedIds.includes(agent.id)}
                    onCheckedChange={() => {
                      toggleAgent(agent.id);
                    }}
                  />
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left"
                    onClick={() => {
                      toggleAgent(agent.id);
                    }}
                  >
                    {agent.name}
                  </button>
                  <span className="truncate font-mono text-[10px] text-muted-foreground">
                    {agent.role || 'agent'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Board</FieldLabel>
          {prefill ? (
            <p className="text-muted-foreground text-xs">
              {statuses.length} statuses from the current board.
            </p>
          ) : (
            <Select
              items={Object.keys(BOARD_TEMPLATES).map((key) => ({
                value: key,
                label: BOARD_TEMPLATES[key as keyof typeof BOARD_TEMPLATES].name,
              }))}
              value={templateKey}
              onValueChange={(next) => {
                if (typeof next === 'string') {
                  setTemplateKey(next as keyof typeof BOARD_TEMPLATES);
                }
              }}
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="w-full" align="start">
                {Object.keys(BOARD_TEMPLATES).map((key) => (
                  <SelectItem key={key} value={key}>
                    {BOARD_TEMPLATES[key as keyof typeof BOARD_TEMPLATES].name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex flex-col gap-1">
            {ruleRows.map((row, index) => (
              <div key={`${row.statusKey}-${index}`} className="flex items-center gap-1">
                <Select
                  items={statuses.map((status) => ({ value: status.key, label: status.label }))}
                  value={row.statusKey}
                  onValueChange={(next) => {
                    if (typeof next === 'string') {
                      setRuleRows((prev) =>
                        prev.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, statusKey: next } : item,
                        ),
                      );
                    }
                  }}
                >
                  <SelectTrigger className="w-40" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start">
                    {statuses.map((status) => (
                      <SelectItem key={status.key} value={status.key}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  items={selectedAgents.map((agent) => ({
                    value: roleKeyForAgent(agent),
                    label: agent.name,
                  }))}
                  value={row.roleKey}
                  onValueChange={(next) => {
                    if (typeof next === 'string') {
                      setRuleRows((prev) =>
                        prev.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, roleKey: next } : item,
                        ),
                      );
                    }
                  }}
                >
                  <SelectTrigger className="w-40" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start">
                    {selectedAgents.map((agent) => (
                      <SelectItem key={agent.id} value={roleKeyForAgent(agent)}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setRuleRows((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
                  }}
                >
                  ×
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="w-fit"
              onClick={addRuleRow}
            >
              Add rule
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>
            Digest <span className="text-muted-foreground/60">(optional)</span>
          </FieldLabel>
          <Input
            value={digestCron}
            onChange={(event) => setDigestCron(event.target.value)}
            placeholder="0 9 * * *"
            className="font-mono"
          />
          <Select
            items={selectedAgents.map((agent) => ({
              value: roleKeyForAgent(agent),
              label: agent.name,
            }))}
            value={digestRole}
            onValueChange={(next) => {
              if (typeof next === 'string') {
                setDigestRole(next);
              }
            }}
          >
            <SelectTrigger className="w-full" size="sm">
              <SelectValue placeholder="Digest role" />
            </SelectTrigger>
            <SelectContent align="start">
              {selectedAgents.map((agent) => (
                <SelectItem key={agent.id} value={roleKeyForAgent(agent)}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={digestDetail}
            onChange={(event) => setDigestDetail(event.target.value)}
            placeholder="Digest detail"
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!canSave}
          data-testid="compose-preset-submit"
          onClick={() => {
            void submit();
          }}
        >
          {saving ? 'Saving…' : 'Create preset'}
        </Button>
      </DialogFooter>
    </div>
  );
}
