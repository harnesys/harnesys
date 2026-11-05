import type { ProviderPublic } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import type { AgentModelRef, Node } from 'harnesys';
import { useEffect } from 'react';
import { Controller, type UseFormReturn, useWatch } from 'react-hook-form';
import { providersQuery } from '@/shared/api';
import { getActiveOrgId } from '@/shared/api/active-org';
import { ColorSwatches } from '@/shared/ui/color-swatches';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import {
  type AgentFieldsInput,
  type AgentFieldsOutput,
  type AgentGenerationField,
} from '../model/agent-fields';
import type { StudioGraphDocument } from '../model/agent-graph-document';
import { modelIdOfRef } from '../model/agent-graph-model-ref';
import { sanitizeForModel } from '../model/agent-model-info';
import { generationDefaults } from '../model/generation-specs';
import { AgentBudgetFields } from './agent-budget-fields';
import { AgentEffortField, AgentGenerationFields } from './agent-generation-fields';
import { ModelSelect } from './model-select';

type AgentFieldsForm = UseFormReturn<AgentFieldsInput, unknown, AgentFieldsOutput>;
export function AgentIdentityPane({ form }: { form: AgentFieldsForm }) {
  return (
    <FieldGroup className="min-h-0 flex-1 gap-3">
      <div className="grid shrink-0 grid-cols-2 gap-3">
        <Controller
          control={form.control}
          name="name"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor="agent-name">Name</FieldLabel>
              <Input
                id="agent-name"
                placeholder="Orion"
                aria-invalid={fieldState.invalid || undefined}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                ref={field.ref}
              />
              {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="role"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="agent-role">Role</FieldLabel>
              <Input
                id="agent-role"
                placeholder="Staff Engineer"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                ref={field.ref}
              />
            </Field>
          )}
        />
      </div>
      <Controller
        control={form.control}
        name="color"
        render={({ field }) => (
          <Field className="shrink-0">
            <FieldLabel>Color</FieldLabel>
            <ColorSwatches
              value={field.value ?? null}
              onChange={field.onChange}
              testIdPrefix="agent-color"
            />
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="instructions"
        render={({ field }) => (
          <Field className="min-h-0 flex-1">
            <FieldLabel htmlFor="agent-instructions" className="shrink-0">
              Instructions
            </FieldLabel>
            <div className="min-h-0 flex-1">
              <Textarea
                id="agent-instructions"
                placeholder="System prompt for this agent"
                className="field-sizing-fixed h-full min-h-0 resize-none overflow-y-auto text-xs leading-relaxed"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                ref={field.ref}
              />
            </div>
            <p className="shrink-0 text-[11px] text-muted-foreground leading-snug">
              Injected into every conversation thread as the system prompt.
            </p>
          </Field>
        )}
      />
    </FieldGroup>
  );
}
export function AgentModelPane({
  form,
  orgId,
  graphDoc,
}: {
  form: AgentFieldsForm;
  orgId: string;
  graphDoc?: StudioGraphDocument | null;
}) {
  const providers = useQuery(providersQuery(getActiveOrgId() ?? '')).data ?? [];
  const modelId = useWatch({ control: form.control, name: 'modelId' });
  useEffect(() => {
    if (!modelId || providers.length === 0) {
      return;
    }
    const defaults = generationDefaults(modelId, providers);
    for (const [name, value] of Object.entries(defaults)) {
      const key = name as AgentGenerationField;
      if (parseOptional(form.getValues(key)) === undefined) {
        form.setValue(key, value, { shouldDirty: false });
      }
    }
  }, [modelId, providers, form]);
  return (
    <FieldGroup className="gap-3">
      <div className="grid grid-cols-1 gap-3 has-[[data-slot=agent-effort]]:grid-cols-2">
        <Controller
          control={form.control}
          name="modelId"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="agent-model">Model</FieldLabel>
              <ModelSelect
                id="agent-model"
                orgId={orgId}
                value={field.value}
                triggerClassName="w-full"
                onChange={(modelId) => {
                  const current = form.getValues();
                  const generation = {
                    temperature: parseOptional(current.temperature),
                    topP: parseOptional(current.topP),
                    frequencyPenalty: parseOptional(current.frequencyPenalty),
                    presencePenalty: parseOptional(current.presencePenalty),
                    seed: parseOptional(current.seed),
                    maxTokens: parseOptional(current.maxTokens),
                  };
                  const sanitized = sanitizeForModel(
                    modelId,
                    current.effort,
                    generation,
                    providers,
                  );
                  field.onChange(modelId);
                  form.setValue('effort', sanitized.effort);
                  form.setValue('temperature', stringify(sanitized.generation?.temperature));
                  form.setValue('topP', stringify(sanitized.generation?.topP));
                  form.setValue(
                    'frequencyPenalty',
                    stringify(sanitized.generation?.frequencyPenalty),
                  );
                  form.setValue(
                    'presencePenalty',
                    stringify(sanitized.generation?.presencePenalty),
                  );
                  form.setValue('seed', stringify(sanitized.generation?.seed));
                  form.setValue('maxTokens', stringify(sanitized.generation?.maxTokens));
                }}
              />
            </Field>
          )}
        />
        <AgentEffortField control={form.control} orgId={orgId} />
      </div>
      <AgentGenerationFields control={form.control} orgId={orgId} />
      {graphDoc ? <GraphNodeOverrides graphDoc={graphDoc} providers={providers} /> : null}
    </FieldGroup>
  );
}
function GraphNodeOverrides({
  graphDoc,
  providers,
}: {
  graphDoc: StudioGraphDocument;
  providers: ProviderPublic[];
}) {
  const entries = Object.entries(graphDoc.nodes).filter(
    ([, node]) =>
      (node.type === 'llm:generate' || node.type === 'control:route') &&
      node.model !== undefined &&
      typeof node.model === 'object',
  );
  if (entries.length === 0) {
    return null;
  }
  return (
    <FieldSet className="gap-2">
      <FieldLegend variant="label" className="text-muted-foreground text-xs">
        Graph node overrides
      </FieldLegend>
      <p className="text-[11px] text-muted-foreground leading-snug">
        Nodes in Custom mode ignore these agent defaults. Edit them in the graph node inspector.
      </p>
      <ul className="flex flex-col gap-1">
        {entries.map(([id, node]) => (
          <li
            key={id}
            className="flex items-center justify-between gap-2 rounded border border-border/60 px-2 py-1"
          >
            <span className="truncate font-mono text-[11px]">
              {id}
              {graphDoc.primary === id ? (
                <span className="ml-1 rounded bg-primary/15 px-1 align-middle font-medium text-[8px] text-primary uppercase">
                  Default
                </span>
              ) : null}
            </span>
            <span className="shrink-0 truncate text-[11px] text-muted-foreground">
              {overrideSummary(node, providers)}
            </span>
          </li>
        ))}
      </ul>
    </FieldSet>
  );
}
function overrideSummary(node: Node, providers: ProviderPublic[]): string {
  if (node.type !== 'llm:generate' && node.type !== 'control:route') {
    return '';
  }
  const model = node.model as AgentModelRef | undefined;
  const modelId = modelIdOfRef(model, providers);
  const knobs: string[] = [];
  if (model?.effort) {
    knobs.push(`effort ${model.effort}`);
  }
  const generation = model?.generation ?? {};
  for (const key of Object.keys(generation) as (keyof typeof generation)[]) {
    if (generation[key] !== undefined) {
      knobs.push(key);
    }
  }
  const target = modelId ?? `${model?.provider ?? '?'}/${model?.model ?? '?'}`;
  return knobs.length > 0 ? `${target} · ${knobs.join(', ')}` : target;
}
export function AgentLimitsPane({ form }: { form: AgentFieldsForm }) {
  return (
    <FieldGroup className="gap-3">
      <AgentBudgetFields control={form.control} idPrefix="agent" />
    </FieldGroup>
  );
}
function parseOptional(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') {
    return undefined;
  }
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}
function stringify(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}
