import { OPENROUTER_DEFAULT_URL } from '../../../constants.ts';
import type { DiscoveredModel, DiscoverInput } from '../../../ports/models.ts';
import { modelKindFromOutputModalities } from '../../../ports/models.ts';
import { fetchListedModels } from './fetch-list.ts';
import {
  asNumber,
  asRecord,
  asString,
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
  return {
    name,
    kind: modelKindFromOutputModalities(itemsOf(architecture ?? {}, 'output_modalities')),
    context_length: contextLength,
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
    deprecated: Boolean(asString(record.expiration_date)),
    raw: item,
  };
}
