import type { Effort, Modality, ModelFeature } from '@harnesys/studio-shared';
import type { OllamaModelInfo } from '@/shared/api/providers';
import type { ModelFieldsInput } from './model-fields';
import { emptyModelFields } from './model-fields';

const EFFORT_VALUES = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const THINKING_ON = 'high';

export const OLLAMA_DRIVERS = new Set(['ollama', 'ollama-cloud']);
export function isOllamaDriver(driver: string | undefined): boolean {
  return driver !== undefined && OLLAMA_DRIVERS.has(driver);
}
export function ollamaFieldsFrom(info: OllamaModelInfo): ModelFieldsInput {
  const capabilities = new Set(info.capabilities);
  const features: ModelFeature[] = [];
  if (capabilities.has('tools')) {
    features.push('tools');
  }
  if (capabilities.has('thinking')) {
    features.push('reasoning');
  }
  if (capabilities.has('structured outputs') || capabilities.has('structured_outputs')) {
    features.push('structured');
  }
  features.push('streaming');
  const modalities: { input: Modality[]; output: Modality[] } = capabilities.has('vision')
    ? { input: ['text', 'image'], output: ['text'] }
    : { input: [], output: [] };
  const thinking = effortsFrom(info);
  return {
    ...emptyModelFields(),
    description: descriptionOf(info),
    context_length: info.context_length !== undefined ? String(info.context_length) : '',
    features,
    modalities,
    effort: thinking.effort,
    defaultEffort: thinking.defaultEffort,
    reasoningMandatory: thinking.mandatory,
  };
}
function effortsFrom(info: OllamaModelInfo): {
  effort: Effort[];
  defaultEffort: Effort | undefined;
  mandatory: boolean | undefined;
} {
  const thinking = info.thinking;
  if (!thinking || thinking.values.length === 0) {
    return { effort: [], defaultEffort: undefined, mandatory: undefined };
  }
  const effort = uniqueEfforts(thinking.values.map(effortOf));
  const hasNone = effort.includes('none');
  const rawDefault = thinking.default;
  let defaultEffort: Effort | undefined;
  if (rawDefault !== undefined) {
    const candidate = effortOf(rawDefault);
    defaultEffort = effort.includes(candidate) ? candidate : undefined;
  }
  return {
    effort,
    defaultEffort,
    mandatory: hasNone ? undefined : true,
  };
}
function effortOf(value: string | boolean): Effort {
  if (typeof value === 'boolean') {
    return value ? 'high' : 'none';
  }
  return EFFORT_VALUES.has(value) ? (value as Effort) : THINKING_ON;
}
function uniqueEfforts(values: Effort[]): Effort[] {
  const order = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
  return [...new Set(values)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
function descriptionOf(info: OllamaModelInfo): string {
  const parts = [info.parameter_size, info.quantization_level].filter(Boolean);
  return parts.join(' · ');
}
