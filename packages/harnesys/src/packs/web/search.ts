import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { duckduckgoSearch, searxngSearch } from './search-providers.ts';
export type WebSearchProviderName = 'duckduckgo' | 'searxng';
export const WEB_SEARCH_PROVIDERS: readonly WebSearchProviderName[] = ['duckduckgo', 'searxng'];
export interface WebSearchPackSpec {
  provider?: WebSearchProviderName;
  searxngUrl?: string;
  maxResults?: number;
}
const DEFAULT_SEARXNG_URL = 'http://localhost:8888';
const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS_LIMIT = 20;
export function webSearchTool(spec: WebSearchPackSpec): ToolDefinition {
  const provider =
    spec.provider === 'searxng'
      ? searxngSearch({ url: spec.searxngUrl ?? DEFAULT_SEARXNG_URL })
      : duckduckgoSearch();
  const defaultMaxResults = clampMaxResults(spec.maxResults);
  return tool('web_search', {
    group: 'web_search',
    description:
      'Search the web for current information. Use for facts that may be missing or outdated in the knowledge base.',
    operations: ['network'],
    sideEffect: 'read',
    input: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1 },
        max_results: { type: 'integer', minimum: 1, maximum: MAX_RESULTS_LIMIT },
      },
      required: ['query'],
    },
    execute: async (raw) => {
      const input = raw as {
        query?: string;
        max_results?: number;
      };
      const query = input.query?.trim() ?? '';
      if (query === '') {
        return { error: 'query is required' };
      }
      try {
        const results = await provider.search(query);
        const limit =
          input.max_results === undefined ? defaultMaxResults : clampMaxResults(input.max_results);
        return results.slice(0, limit);
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  });
}
function clampMaxResults(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return DEFAULT_MAX_RESULTS;
  }
  return Math.min(Math.floor(value), MAX_RESULTS_LIMIT);
}
