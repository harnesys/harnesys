import {
  DEFAULT_MODE_ID,
  type ModeOpPermissions,
  type ModePreset,
  modeFromPreset,
} from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import type { ToolExposure } from 'harnesys';
import { CircleDotIcon, PlusIcon, SparklesIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { type UseFormReturn, useFieldArray, useWatch } from 'react-hook-form';
import type { Agent } from '@/entities/agent';
import { orgAgentCapabilitiesQuery, orgCapabilitiesQuery } from '@/shared/api/org-capabilities';
import { orgModePresetsQuery } from '@/shared/api/org-mode-presets';
import { orgSkillsQuery } from '@/shared/api/org-skills';
import { Button } from '@/shared/ui/button';
import { Pane, Row, RowChip, RowList } from '@/shared/ui/capability-rows';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import type { AgentFieldsInput, AgentFieldsOutput } from '../model/agent-fields';
import { blankModeFields, modeToFields } from '../model/agent-mode-fields';
import { isSourceGranted, type PackAssignmentMap } from '../model/draft-overrides';
import { AgentModeEditor } from './agent-mode-editor';

interface AgentModesPaneProps {
  form: UseFormReturn<AgentFieldsInput, unknown, AgentFieldsOutput>;
  orgId: string;
  activeAgent: Agent | null;
  active: boolean;
}
export function AgentModesPane({ form, orgId, activeAgent, active }: AgentModesPaneProps) {
  const modes = useFieldArray({ control: form.control, name: 'modes' });
  const rows = useWatch({ control: form.control, name: 'modes' }) ?? [];
  const defaultModeId = useWatch({ control: form.control, name: 'defaultModeId' });
  const permissionsBase = useWatch({ control: form.control, name: 'permissions' }) ?? null;
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const skillsQuery = useQuery({
    ...orgSkillsQuery(orgId),
    enabled: active && Boolean(orgId),
  });
  const packsQuery = useQuery({
    ...orgCapabilitiesQuery(orgId),
    enabled: active && Boolean(orgId),
  });
  const presetsQuery = useQuery({
    ...orgModePresetsQuery(orgId),
    enabled: active && Boolean(orgId),
  });
  const explainQuery = useQuery({
    ...orgAgentCapabilitiesQuery(orgId, activeAgent?.id ?? null),
    enabled: active && Boolean(activeAgent?.id),
  });
  const presets = (presetsQuery.data?.items ?? []).map(toModePreset);
  const installedIds = new Set(rows.map((row) => row.id));
  const availablePresets = presets.filter((preset) => !installedIds.has(preset.id));
  const skillNames = (skillsQuery.data?.skills ?? []).map((skill) => skill.name);
  const agentPackNames = enabledPackNames(activeAgent?.capabilities ?? {});
  const packNames = (packsQuery.data?.capabilities ?? [])
    .filter((pack) => !pack.name.endsWith('-memory'))
    .map((pack) => pack.name)
    .filter((name) => agentPackNames.includes(name));
  function isDefaultOf(index: number): boolean {
    const row = rows[index];
    if (!row) {
      return false;
    }
    if (row.id === DEFAULT_MODE_ID) {
      return defaultModeId === DEFAULT_MODE_ID || defaultModeId === null;
    }
    return defaultModeId === row.id;
  }
  function setDefaultOf(index: number, next: boolean) {
    const row = rows[index];
    if (!row) {
      return;
    }
    form.setValue('defaultModeId', next ? row.id : null, { shouldDirty: true });
  }
  function toggleExpanded(index: number) {
    setExpandedIndex((current) => (current === index ? null : index));
  }
  function addBlank() {
    modes.append(blankModeFields());
    setExpandedIndex(rows.length);
  }
  function addFromPreset(preset: ModePreset) {
    modes.append(modeToFields(modeFromPreset(preset)));
    setExpandedIndex(rows.length);
  }
  function removeMode(index: number) {
    const removed = rows[index];
    if (removed && defaultModeId === removed.id) {
      form.setValue('defaultModeId', null, { shouldDirty: true });
    }
    modes.remove(index);
    setExpandedIndex(null);
  }
  return (
    <Pane
      testId="agent-modes-pane"
      label="Modes"
      count={rows.length}
      description="Execution modes with their own instructions and permission gates."
      extra={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={addBlank}>
            <PlusIcon />
            Add
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" />}>
              <SparklesIcon />
              From preset
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-44">
              {availablePresets.length === 0 ? (
                <DropdownMenuItem disabled>
                  {presetsQuery.isLoading ? 'Loading…' : 'All presets installed'}
                </DropdownMenuItem>
              ) : (
                availablePresets.map((preset) => (
                  <DropdownMenuItem key={preset.id} onClick={() => addFromPreset(preset)}>
                    <SparklesIcon className="size-3" />
                    {preset.name}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      {modes.fields.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-muted-foreground text-sm">
          No modes yet. Add one, or install from a preset.
        </p>
      ) : (
        <RowList>
          {modes.fields.map((field, index) => {
            const row = rows[index];
            if (!row) {
              return null;
            }
            const expanded = expandedIndex === index;
            const title = row.name || '(unnamed mode)';
            return (
              <Row
                key={field.id}
                testId={`draft-mode-${field.id}`}
                icon={<CircleDotIcon />}
                title={title}
                mono={false}
                meta={row.id === DEFAULT_MODE_ID ? 'built-in' : undefined}
                chips={isDefaultOf(index) ? <RowChip tone="accent">default</RowChip> : null}
                summary={expanded ? undefined : row.description || row.id || undefined}
                onToggle={() => toggleExpanded(index)}
                expanded={expanded}
                actions={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${title}`}
                    onClick={() => removeMode(index)}
                  >
                    <Trash2Icon />
                  </Button>
                }
              >
                {expanded ? (
                  <AgentModeEditor
                    key={field.id}
                    form={form}
                    index={index}
                    skillNames={skillNames}
                    agentSkills={activeAgent?.skills ?? []}
                    packNames={packNames}
                    capabilitiesView={explainQuery.data}
                    isDefault={isDefaultOf(index)}
                    onSetDefault={(next) => setDefaultOf(index, next)}
                    base={permissionsBase}
                  />
                ) : null}
              </Row>
            );
          })}
        </RowList>
      )}
    </Pane>
  );
}
function enabledPackNames(caps: PackAssignmentMap): string[] {
  return Object.keys(caps).filter((name) => isSourceGranted(caps[name]));
}

function toModePreset(preset: {
  orgId: string;
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  skills?: string[];
  packs?: PackAssignmentMap;
  disabledTools?: string[];
  exposure?: Record<string, ToolExposure>;
  permissions?: ModeOpPermissions;
  builtin: boolean;
  installedByDefault: boolean;
  createdAt: string;
  updatedAt: string;
}): ModePreset {
  return {
    orgId: preset.orgId,
    id: preset.id,
    name: preset.name,
    ...(preset.description !== undefined ? { description: preset.description } : {}),
    ...(preset.instructions !== undefined ? { instructions: preset.instructions } : {}),
    ...(preset.skills !== undefined ? { skills: preset.skills } : {}),
    ...(preset.packs !== undefined ? { packs: preset.packs } : {}),
    ...(preset.disabledTools !== undefined ? { disabledTools: preset.disabledTools } : {}),
    ...(preset.exposure !== undefined ? { exposure: preset.exposure } : {}),
    ...(preset.permissions !== undefined ? { permissions: preset.permissions } : {}),
    builtin: preset.builtin,
    installedByDefault: preset.installedByDefault,
    createdAt: preset.createdAt,
    updatedAt: preset.updatedAt,
  };
}
