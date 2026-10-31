import { type ToolDefinition, tool } from '../../ports/tools.ts';
import type { GoogleToolsDeps } from './google-tools-deps.ts';

interface SearchAnalyticsInput {
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions?: string;
  rowLimit?: number;
}

const ROWS_MAX = 100;

export function createSearchConsoleTools(deps: GoogleToolsDeps): ToolDefinition[] {
  return [
    tool('gsc_list_sites', {
      group: 'google',
      description:
        'List Search Console sites (URL-prefix and domain properties) accessible by the connected Google account with permission levels.',
      input: { type: 'object', properties: {}, required: [] },
      sideEffect: 'read',
      execute: async () =>
        runGuard(async () => ({
          sites: await deps.google.listSites(deps.resolveScope(), deps.integrationId),
        })),
    }),
    tool('gsc_search_analytics', {
      group: 'google',
      description:
        'Query Google Search Console search analytics for a verified site: clicks, impressions, CTR, and average position grouped by dimensions (query, page, date, device, country).',
      input: {
        type: 'object',
        properties: {
          siteUrl: { type: 'string', description: 'Site URL from gsc_list_sites' },
          startDate: { type: 'string', description: 'YYYY-MM-DD' },
          endDate: { type: 'string', description: 'YYYY-MM-DD' },
          dimensions: {
            type: 'string',
            description: 'Comma-separated: query, page, date, device, country',
          },
          rowLimit: { type: 'integer', minimum: 1, maximum: ROWS_MAX },
        },
        required: ['siteUrl', 'startDate', 'endDate'],
      },
      sideEffect: 'read',
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as SearchAnalyticsInput;
          const rows = await deps.google.searchAnalytics(deps.resolveScope(), deps.integrationId, {
            siteUrl: input.siteUrl,
            startDate: input.startDate,
            endDate: input.endDate,
            ...(input.dimensions !== undefined ? { dimensions: splitList(input.dimensions) } : {}),
            ...(input.rowLimit !== undefined ? { rowLimit: input.rowLimit } : {}),
          });
          return { rows };
        }),
    }),
  ];
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

async function runGuard<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
