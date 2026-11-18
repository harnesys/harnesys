import { UsageQuerySchema, UsageReportSchema } from '../../usage.ts';
import { defineCatalogEntry } from './define.ts';

export const usageCatalogEntry = defineCatalogEntry({
  id: 'usage',
  label: 'Usage',
  description: 'Token and cost report grouped by day or agent, with per-member totals.',
  method: 'GET',
  path: '/orgs/:orgId/usage',
  query: UsageQuerySchema,
  response: UsageReportSchema,
  invalidatedBy: [],
});
