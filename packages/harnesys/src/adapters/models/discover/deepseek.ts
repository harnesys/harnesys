import { DEEPSEEK_DEFAULT_URL } from '../../../constants.ts';
import type {
  DiscoveredModel,
  DiscoverInput,
  ModelArchitecture,
  ModelPricing,
} from '../../../ports/models.ts';
import { fetchListedModels } from './fetch-list.ts';
import { asNumber, asRecord, asString, itemsOf, pricingOf, topProviderOf } from './parse.ts';
import { bearerHeaders, modelsUrl } from './request.ts';

export { DEEPSEEK_DEFAULT_URL };

const FLASH_PRICING: ModelPricing = {
  prompt: '0.0000003',
  completion: '0.0000012',
  input_cache_read: '0.000000006',
};

const PRO_PRICING: ModelPricing = {
  prompt: '0.00000132',
  completion: '0.00000396',
  input_cache_read: '0.000000044',
};

const PRICING_BY_MODEL: Record<string, ModelPricing> = {
  'deepseek-flash': FLASH_PRICING,
  'deepseek-v4-flash': FLASH_PRICING,
  'deepseek-v4-flash-vision-exp': FLASH_PRICING,
  'deepseek-v4-pro': PRO_PRICING,
};
export function listDeepSeekModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  return fetchListedModels({
    url: modelsUrl(input, DEEPSEEK_DEFAULT_URL),
    headers: bearerHeaders(input),
    fetch: input.fetch,
    parse: parseDeepSeekList,
  });
}
export function parseDeepSeekList(json: unknown): DiscoveredModel[] {
  const found: DiscoveredModel[] = [];
  for (const item of itemsOf(json)) {
    const mapped = mapDeepSeekModel(item);
    if (mapped) {
      found.push(mapped);
    }
  }
  return found;
}
function mapDeepSeekModel(item: unknown): DiscoveredModel | undefined {
  const record = asRecord(item);
  const name = asString(record?.id);
  if (!record || !name) {
    return undefined;
  }
  const kind = deepSeekKind(name);
  const hasReasoning = kind === 'chat' && /reason|think|v4/i.test(name);
  const contextLength = asNumber(record.context_length) ?? asNumber(record.context_window);
  const maxOutput = asNumber(record.max_tokens) ?? asNumber(record.max_completion_tokens);
  return {
    name,
    kind,
    context_length: contextLength,
    architecture: chatArchitecture(kind, name),
    pricing: pricingOf(PRICING_BY_MODEL[name] ?? {}),
    top_provider: topProviderOf(contextLength, maxOutput),
    effort: hasReasoning ? ['none', 'low', 'high', 'max'] : undefined,
    raw: item,
  };
}
function chatArchitecture(kind: 'chat' | 'embed', name: string): ModelArchitecture | undefined {
  if (kind !== 'chat') {
    return undefined;
  }
  return {
    input_modalities: /vision|vl/i.test(name) ? ['text', 'image'] : ['text'],
    output_modalities: ['text'],
  };
}
function deepSeekKind(name: string): 'chat' | 'embed' {
  if (/embed/i.test(name)) {
    return 'embed';
  }
  return 'chat';
}
