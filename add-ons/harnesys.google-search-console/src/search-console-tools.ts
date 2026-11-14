import { type AddonContext, AddonError, type ToolHandler } from '@harnesys/sdk';
import { SEARCH_CONSOLE_API, searchConsoleJson } from './search-console-client.ts';

const DEFAULT_ROWS = 25;
const ROWS_MAX = 100;

interface SiteListWire {
  siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }>;
}

interface AnalyticsRowWire {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

interface AnalyticsResponseWire {
  rows?: AnalyticsRowWire[];
}

export interface SearchConsoleSite {
  siteUrl: string;
  permissionLevel: string;
}

export interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

const listSites: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const json = await searchConsoleJson<SiteListWire>(ctx, {
    ...accountOf(input),
    url: `${SEARCH_CONSOLE_API}/sites`,
  });
  const sites = (json.siteEntry ?? [])
    .filter(
      (entry): entry is { siteUrl: string; permissionLevel?: string } =>
        typeof entry.siteUrl === 'string' && entry.siteUrl !== '',
    )
    .map((entry) => ({
      siteUrl: entry.siteUrl,
      permissionLevel: entry.permissionLevel ?? '',
    }));
  return { sites } satisfies { sites: SearchConsoleSite[] };
};

const searchAnalytics: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const siteUrl = requiredTextOf(input, 'siteUrl');
  const startDate = requiredTextOf(input, 'startDate');
  const endDate = requiredTextOf(input, 'endDate');
  const dimensions = splitList(optionalTextOf(input, 'dimensions'));
  const json = await searchConsoleJson<AnalyticsResponseWire>(ctx, {
    ...accountOf(input),
    method: 'POST',
    url: `${SEARCH_CONSOLE_API}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    body: JSON.stringify({
      startDate,
      endDate,
      ...(dimensions.length === 0 ? {} : { dimensions }),
      rowLimit: maxResultsOf(input),
    }),
  });
  const rows = (json.rows ?? []).map((row) => ({
    keys: Array.isArray(row.keys) ? row.keys : [],
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  }));
  return { siteUrl, rows } satisfies { siteUrl: string; rows: SearchAnalyticsRow[] };
};

export const searchConsoleTools: Record<string, ToolHandler> = {
  list_sites: listSites,
  search_analytics: searchAnalytics,
};

function accountOf(input: Record<string, unknown>): { accountId?: string } {
  const accountId = optionalTextOf(input, 'accountId');
  return accountId === undefined ? {} : { accountId };
}

function maxResultsOf(input: Record<string, unknown>): number {
  const raw = input.maxResults;
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    return DEFAULT_ROWS;
  }
  return Math.min(Math.max(1, raw), ROWS_MAX);
}

function splitList(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

function requiredTextOf(input: Record<string, unknown>, key: string): string {
  const value = optionalTextOf(input, key);
  if (value === undefined) {
    throw new AddonError('invalid_params', { detail: `${key} is required` });
  }
  return value;
}

function optionalTextOf(input: Record<string, unknown>, key: string): string | undefined {
  const raw = input[key];
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== 'string') {
    throw new AddonError('invalid_params', { detail: `${key} must be a string` });
  }
  return raw === '' ? undefined : raw;
}
