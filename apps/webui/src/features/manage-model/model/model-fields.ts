import type {
  DiscoveredModel,
  Effort,
  Modality,
  ModelArchitecture,
  ModelFeature,
  ModelKind,
  ModelPricing,
  ModelRecord,
  ModelTopProvider,
  ProviderModelPublic,
} from '@harnesys/studio-shared';
import {
  EFFORTS,
  isModelKind,
  isModelKindSupported,
  MODALITIES,
  MODEL_FEATURES,
  MODEL_KINDS,
  withChatGenerationParameters,
} from '@harnesys/studio-shared';
import { z } from 'zod';

export { MODEL_KINDS };

const optionalAmount = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value === '' || Number.isFinite(Number(value)), 'Must be a number')
  .transform((value) => (value === '' ? undefined : Number(value)));
const optionalPrice = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value === '' || Number.isFinite(Number(value)), 'Must be a number')
  .transform((value) => (value === '' ? undefined : value));
export const modelFieldsSchema = z
  .object({
    kind: z.enum(MODEL_KINDS),
    description: z.string().optional(),
    context_length: optionalAmount,
    maxOutput: optionalAmount,
    cacheRead: optionalPrice,
    input: optionalPrice,
    output: optionalPrice,
    modalities: z.object({
      input: z.array(z.enum(MODALITIES)),
      output: z.array(z.enum(MODALITIES)),
    }),
    features: z.array(z.enum(MODEL_FEATURES)),
    effort: z.array(z.enum(EFFORTS)),
    defaultEffort: z.enum(EFFORTS).optional(),
    reasoningMandatory: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'embed') {
      const hasExtra = value.output !== undefined || value.cacheRead !== undefined;
      if (hasExtra && value.input === undefined) {
        ctx.addIssue({ code: 'custom', path: ['input'], message: 'Required when pricing is set' });
      }
      return;
    }
    const hasCost =
      value.input !== undefined || value.output !== undefined || value.cacheRead !== undefined;
    if (!hasCost) {
      return;
    }
    if (value.input === undefined) {
      ctx.addIssue({ code: 'custom', path: ['input'], message: 'Required with output' });
    }
    if (value.output === undefined) {
      ctx.addIssue({ code: 'custom', path: ['output'], message: 'Required with input' });
    }
  });
export const addModelSchema = modelFieldsSchema.and(
  z.object({
    name: z.string().trim().min(1, 'Name required'),
  }),
);
export type ModelFieldsInput = z.input<typeof modelFieldsSchema>;
export type ModelFieldsOutput = z.output<typeof modelFieldsSchema>;
export type AddModelInput = z.input<typeof addModelSchema>;
export type AddModelOutput = z.output<typeof addModelSchema>;
export interface ModelFieldsDraft {
  id?: string;
  name?: string;
  description?: string;
  context_length?: number;
  architecture?: ModelArchitecture;
  pricing?: ModelPricing;
  top_provider?: ModelTopProvider;
  supported_parameters?: string[];
  effort?: Effort[];
  defaultEffort?: Effort;
  reasoningMandatory?: boolean;
}
export type ModelEditorDraft = ModelFieldsDraft & {
  kind: ModelKind;
};
export function emptyModelFields(kind: ModelKind = 'chat'): ModelFieldsInput {
  return {
    kind,
    description: '',
    context_length: '',
    maxOutput: '',
    cacheRead: '',
    input: '',
    output: '',
    modalities: { input: [], output: [] },
    features: [],
    effort: [],
    defaultEffort: undefined,
    reasoningMandatory: undefined,
  };
}
export function resolveModelKind(raw?: string): ModelKind {
  return isModelKind(raw) ? raw : 'chat';
}
export function isSupportedKind(kind: string | undefined): boolean {
  return isModelKindSupported(resolveModelKind(kind));
}
export function isEmbedKind(kind: string | undefined): boolean {
  return kind === 'embed';
}
export function metadataFromModel(
  model?: ProviderModelPublic | ModelRecord,
): ModelFieldsDraft | undefined {
  if (!model) {
    return undefined;
  }
  if ('metadata' in model && model.metadata && typeof model.metadata === 'object') {
    return model.metadata as ModelFieldsDraft;
  }
  return model as ModelFieldsDraft;
}
export function modelFieldsFrom(row: {
  stored?: ProviderModelPublic | ModelRecord;
  found?: DiscoveredModel;
}): ModelFieldsInput {
  const storedFields = metadataFromModel(row.stored);
  const fields = mergeFields(row.found, storedFields);
  const features = featuresFrom(fields);
  const defaultEffort =
    fields.defaultEffort !== undefined && fields.effort?.includes(fields.defaultEffort)
      ? fields.defaultEffort
      : undefined;
  const storedKind =
    row.stored && 'kind' in row.stored && typeof row.stored.kind === 'string'
      ? row.stored.kind
      : undefined;
  return {
    kind: resolveModelKind(storedKind ?? row.found?.kind),
    description: fields.description ?? '',
    context_length: stringify(fields.context_length ?? fields.top_provider?.context_length),
    maxOutput: stringify(fields.top_provider?.max_completion_tokens),
    cacheRead: stringifyPrice(fields.pricing?.input_cache_read),
    input: stringifyPrice(fields.pricing?.prompt),
    output: stringifyPrice(fields.pricing?.completion),
    modalities: {
      input: fields.architecture?.input_modalities ?? [],
      output: fields.architecture?.output_modalities ?? [],
    },
    features,
    effort: fields.effort ?? [],
    defaultEffort,
    reasoningMandatory: fields.reasoningMandatory,
  };
}
export function mergeFields(base?: ModelFieldsDraft, extra?: ModelFieldsDraft): ModelFieldsDraft {
  return {
    id: extra?.id ?? base?.id,
    name: extra?.name ?? base?.name,
    description: extra?.description ?? base?.description,
    context_length: extra?.context_length ?? base?.context_length,
    architecture: extra?.architecture ?? base?.architecture,
    pricing: extra?.pricing ?? base?.pricing,
    top_provider: extra?.top_provider ?? base?.top_provider,
    supported_parameters: extra?.supported_parameters ?? base?.supported_parameters,
    effort: extra?.effort ?? base?.effort,
    defaultEffort: extra?.defaultEffort ?? base?.defaultEffort,
    reasoningMandatory: extra?.reasoningMandatory ?? base?.reasoningMandatory,
  };
}
export function toModelDraft(values: ModelFieldsOutput): ModelFieldsDraft {
  if (values.kind === 'embed') {
    return toEmbedDraft(values);
  }
  return toChatDraft(values);
}
export function toEditorDraft(values: ModelFieldsOutput): ModelEditorDraft {
  return { kind: values.kind, ...toModelDraft(values) };
}
function toEmbedDraft(values: ModelFieldsOutput): ModelFieldsDraft {
  const pricing: ModelPricing | undefined =
    values.input !== undefined
      ? {
          prompt: String(values.input),
          completion: '0',
        }
      : undefined;
  const top_provider: ModelTopProvider | undefined =
    values.context_length !== undefined ? { context_length: values.context_length } : undefined;
  return {
    description: values.description ? values.description.trim() : undefined,
    context_length: values.context_length,
    top_provider,
    pricing,
  };
}
function toChatDraft(values: ModelFieldsOutput): ModelFieldsDraft {
  const hasReasoning = values.features.includes('reasoning');
  return {
    description: values.description ? values.description.trim() : undefined,
    context_length: values.context_length,
    top_provider: chatTopProvider(values),
    architecture: chatArchitecture(values),
    pricing: chatPricing(values),
    supported_parameters: withChatGenerationParameters(chatFeatureParams(values, hasReasoning)),
    effort: hasReasoning && values.effort.length > 0 ? values.effort : undefined,
    defaultEffort: chatDefaultEffort(values, hasReasoning),
    reasoningMandatory: hasReasoning ? values.reasoningMandatory : undefined,
  };
}
function chatFeatureParams(values: ModelFieldsOutput, hasReasoning: boolean): string[] {
  const featureParams: string[] = [];
  if (values.features.includes('tools')) {
    featureParams.push('tools');
  }
  if (values.features.includes('structured')) {
    featureParams.push('structured_outputs', 'response_format');
  }
  if (hasReasoning) {
    featureParams.push('reasoning', 'reasoning_effort');
  }
  return featureParams;
}
function chatPricing(values: ModelFieldsOutput): ModelPricing | undefined {
  if (values.input === undefined || values.output === undefined) {
    return undefined;
  }
  return {
    prompt: String(values.input),
    completion: String(values.output),
    input_cache_read: values.cacheRead ? String(values.cacheRead) : undefined,
  };
}
function chatTopProvider(values: ModelFieldsOutput): ModelTopProvider | undefined {
  if (values.context_length === undefined && values.maxOutput === undefined) {
    return undefined;
  }
  return {
    context_length: values.context_length,
    max_completion_tokens: values.maxOutput,
  };
}
function chatArchitecture(values: ModelFieldsOutput): ModelArchitecture | undefined {
  if (values.modalities.input.length === 0 && values.modalities.output.length === 0) {
    return undefined;
  }
  return {
    input_modalities: values.modalities.input,
    output_modalities: values.modalities.output,
  };
}
function chatDefaultEffort(values: ModelFieldsOutput, hasReasoning: boolean): Effort | undefined {
  if (!hasReasoning || values.defaultEffort === undefined) {
    return undefined;
  }
  return values.effort.includes(values.defaultEffort) ? values.defaultEffort : undefined;
}
function featuresFrom(fields: ModelFieldsDraft): ModelFeature[] {
  const features: ModelFeature[] = [];
  const params = fields.supported_parameters ?? [];
  if (params.includes('tools')) {
    features.push('tools');
  }
  if (params.includes('structured_outputs') || params.includes('response_format')) {
    features.push('structured');
  }
  if (
    params.includes('reasoning') ||
    params.includes('reasoning_effort') ||
    (fields.effort && fields.effort.length > 0)
  ) {
    features.push('reasoning');
  }
  if (fields.pricing?.input_cache_read || fields.pricing?.input_cache_write) {
    features.push('cache');
  }
  features.push('streaming');
  return features;
}
function stringify(value: number | undefined): string {
  return value == null ? '' : String(value);
}
function stringifyPrice(value: string | undefined): string {
  if (value == null || value === '') {
    return '';
  }
  return value;
}
export function toggleItem<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item];
}
export const MODALITY_ITEMS: {
  value: Modality;
  label: string;
}[] = [
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
  { value: 'file', label: 'File' },
];
export const FEATURE_ITEMS: {
  value: ModelFeature;
  label: string;
}[] = [
  { value: 'tools', label: 'Function Calling' },
  { value: 'structured', label: 'Structured Output' },
  { value: 'streaming', label: 'Streaming' },
  { value: 'reasoning', label: 'Reasoning' },
  { value: 'cache', label: 'Prompt Cache' },
];
export const EFFORT_ITEMS: {
  value: Effort;
  label: string;
}[] = [
  { value: 'none', label: 'None' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra High' },
  { value: 'max', label: 'Max' },
];
export const KIND_ITEMS: {
  value: ModelKind;
  label: string;
  hint: string;
}[] = [
  { value: 'chat', label: 'Chat', hint: 'Completions / agents' },
  { value: 'embed', label: 'Embedding', hint: 'Vector index / search' },
  { value: 'image', label: 'Image', hint: 'Image generation' },
  { value: 'audio', label: 'Audio', hint: 'Speech / audio' },
  { value: 'decision', label: 'Decision', hint: 'System One / structured choice' },
  { value: 'rerank', label: 'Rerank', hint: 'Document reranking' },
  { value: 'speech', label: 'Speech', hint: 'Text to speech' },
  { value: 'transcription', label: 'Transcription', hint: 'Speech to text' },
  { value: 'video', label: 'Video', hint: 'Video generation' },
];
