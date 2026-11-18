import { UsageRunsQuerySchema, UsageRunsReportSchema } from '../../usage.ts';
import { defineCatalogEntry } from './define.ts';

export const usageRunsCatalogEntry = defineCatalogEntry({
  id: 'usage-runs',
  label: 'Usage runs',
  description: 'Recent runs with tokens, cost and pricing source.',
  method: 'GET',
  path: '/orgs/:orgId/usage/runs',
  query: UsageRunsQuerySchema,
  response: UsageRunsReportSchema,
  invalidatedBy: [],
});
