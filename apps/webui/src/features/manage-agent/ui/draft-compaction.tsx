import type { PortRef, ProviderPublic } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Agent } from '@/entities/agent';
import { providersQuery } from '@/shared/api';
import { getActiveOrgId } from '@/shared/api/active-org';
import { Pane } from '@/shared/ui/capability-rows';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import {
  type CompactionDraft,
  compactionDraftFrom,
  toCompactionPortRef,
} from '../model/agent-compaction';
import type { ModelBounds } from '../model/generation-specs';
import { type ModelOption, modelGroups, modelOptions } from '../model/model-groups';
import { CompactionRuntimeControls } from './draft-compaction-runtime';
import { NumberField } from './pane-number-field';

const SAME_AS_AGENT = '__same_as_agent__';
export function DraftCompaction({
  agent,
  onChange,
}: {
  agent: Agent | null;
  onChange: (compaction: PortRef) => void;
}) {
  const providers = useQuery(providersQuery(getActiveOrgId() ?? '')).data ?? [];
  const groups = modelGroups(providers);
  const items = modelOptions(groups);
  const [draft, setDraft] = useState(() => compactionDraftFrom(agent?.compaction ?? null));
  function patch(partial: Partial<CompactionDraft>) {
    const next = { ...draft, ...partial };
    setDraft(next);
    onChange(toCompactionPortRef(next));
  }
  const summaryValue = summarySelectValue(draft, items);
  const summaryLabel =
    summaryValue === SAME_AS_AGENT
      ? 'Same as agent'
      : (items.find((item) => item.value === summaryValue)?.name ?? 'Same as agent');
  return (
    <Pane
      testId="agent-compaction-pane"
      label="Compaction"
      description="Context compaction policy for this agent."
    >
      <FieldGroup className="gap-2">
        <Field>
          <FieldLabel htmlFor="draft-compaction-summary-model">Summary model</FieldLabel>
          <Select
            items={[
              { value: SAME_AS_AGENT, label: 'Same as agent' },
              ...items.map((item) => ({ value: item.value, label: item.name })),
            ]}
            value={summaryValue}
            onValueChange={(next) => {
              if (typeof next !== 'string') {
                return;
              }
              if (next === SAME_AS_AGENT) {
                patch({ summaryProvider: '', summaryModel: '' });
                return;
              }
              const option = items.find((item) => item.value === next);
              if (!option) {
                return;
              }
              patch({ summaryProvider: option.provider, summaryModel: option.name });
            }}
            disabled={items.length === 0}
          >
            <SelectTrigger id="draft-compaction-summary-model" size="sm" className="w-full">
              {items.length === 0 ? (
                <SelectValue placeholder="Attach a model first" />
              ) : (
                <span
                  className={`min-w-0 flex-1 truncate text-left ${summaryValue === SAME_AS_AGENT ? '' : 'font-mono'}`}
                >
                  {summaryLabel}
                </span>
              )}
            </SelectTrigger>
            <SelectContent className="w-full" align="start">
              <SelectItem value={SAME_AS_AGENT}>Same as agent</SelectItem>
              {groups.map((group) => (
                <SelectGroup key={group.provider}>
                  <SelectLabel>{group.provider}</SelectLabel>
                  {group.models.map((item) => (
                    <SelectItem key={item.value} value={item.value} className="font-mono">
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription className="text-[11px] text-muted-foreground leading-snug">
            Optional. Empty = agent model for the summary call.
          </FieldDescription>
        </Field>
        <Field
          orientation="horizontal"
          className="items-center justify-between gap-4 rounded-lg border px-3 py-2"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <FieldLabel htmlFor="draft-compaction-auto" className="font-normal text-sm">
              Auto compaction
            </FieldLabel>
            <FieldDescription className="text-[11px] text-muted-foreground leading-snug">
              Compact automatically when the context reaches the threshold. Off = manual /compact
              only.
            </FieldDescription>
          </div>
          <Switch
            id="draft-compaction-auto"
            size="sm"
            checked={draft.auto}
            onCheckedChange={(value) => patch({ auto: Boolean(value) })}
          />
        </Field>
        <p className="font-mono text-[11px] text-muted-foreground tabular-nums leading-snug">
          {thresholdPreview(agent, providers, draft)}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            id="draft-compaction-threshold"
            label="Threshold, %"
            value={draft.thresholdPercent}
            placeholder="80"
            description="Auto compaction fires when the context passes this percent of the usable budget: context window minus reply reserve. Clamp 10–100. Default 80."
            disabled={!draft.auto}
            onChange={(thresholdPercent) => patch({ thresholdPercent })}
          />
          <NumberField
            id="draft-compaction-reserve-cap"
            label="Reply reserve cap, %"
            value={draft.reserveCapPercent}
            placeholder="10"
            description="Upper bound for the reply reserve, as a percent of the context window. Reserve = min(model max output, this cap) and is subtracted from the window before the threshold applies. Clamp 0–90. Default 10."
            disabled={!draft.auto}
            onChange={(reserveCapPercent) => patch({ reserveCapPercent })}
          />
          <NumberField
            id="draft-compaction-protect"
            label="Protect recent, %"
            value={draft.protectRecentPercent}
            placeholder="10"
            description="Recent tail (percent of context) kept out of every compaction, manual included. Clamp 0–90. Default 10."
            onChange={(protectRecentPercent) => patch({ protectRecentPercent })}
          />
          <NumberField
            id="draft-compaction-protect-turns"
            label="Protect recent turns"
            value={draft.protectRecentTurns}
            placeholder="0"
            description="Count of trailing user+agent turns kept out of every compaction, manual included. Empty = off."
            onChange={(protectRecentTurns) => patch({ protectRecentTurns })}
          />
        </div>
        <Field
          orientation="horizontal"
          className="mt-2 items-center justify-between gap-4 rounded-lg border px-3 py-2"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <FieldLabel htmlFor="draft-compaction-pre-note" className="font-normal text-sm">
              Pre-threshold note
            </FieldLabel>
            <FieldDescription className="text-[11px] text-muted-foreground leading-snug">
              Warn the agent shortly before the compaction threshold so it can persist important
              notes.
            </FieldDescription>
          </div>
          <Switch
            id="draft-compaction-pre-note"
            size="sm"
            disabled={!draft.auto}
            checked={draft.auto && draft.preCompactNote}
            onCheckedChange={(value) => patch({ preCompactNote: Boolean(value) })}
          />
        </Field>
        <CompactionRuntimeControls draft={draft} patch={patch} />
      </FieldGroup>
    </Pane>
  );
}
function summarySelectValue(draft: CompactionDraft, items: ModelOption[]): string {
  if (!draft.summaryProvider || !draft.summaryModel) {
    return SAME_AS_AGENT;
  }
  const found = items.find(
    (item) => item.provider === draft.summaryProvider && item.name === draft.summaryModel,
  );
  return found?.value ?? SAME_AS_AGENT;
}
function modelBoundsOf(agent: Agent | null, providers: ProviderPublic[]): ModelBounds {
  const model = agent?.modelId
    ? providers.flatMap((provider) => provider.models).find((item) => item.id === agent.modelId)
    : undefined;
  const contextWindow =
    model?.contextWindow ??
    model?.context_length ??
    model?.top_provider?.context_length ??
    model?.host?.context_length ??
    model?.host?.top_provider?.context_length;
  const maxOutputTokens =
    model?.top_provider?.max_completion_tokens ?? model?.host?.top_provider?.max_completion_tokens;
  return {
    ...(positive(maxOutputTokens) ? { maxOutputTokens } : {}),
    ...(positive(contextWindow) ? { contextWindow } : {}),
  };
}
function positive(value: number | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function effectiveContext(agent: Agent | null, providers: ProviderPublic[]): number | undefined {
  const bounds = modelBoundsOf(agent, providers);
  const override = positive(agent?.generation?.contextWindowTokens)
    ? agent?.generation?.contextWindowTokens
    : undefined;
  if (override && bounds.contextWindow) {
    return Math.min(override, bounds.contextWindow);
  }
  return override ?? bounds.contextWindow;
}

function effectiveReserve(agent: Agent | null, providers: ProviderPublic[]): number {
  const bounds = modelBoundsOf(agent, providers);
  const context = effectiveContext(agent, providers);
  const reserve = positive(agent?.generation?.maxTokens)
    ? agent?.generation?.maxTokens
    : (bounds.maxOutputTokens ?? 0);
  if (context === undefined) {
    return reserve ?? 0;
  }
  return Math.min(reserve ?? 0, context);
}
function thresholdPreview(
  agent: Agent | null,
  providers: ProviderPublic[],
  draft: CompactionDraft,
): string {
  const context = effectiveContext(agent, providers);
  if (context === undefined) {
    return 'context ? · model has no context window metadata';
  }
  const capRatio = parsePercent(draft.reserveCapPercent, 0.1);
  const reserve = Math.min(effectiveReserve(agent, providers), Math.floor(context * capRatio));
  const thresholdRatio = parsePercent(draft.thresholdPercent, 0.8);
  const parts = [
    `context ${formatNumber(context)}`,
    `reserve ≤${formatNumber(reserve)}`,
    `usable ${formatNumber(context - reserve)}`,
  ];
  if (draft.auto) {
    parts.push(`auto fires at ~${formatNumber(Math.floor((context - reserve) * thresholdRatio))}`);
  } else {
    parts.push('manual only');
  }
  return parts.join(' · ');
}
function parsePercent(value: string, fallback: number): number {
  const next = Number(value.trim());
  return Number.isFinite(next) ? Math.min(1, Math.max(0, next / 100)) : fallback;
}
function formatNumber(value: number | undefined): string {
  return value === undefined ? '?' : value.toLocaleString('en-US');
}
