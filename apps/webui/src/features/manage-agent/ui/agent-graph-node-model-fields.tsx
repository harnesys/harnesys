import type { AgentGenerationSettings, ProviderPublic } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import type { AgentModelRef, Node } from 'harnesys';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { providersQuery } from '@/shared/api';
import { getActiveOrgId } from '@/shared/api/active-org';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Switch } from '@/shared/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import {
  type AgentFieldsInput,
  type AgentFieldsOutput,
  emptyAgentFields,
} from '../model/agent-fields';
import { modelIdOfRef, refOfModelId } from '../model/agent-graph-model-ref';
import { sanitizeForModel } from '../model/agent-model-info';
import { AgentEffortField, AgentGenerationFields } from './agent-generation-fields';
import { ModelSelect } from './model-select';

/** Knobs the engine does not apply from a node-level model ref. */
const NODE_EXCLUDED_FIELDS = ['contextWindowTokens', 'reasoningMode'] as const;

export interface NodeModelFieldsProps {
  nodeId: string;
  node: Node;
  onChange: (node: Node) => void;
  agentModelId?: string | null;
  primaryNodeId?: string;
  onPrimaryChange?: (id: string | undefined) => void;
}
export function NodeModelFields({
  nodeId,
  node,
  onChange,
  agentModelId,
  primaryNodeId,
  onPrimaryChange,
}: NodeModelFieldsProps) {
  const providers = useQuery(providersQuery(getActiveOrgId() ?? '')).data ?? [];
  const currentRef = modelRefOf(node);
  const isCustom = currentRef !== undefined;
  const [mode, setMode] = useState<'inherit' | 'custom'>(isCustom ? 'custom' : 'inherit');
  useEffect(() => {
    setMode(isCustom ? 'custom' : 'inherit');
  }, [isCustom]);
  const isPrimary = node.type === 'llm:generate' && primaryNodeId === nodeId;
  return (
    <FieldGroup className="gap-2">
      <Field>
        <FieldLabel>Model</FieldLabel>
        <ToggleGroup
          variant="segment"
          value={[mode]}
          onValueChange={(value) => {
            if (value.length === 0) {
              return;
            }
            const next = value[0] === 'custom' ? 'custom' : 'inherit';
            setMode(next);
            if (next === 'inherit' && isCustom) {
              onChange(withModelRef(node, undefined));
            }
          }}
        >
          <ToggleGroupItem value="inherit">Inherit</ToggleGroupItem>
          <ToggleGroupItem value="custom">Custom</ToggleGroupItem>
        </ToggleGroup>
      </Field>
      {mode === 'custom' ? (
        <CustomModelFields
          key={nodeId}
          nodeId={nodeId}
          node={node}
          providers={providers}
          onChange={onChange}
          onCustomize={() => {
            if (isPrimary) {
              onPrimaryChange?.(undefined);
            }
          }}
        />
      ) : (
        <p className="text-[10px] text-muted-foreground leading-snug">
          Follows the agent default
          {agentModelId ? ':' : '.'}
          {agentModelId ? (
            <span className="font-mono"> {agentModelId}</span>
          ) : (
            ' No agent model is set.'
          )}
        </p>
      )}
      {node.type === 'llm:generate' && onPrimaryChange !== undefined ? (
        <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor={`${nodeId}-primary`}>Default node</FieldLabel>
            <Switch
              id={`${nodeId}-primary`}
              checked={isPrimary}
              onCheckedChange={(checked) => onPrimaryChange?.(checked ? nodeId : undefined)}
            />
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug">
            The composer model switch controls the default node. The default node stays in Inherit
            mode.
          </p>
        </Field>
      ) : null}
    </FieldGroup>
  );
}
function CustomModelFields({
  nodeId,
  node,
  providers,
  onChange,
  onCustomize,
}: {
  nodeId: string;
  node: Node;
  providers: ProviderPublic[];
  onChange: (node: Node) => void;
  onCustomize: () => void;
}) {
  const currentRef = modelRefOf(node);
  const form = useForm<AgentFieldsInput, unknown, AgentFieldsOutput>({
    defaultValues: seedValues(currentRef, providers),
  });
  useEffect(() => {
    if (providers.length === 0 || form.formState.isDirty) {
      return;
    }
    form.reset(seedValues(modelRefOf(node), providers));
  }, [form, node, providers]);
  const modelId = form.watch('modelId');
  const commit = (nextModelId: string | null) => {
    if (!nextModelId) {
      return;
    }
    const values = form.getValues();
    const ref = refOfModelId(nextModelId, providers);
    if (!ref) {
      return;
    }
    const generation = nodeGenerationOf(values);
    const sanitized = sanitizeForModel(nextModelId, values.effort ?? null, generation, providers);
    const next: AgentModelRef = {
      ...ref,
      ...(sanitized.effort ? { effort: sanitized.effort } : {}),
      ...(sanitized.generation ? { generation: sanitized.generation } : {}),
    };
    if (modelRefOf(node) === undefined) {
      onCustomize();
    }
    onChange(withModelRef(node, next));
  };
  return (
    <FieldGroup className="gap-2">
      <Field>
        <FieldLabel htmlFor={`${nodeId}-model`}>Model</FieldLabel>
        <ModelSelect
          id={`${nodeId}-model`}
          orgId={getActiveOrgId() ?? ''}
          value={modelId ?? null}
          triggerClassName="w-full"
          kinds={node.type === 'control:route' ? ['decision', 'chat'] : undefined}
          onChange={(next) => {
            form.setValue('modelId', next ?? null);
            commit(next ?? null);
          }}
        />
      </Field>
      <FieldGroup className="gap-2">
        <AgentEffortField
          control={form.control}
          idPrefix={`node-${nodeId}`}
          orgId=""
          onCommit={() => commit(form.getValues('modelId') ?? null)}
        />
        <AgentGenerationFields
          control={form.control}
          idPrefix={`node-${nodeId}`}
          orgId=""
          exclude={[...NODE_EXCLUDED_FIELDS]}
          onCommit={() => commit(form.getValues('modelId') ?? null)}
        />
      </FieldGroup>
      <p className="text-[10px] text-muted-foreground leading-snug">
        Custom node settings replace the agent defaults for this node entirely; blank knobs use the
        provider default.
      </p>
    </FieldGroup>
  );
}
function seedValues(ref: AgentModelRef | undefined, providers: ProviderPublic[]): AgentFieldsInput {
  const generation = ref?.generation;
  return {
    ...emptyAgentFields(),
    modelId: modelIdOfRef(ref, providers),
    effort: ref?.effort ?? null,
    temperature: numberString(generation?.temperature),
    topP: numberString(generation?.topP),
    topK: numberString(generation?.topK),
    frequencyPenalty: numberString(generation?.frequencyPenalty),
    presencePenalty: numberString(generation?.presencePenalty),
    seed: numberString(generation?.seed),
    maxTokens: numberString(generation?.maxTokens),
  };
}
function nodeGenerationOf(values: AgentFieldsOutput): AgentGenerationSettings | null {
  const generation: AgentGenerationSettings = {
    temperature: values.temperature,
    topP: values.topP,
    topK: values.topK,
    frequencyPenalty: values.frequencyPenalty,
    presencePenalty: values.presencePenalty,
    seed: values.seed,
    maxTokens: values.maxTokens,
  };
  const wrote = Object.values(generation).some((value) => value !== undefined);
  return wrote ? generation : null;
}
function modelRefOf(node: Node): AgentModelRef | undefined {
  if (node.type !== 'llm:generate' && node.type !== 'control:route') {
    return undefined;
  }
  const model = node.model;
  if (model === undefined || typeof model === 'string') {
    return undefined;
  }
  return model;
}
function withModelRef(node: Node, ref: AgentModelRef | undefined): Node {
  if (node.type !== 'llm:generate' && node.type !== 'control:route') {
    return node;
  }
  const { model: _dropped, ...rest } = node;
  return ref === undefined ? (rest as Node) : ({ ...rest, model: ref } as Node);
}
function numberString(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}
