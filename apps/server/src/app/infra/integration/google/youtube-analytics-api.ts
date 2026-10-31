import type { GoogleYoutubeAnalyticsQuery, GoogleYoutubeAnalyticsReport } from 'harnesys';
import { asGoogleRecord, googleApiJson } from './google-http.ts';

const ANALYTICS_API_BASE = '/youtube/analytics/v2';
const DEFAULT_MAX_ROWS = 25;
const MAX_ROWS_LIMIT = 100;

export async function queryAnalyticsReport(
  token: string,
  query: GoogleYoutubeAnalyticsQuery,
): Promise<GoogleYoutubeAnalyticsReport> {
  const res = await googleApiJson<Record<string, unknown>>({
    token,
    method: 'GET',
    path: `${ANALYTICS_API_BASE}/reports`,
    query: analyticsQueryParams(query),
  });
  const headers = Array.isArray(res.columnHeaders) ? res.columnHeaders.map(asGoogleRecord) : [];
  const rows = Array.isArray(res.rows) ? res.rows : [];
  return {
    columnHeaders: headers.map((header) => ({
      name: typeof header.name === 'string' ? header.name : '',
      columnType: typeof header.columnType === 'string' ? header.columnType : '',
    })),
    rows: rows
      .filter(Array.isArray)
      .map((row) =>
        row.map((cell) => (typeof cell === 'number' || typeof cell === 'string' ? cell : null)),
      ),
  };
}

function analyticsQueryParams(query: GoogleYoutubeAnalyticsQuery): URLSearchParams {
  const params = new URLSearchParams({
    ids: 'channel==MINE',
    startDate: query.startDate,
    endDate: query.endDate,
    metrics: query.metrics.join(','),
  });
  if (query.dimensions !== undefined && query.dimensions.length > 0) {
    params.set('dimensions', query.dimensions.join(','));
  }
  if (query.filters !== undefined && query.filters !== '') {
    params.set('filters', query.filters);
  }
  params.set(
    'maxResults',
    String(Math.min(Math.max(1, query.maxResults ?? DEFAULT_MAX_ROWS), MAX_ROWS_LIMIT)),
  );
  return params;
}
