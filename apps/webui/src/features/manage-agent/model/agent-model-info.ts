import type {
  AgentGenerationSettings,
  Effort,
  ProviderModelPublic,
  ProviderPublic,
} from '@harnesys/studio-shared';
import { filterGenerationSettings, withChatGenerationParameters } from '@harnesys/studio-shared';
import type { AgentGenerationField } from './agent-fields.ts';

const FIELD_PARAMS: {
  field: AgentGenerationField;
  params: string[];
}[] = [
  { field: 'temperature', params: ['temperature'] },
  { field: 'topP', params: ['top_p'] },
  { field: 'topK', params: ['top_k'] },
  { field: 'frequencyPenalty', params: ['frequency_penalty'] },
  { field: 'presencePenalty', params: ['presence_penalty'] },
  { field: 'seed', params: ['seed'] },
  { field: 'maxTokens', params: ['max_tokens', 'max_completion_tokens'] },
];
export function modelEfforts(
  modelId: string | null | undefined,
  providers: ProviderPublic[],
): Effort[] {
  const model = findModel(modelId, providers);
  const levels = model?.efforts ?? [];
  if (model?.reasoningMandatory === true) {
    return levels.filter((item) => item !== 'none');
  }
  return levels;
}
export function modelSupportedParameters(
  modelId: string | null | undefined,
  providers: ProviderPublic[],
): string[] {
  const model = findModel(modelId, providers);
  if (!model) {
    return [];
  }
  const stored = model.host?.supported_parameters ?? model.supported_parameters;
  return withChatGenerationParameters(stored);
}
export function generationFieldVisible(
  supported: string[] | undefined,
  field: AgentGenerationField,
): boolean {
  if (!supported?.length) {
    return false;
  }
  if (field === 'contextWindowTokens') {
    return true;
  }
  const entry = FIELD_PARAMS.find((item) => item.field === field);
  if (!entry) {
    return false;
  }
  return entry.params.some((name) => supported.includes(name));
}
export function hasGenerationFields(supported: string[] | undefined): boolean {
  return FIELD_PARAMS.some((item) => generationFieldVisible(supported, item.field));
}
export function sanitizeForModel(
  modelId: string | null,
  effort: string | null | undefined,
  generation: AgentGenerationSettings | null | undefined,
  providers: ProviderPublic[],
): {
  effort: string | null;
  generation: AgentGenerationSettings | null;
} {
  const levels = modelEfforts(modelId, providers);
  const nextEffort = effort && levels.includes(effort as Effort) ? effort : null;
  const supported = modelSupportedParameters(modelId, providers);
  const filtered = filterGenerationSettings(generation ?? undefined, supported);
  return {
    effort: nextEffort,
    generation: filtered ?? null,
  };
}
function findModel(
  modelId: string | null | undefined,
  providers: ProviderPublic[],
): ProviderModelPublic | undefined {
  if (!modelId) {
    return undefined;
  }
  for (const provider of providers) {
    const found = provider.models.find((item) => item.id === modelId);
    if (found) {
      return found;
    }
  }
  return undefined;
}
