import type {
  GoogleSearchConsoleQueryInput,
  GoogleSearchConsoleRow,
  GoogleSearchConsoleSite,
} from 'harnesys';
import { asGoogleRecord, googleApiJson } from './google-http.ts';

const SEARCHCONSOLE_API_BASE = '/webmasters/v3';

export async function listSites(token: string): Promise<GoogleSearchConsoleSite[]> {
  const res = await googleApiJson<Record<string, unknown>>({
    token,
    method: 'GET',
    path: `${SEARCHCONSOLE_API_BASE}/sites`,
  });
  const entries = Array.isArray(res.siteEntry) ? res.siteEntry : [];
  return entries.map((entry) => {
    const record = asGoogleRecord(entry);
    return {
      siteUrl: typeof record.siteUrl === 'string' ? record.siteUrl : '',
      permissionLevel: typeof record.permissionLevel === 'string' ? record.permissionLevel : null,
    };
  });
}

export async function searchAnalytics(
  token: string,
  input: GoogleSearchConsoleQueryInput,
): Promise<GoogleSearchConsoleRow[]> {
  const res = await googleApiJson<Record<string, unknown>>({
    token,
    method: 'POST',
    path: `${SEARCHCONSOLE_API_BASE}/sites/${encodeURIComponent(input.siteUrl)}/searchAnalytics/query`,
    body: {
      startDate: input.startDate,
      endDate: input.endDate,
      dimensions: input.dimensions ?? ['query'],
      rowLimit: Math.min(Math.max(1, input.rowLimit ?? 25), 100),
    },
  });
  const rows = Array.isArray(res.rows) ? res.rows : [];
  return rows.map((row) => {
    const record = asGoogleRecord(row);
    const keys = Array.isArray(record.keys) ? record.keys.map(String) : [];
    return {
      keys,
      clicks: numberOrNull(record.clicks),
      impressions: numberOrNull(record.impressions),
      ctr: numberOrNull(record.ctr),
      position: numberOrNull(record.position),
    };
  });
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
