import type { ProviderPublic } from '@harnesys/studio-shared';
import type { AgentGenerationField } from './agent-fields.ts';
import { generationFieldVisible, modelSupportedParameters } from './agent-model-info.ts';

export interface GenerationSliderSpec {
  name: AgentGenerationField;
  label: string;
  min: number;
  max: number;
  step: number;
  fallback: number;
  format: (value: number) => string;
}
export interface GenerationLimitSpec {
  name: AgentGenerationField;
  label: string;
  placeholder: string;
}
export const GENERATION_SLIDERS: GenerationSliderSpec[] = [
  {
    name: 'temperature',
    label: 'Temperature',
    min: 0,
    max: 2,
    step: 0.01,
    fallback: 1,
    format: (value) => value.toFixed(2),
  },
  {
    name: 'topP',
    label: 'Top P',
    min: 0,
    max: 1,
    step: 0.01,
    fallback: 1,
    format: (value) => value.toFixed(2),
  },
  {
    name: 'topK',
    label: 'Top K',
    min: 1,
    max: 100,
    step: 1,
    fallback: 40,
    format: (value) => String(Math.round(value)),
  },
  {
    name: 'frequencyPenalty',
    label: 'Frequency',
    min: -2,
    max: 2,
    step: 0.01,
    fallback: 0,
    format: (value) => value.toFixed(2),
  },
  {
    name: 'presencePenalty',
    label: 'Presence',
    min: -2,
    max: 2,
    step: 0.01,
    fallback: 0,
    format: (value) => value.toFixed(2),
  },
];
export const GENERATION_LIMITS: GenerationLimitSpec[] = [
  { name: 'maxTokens', label: 'Max tokens', placeholder: '' },
  { name: 'contextWindowTokens', label: 'Context window', placeholder: '' },
  { name: 'seed', label: 'Seed', placeholder: '42' },
];
export interface ModelBounds {
  maxOutputTokens?: number;
  contextWindow?: number;
}
export function modelBounds(
  modelId: string | null | undefined,
  providers: ProviderPublic[],
): ModelBounds {
  const model = modelId
    ? providers.flatMap((provider) => provider.models).find((item) => item.id === modelId)
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
    ...(positiveModelNumber(maxOutputTokens) ? { maxOutputTokens } : {}),
    ...(positiveModelNumber(contextWindow) ? { contextWindow } : {}),
  };
}
function positiveModelNumber(value: number | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
export function generationDefaults(
  modelId: string | null | undefined,
  providers: ProviderPublic[],
): Partial<Record<AgentGenerationField, string>> {
  const supported = modelSupportedParameters(modelId, providers);
  const out: Partial<Record<AgentGenerationField, string>> = {};
  for (const spec of GENERATION_SLIDERS) {
    if (generationFieldVisible(supported, spec.name)) {
      out[spec.name] = spec.format(spec.fallback);
    }
  }
  return out;
}
