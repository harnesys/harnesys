import { OPENROUTER_DEFAULT_URL } from '../../../constants.ts';
import { withChatGenerationParameters } from '../../../domain/generation-settings.ts';
import type { DiscoveredModel, DiscoverInput, ModelArchitecture } from '../../../ports/models.ts';
import { modelKindFromOutputModalities } from '../../../ports/models.ts';
import { fetchListedModels } from './fetch-list.ts';
import {
  asNumber,
  asRecord,
  asString,
  asStringList,
  formatPriceString,
  itemsOf,
  pricingOf,
  pricingOverridesOf,
} from './parse.ts';
import { bearerHeaders, modelsUrl } from './request.ts';

export { OPENROUTER_DEFAULT_URL };
export function listOpenRouterModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  const url = new URL(modelsUrl(input, OPENROUTER_DEFAULT_URL));
  url.searchParams.set('output_modalities', 'all');
  return fetchListedModels({
    url: url.toString(),
    headers: bearerHeaders(input),
    fetch: input.fetch,
    parse: parseOpenRouterList,
  });
}
export function parseOpenRouterList(json: unknown): DiscoveredModel[] {
  const found: DiscoveredModel[] = [];
  for (const item of itemsOf(json)) {
    const mapped = mapOpenRouterModel(item);
    if (mapped) {
      found.push(mapped);
    }
  }
  return found;
}
const VALID_MODALITIES = new Set(['text', 'image', 'audio', 'video', 'file']);
function modalitiesOf(raw: unknown): string[] | undefined {
  const list = asStringList(raw)
    .filter((item) => VALID_MODALITIES.has(item))
    .sort();
  return list.length > 0 ? list : undefined;
}
function architectureOf(
  architecture: Record<string, unknown> | undefined,
): ModelArchitecture | undefined {
  const input = modalitiesOf(architecture?.input_modalities);
  const output = modalitiesOf(architecture?.output_modalities);
  if (!input && !output) {
    return undefined;
  }
  return { input_modalities: input ?? [], output_modalities: output ?? [] };
}
function mapOpenRouterModel(item: unknown): DiscoveredModel | undefined {
  const record = asRecord(item);
  const name = asString(record?.id);
  if (!record || !name) {
    return undefined;
  }
  const pricing = asRecord(record.pricing);
  const topProvider = asRecord(record.top_provider);
  const architecture = asRecord(record.architecture);
  const contextLength = asNumber(record.context_length) ?? asNumber(topProvider?.context_length);
  const maxOutput = asNumber(topProvider?.max_completion_tokens);
  const params = asStringList(record.supported_parameters);
  const reasoningInfo = readReasoningInfo(record.reasoning);
  const hasReasoningParams =
    params.includes('reasoning') ||
    params.includes('reasoning_effort') ||
    params.includes('include_reasoning') ||
    reasoningInfo !== undefined;
  const effort = hasReasoningParams ? resolveEffortLevels(name, reasoningInfo) : undefined;
  return {
    name,
    kind: modelKindFromOutputModalities(itemsOf(architecture ?? {}, 'output_modalities')),
    description: asString(record.description),
    context_length: contextLength,
    architecture: architectureOf(architecture),
    pricing: pricing
      ? pricingOf({
          prompt: formatPriceString(pricing.prompt) ?? '0',
          completion: formatPriceString(pricing.completion) ?? '0',
          input_cache_read: formatPriceString(pricing.input_cache_read),
          input_cache_write: formatPriceString(pricing.input_cache_write),
          image: formatPriceString(pricing.image),
          request: formatPriceString(pricing.request),
          overrides: pricingOverridesOf(pricing.overrides),
        })
      : undefined,
    top_provider:
      contextLength !== undefined || maxOutput !== undefined
        ? { context_length: contextLength, max_completion_tokens: maxOutput }
        : undefined,
    supported_parameters: withChatGenerationParameters(params.length > 0 ? params : undefined),
    effort,
    defaultEffort: reasoningInfo?.defaultEffort,
    reasoningMandatory: reasoningInfo?.mandatory,
    deprecated: Boolean(asString(record.expiration_date)),
    raw: item,
  };
}
const NONE_LOW_MEDIUM_HIGH = ['none', 'low', 'medium', 'high'];
const LOW_MEDIUM_HIGH = ['low', 'medium', 'high'];
const OPENAI_EFFORT = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
const QWEN_EFFORT = ['none', 'low', 'medium', 'xhigh'];
const MISTRAL_EFFORT = ['high'];
interface ReasoningInfo {
  efforts: string[] | undefined;
  defaultEffort: string | undefined;
  mandatory: boolean | undefined;
}
function readReasoningInfo(raw: unknown): ReasoningInfo | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const supported = Array.isArray(record.supported_efforts)
    ? record.supported_efforts.filter(
        (item): item is string => typeof item === 'string' && EFFORT_VALUES.has(item),
      )
    : undefined;
  const efforts = supported === undefined ? undefined : sortEfforts([...new Set(supported)]);
  const defaultRaw = typeof record.default_effort === 'string' ? record.default_effort : undefined;
  const defaultEffort =
    defaultRaw !== undefined && EFFORT_VALUES.has(defaultRaw) ? defaultRaw : undefined;
  const mandatory = typeof record.mandatory === 'boolean' ? record.mandatory : undefined;
  return { efforts, defaultEffort, mandatory };
}
const EFFORT_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const EFFORT_VALUES = new Set(EFFORT_ORDER);
function sortEfforts(values: string[]): string[] {
  return values.sort((a, b) => EFFORT_ORDER.indexOf(a) - EFFORT_ORDER.indexOf(b));
}
function resolveEffortLevels(
  modelId: string,
  info: ReasoningInfo | undefined,
): string[] | undefined {
  if (info !== undefined) {
    if (info.efforts === undefined) {
      return fallbackEffortLevels(modelId);
    }
    if (info.efforts.length === 0) {
      return undefined;
    }
    return info.mandatory === true ? info.efforts.filter((item) => item !== 'none') : info.efforts;
  }
  return fallbackEffortLevels(modelId);
}
function fallbackEffortLevels(modelId: string): string[] {
  const prefix = modelId.split('/')[0] ?? '';
  switch (prefix) {
    case 'openai':
      return OPENAI_EFFORT;
    case 'x-ai':
      return LOW_MEDIUM_HIGH;
    case 'mistralai':
      return MISTRAL_EFFORT;
    case 'qwen':
      return QWEN_EFFORT;
    case 'moonshotai':
      return ['low', 'high', 'max'];
    case 'nvidia':
      return LOW_MEDIUM_HIGH;
    default:
      return NONE_LOW_MEDIUM_HIGH;
  }
}
