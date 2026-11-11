import { type AddonContext, AddonError, type ToolHandler } from '@harnesys/sdk';
import { YOUTUBE_ANALYTICS_API, youtubeJson } from './youtube-client.ts';
import { accountOf, maxResultsOf, optionalTextOf, requiredTextOf } from './youtube-input.ts';
import { splitList } from './youtube-models.ts';

const DEFAULT_ROWS = 50;
const ROWS_MAX = 100;

interface AnalyticsColumnWire {
  name?: string;
  dataType?: string;
}

interface AnalyticsReportWire {
  columnHeaders?: AnalyticsColumnWire[];
  rows?: unknown[][];
}

interface AnalyticsReport {
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

const analyticsReport: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const startDate = requiredTextOf(input, 'startDate');
  const endDate = requiredTextOf(input, 'endDate');
  const metrics = splitList(requiredTextOf(input, 'metrics'));
  if (metrics.length === 0) {
    throw new AddonError('invalid_params', { detail: 'metrics must name at least one metric' });
  }
  const dimensions = optionalTextOf(input, 'dimensions');
  const filters = optionalTextOf(input, 'filters');
  const query = new URLSearchParams({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: metrics.join(','),
    maxResults: String(maxResultsOf(input, DEFAULT_ROWS, ROWS_MAX)),
  });
  if (dimensions !== undefined) {
    query.set('dimensions', splitList(dimensions).join(','));
  }
  if (filters !== undefined) {
    query.set('filters', filters);
  }
  const report = await youtubeJson<AnalyticsReportWire>(ctx, {
    ...accountOf(input),
    url: `${YOUTUBE_ANALYTICS_API}/reports?${query.toString()}`,
  });
  return { report: reportOf(report) } satisfies { report: AnalyticsReport };
};

function reportOf(wire: AnalyticsReportWire): AnalyticsReport {
  const columns = (wire.columnHeaders ?? [])
    .map((column) => column.name)
    .filter((name): name is string => typeof name === 'string' && name !== '');
  const rows = (wire.rows ?? []).map((row) => {
    const record: Record<string, unknown> = {};
    columns.forEach((column, index) => {
      record[column] = row[index] ?? null;
    });
    return record;
  });
  return { columns, rows };
}

export const analyticsTools: Record<string, ToolHandler> = {
  analytics_report: analyticsReport,
};
