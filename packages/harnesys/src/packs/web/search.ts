import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import type {
  SearchInfobox,
  SearchMeta,
  SearchOptions,
  SearchProvider,
  SearchResult,
  SearchTimeRange,
} from './search-providers.ts';
import { duckduckgoSearch, searxngSearch } from './search-providers.ts';
export type WebSearchProviderName = 'duckduckgo' | 'searxng';
export const WEB_SEARCH_PROVIDERS: readonly WebSearchProviderName[] = ['duckduckgo', 'searxng'];
export interface WebSearchPackSpec {
  provider?: WebSearchProviderName;
  searxngUrl?: string;
  maxResults?: number;
}
const DEFAULT_SEARXNG_URL = 'http://localhost:8888';
const DEFAULT_MAX_RESULTS = 8;
const MAX_RESULTS_LIMIT = 20;
const BATCH_LIMIT = 5;
export interface WebSearchInput {
  query?: string;
  queries?: string[];
  max_results?: number;
  language?: string;
  time_range?: SearchTimeRange;
  categories?: string;
  pageno?: number;
  engines?: string[];
}
interface WebSearchEntry {
  query: string;
  results?: SearchResult[];
  error?: string;
  number_of_results?: number;
  engines_used?: string[];
  unresponsive_engines?: string[];
  answers?: string[];
  infoboxes?: SearchInfobox[];
}
type WebSearchMetaFields = Omit<WebSearchEntry, 'query'>;
export function webSearchTool(spec: WebSearchPackSpec): ToolDefinition {
  const provider =
    spec.provider === 'searxng'
      ? searxngSearch({
          url: spec.searxngUrl ?? DEFAULT_SEARXNG_URL,
          providers: WEB_SEARCH_PROVIDERS,
        })
      : duckduckgoSearch();
  const defaultMaxResults = clampMaxResults(spec.maxResults);
  return tool('web_search', {
    group: 'web_search',
    description:
      'Search the web for current information. Use for facts that may be missing or outdated in the knowledge base. Batch up to 5 requests with `queries` (answers return in request order). `language`, `time_range`, `categories`, `pageno`, `engines` apply to the searxng provider; responses carry engines_used / unresponsive_engines / infoboxes when available.',
    operations: ['network'],
    sideEffect: 'read',
    input: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, description: 'A single search request.' },
        queries: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          minItems: 1,
          maxItems: BATCH_LIMIT,
          description: `Batch up to ${BATCH_LIMIT} search requests in one call; the answer is an array in request order.`,
        },
        max_results: { type: 'integer', minimum: 1, maximum: MAX_RESULTS_LIMIT },
        language: {
          type: 'string',
          description: 'ISO 639-1 code ("pl", "lt", "ru", "en") or "all". SearXNG only.',
        },
        time_range: {
          type: 'string',
          enum: ['day', 'week', 'month', 'year'],
          description: 'Freshness filter instead of putting a year in the query. SearXNG only.',
        },
        categories: {
          type: 'string',
          enum: ['general', 'news', 'images'],
          description: 'Engine category; news catches recent appointments. SearXNG only.',
        },
        pageno: {
          type: 'integer',
          minimum: 1,
          description: 'Result page number. SearXNG only.',
        },
        engines: {
          type: 'array',
          items: { type: 'string' },
          description: 'Pin specific SearXNG engines, e.g. ["bing","startpage"]. SearXNG only.',
        },
      },
    },
    execute: async (raw) => {
      const input = (raw ?? {}) as WebSearchInput;
      const resolved = resolveQueries(input);
      if ('error' in resolved) {
        return resolved;
      }
      const limit =
        input.max_results === undefined ? defaultMaxResults : clampMaxResults(input.max_results);
      const options = toSearchOptions(input);
      const entries = await Promise.all(
        resolved.queries.map((query) => searchOne(provider, query, options, limit)),
      );
      return entries.length === 1 ? entries[0] : { queries: entries };
    },
  });
}
export function resolveQueries(input: WebSearchInput): { queries: string[] } | { error: string } {
  const raw = [...(input.query === undefined ? [] : [input.query]), ...(input.queries ?? [])];
  const unique: string[] = [];
  for (const item of raw) {
    const trimmed = item.trim();
    if (trimmed !== '' && !unique.includes(trimmed)) {
      unique.push(trimmed);
    }
  }
  if (unique.length === 0) {
    return { error: 'query is required' };
  }
  if (unique.length > BATCH_LIMIT) {
    return { error: `up to ${BATCH_LIMIT} queries per call` };
  }
  return { queries: unique };
}
function toSearchOptions(input: WebSearchInput): SearchOptions {
  const language = input.language?.trim().toLowerCase();
  const engines = (input.engines ?? [])
    .map((engine) => engine.trim())
    .filter((engine) => engine !== '');
  return {
    ...(language === undefined || language === '' ? {} : { language }),
    ...(input.time_range === undefined ? {} : { timeRange: input.time_range }),
    ...(input.categories === undefined ? {} : { categories: input.categories }),
    ...(input.pageno === undefined ? {} : { pageno: input.pageno }),
    ...(engines.length === 0 ? {} : { engines }),
  };
}
async function searchOne(
  provider: SearchProvider,
  query: string,
  options: SearchOptions,
  limit: number,
): Promise<WebSearchEntry> {
  try {
    const response = await provider.search(query, options);
    return {
      query,
      results: response.results.slice(0, limit),
      ...toMetaFields(response.meta),
    };
  } catch (error) {
    return { query, error: error instanceof Error ? error.message : String(error) };
  }
}
function toMetaFields(meta: SearchMeta | undefined): WebSearchMetaFields {
  if (meta === undefined) {
    return {};
  }
  return {
    ...(meta.numberOfResults === undefined ? {} : { number_of_results: meta.numberOfResults }),
    ...(meta.enginesUsed === undefined ? {} : { engines_used: meta.enginesUsed }),
    ...(meta.unresponsiveEngines === undefined
      ? {}
      : { unresponsive_engines: meta.unresponsiveEngines }),
    ...(meta.answers === undefined ? {} : { answers: meta.answers }),
    ...(meta.infoboxes === undefined ? {} : { infoboxes: meta.infoboxes }),
  };
}
function clampMaxResults(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return DEFAULT_MAX_RESULTS;
  }
  return Math.min(Math.floor(value), MAX_RESULTS_LIMIT);
}
