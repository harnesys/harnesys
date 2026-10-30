import { OLLAMA_CLOUD_DEFAULT_URL, OLLAMA_DEFAULT_URL } from '../../../constants.ts';
import type { DiscoveredModel, DiscoverInput } from '../../../ports/models.ts';
import { fetchListedModels } from './fetch-list.ts';
import { asRecord, asString, asStringList, itemsOf, pricingOf } from './parse.ts';
import { bearerHeaders, modelsUrl } from './request.ts';

export { OLLAMA_CLOUD_DEFAULT_URL, OLLAMA_DEFAULT_URL };
export function listOllamaModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  return fetchListedModels({
    url: modelsUrl(input, OLLAMA_DEFAULT_URL, '/api/tags'),
    headers: bearerHeaders(input),
    fetch: input.fetch,
    parse: parseOllamaTags,
  });
}
export function listOllamaCloudModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  return fetchListedModels({
    url: modelsUrl(input, OLLAMA_CLOUD_DEFAULT_URL, '/api/tags'),
    headers: bearerHeaders(input),
    fetch: input.fetch,
    parse: parseOllamaTags,
  });
}
export async function showOllamaModel(
  input: DiscoverInput,
  name: string,
): Promise<DiscoveredModel | undefined> {
  const json = await ollamaShow(input, OLLAMA_DEFAULT_URL, name);
  return ollamaShowToModel(name, json);
}
export async function showOllamaCloudModel(
  input: DiscoverInput,
  name: string,
): Promise<DiscoveredModel | undefined> {
  const json = await ollamaShow(input, OLLAMA_CLOUD_DEFAULT_URL, name);
  return ollamaShowToModel(name, json);
}
export function parseOllamaTags(json: unknown): DiscoveredModel[] {
  const found: DiscoveredModel[] = [];
  for (const item of itemsOf(json, 'models')) {
    const record = asRecord(item);
    const name = asString(record?.name) ?? asString(record?.model);
    if (!record || !name) {
      continue;
    }
    const capabilities = asStringList(record.capabilities);
    found.push({
      name,
      kind: capabilities.includes('embedding') ? 'embed' : 'chat',
      pricing: pricingOf({ prompt: '0', completion: '0' }),
      raw: item,
    });
  }
  return found;
}
async function ollamaShow(
  input: DiscoverInput,
  fallbackBase: string,
  name: string,
): Promise<Record<string, unknown> | undefined> {
  const base = (input.apiUrl ?? fallbackBase).replace(/\/v1\/?$/, '');
  const doFetch = input.fetch ?? fetch;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (input.apiKey) {
    headers.authorization = `Bearer ${input.apiKey}`;
  }
  for (const [key, value] of Object.entries(input.headers ?? {})) {
    headers[key.toLowerCase()] = value;
  }
  const response = await doFetch(`${base}/api/show`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: name }),
  });
  if (!response.ok) {
    return undefined;
  }
  const json: unknown = await response.json();
  return asRecord(json);
}
function ollamaShowToModel(name: string, json: Record<string, unknown> | undefined) {
  if (!json) {
    return undefined;
  }
  const capabilities = new Set(asStringList(json.capabilities));
  const thinking = asRecord(json.thinking);
  const effort = effortsFromThinking(thinking);
  const modelInfo = asRecord(json.model_info);
  return {
    name,
    kind: capabilities.has('embedding') ? ('embed' as const) : ('chat' as const),
    context_length: contextLengthOf(modelInfo),
    architecture: capabilities.has('vision')
      ? { input_modalities: ['text', 'image'], output_modalities: ['text'] }
      : undefined,
    supported_parameters: paramsFromCapabilities(capabilities),
    effort: effort.effort,
    defaultEffort: effort.defaultEffort,
    reasoningMandatory: effort.mandatory,
    raw: json,
  };
}
function contextLengthOf(modelInfo: Record<string, unknown> | undefined): number | undefined {
  if (!modelInfo) {
    return undefined;
  }
  for (const [key, value] of Object.entries(modelInfo)) {
    if (key.endsWith('.context_length') && typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}
function paramsFromCapabilities(capabilities: Set<string>): string[] {
  const params: string[] = [];
  if (capabilities.has('tools')) {
    params.push('tools');
  }
  if (capabilities.has('structured outputs') || capabilities.has('structured_outputs')) {
    params.push('structured_outputs', 'response_format');
  }
  if (capabilities.has('thinking')) {
    params.push('reasoning', 'reasoning_effort');
  }
  return params;
}
interface ThinkingEffort {
  effort: string[];
  defaultEffort: string | undefined;
  mandatory: boolean | undefined;
}
const EFFORT_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const EFFORT_VALUES = new Set(EFFORT_ORDER);
function effortsFromThinking(thinking: Record<string, unknown> | undefined): ThinkingEffort {
  const values = Array.isArray(thinking?.values)
    ? thinking.values.filter(
        (item): item is string | boolean => typeof item === 'string' || typeof item === 'boolean',
      )
    : [];
  if (values.length === 0) {
    return { effort: [], defaultEffort: undefined, mandatory: undefined };
  }
  const effort = [...new Set(values.map(effortOf))].sort(
    (a, b) => EFFORT_ORDER.indexOf(a) - EFFORT_ORDER.indexOf(b),
  );
  const rawDefault = thinking?.default;
  let defaultEffort: string | undefined;
  if (typeof rawDefault === 'string' || typeof rawDefault === 'boolean') {
    const candidate = effortOf(rawDefault);
    defaultEffort = effort.includes(candidate) ? candidate : undefined;
  }
  return { effort, defaultEffort, mandatory: effort.includes('none') ? undefined : true };
}
function effortOf(value: string | boolean): string {
  if (typeof value === 'boolean') {
    return value ? 'high' : 'none';
  }
  return EFFORT_VALUES.has(value) ? value : 'high';
}
