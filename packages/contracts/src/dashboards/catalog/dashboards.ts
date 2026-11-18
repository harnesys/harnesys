import { DashboardListResponseSchema } from '../doc.ts';
import { defineCatalogEntry } from './define.ts';

export const dashboardsCatalogEntry = defineCatalogEntry({
  id: 'dashboards',
  label: 'Dashboards',
  description: 'Dashboards in this org with their widget counts.',
  method: 'GET',
  path: '/orgs/:orgId/dashboards',
  response: DashboardListResponseSchema,
  invalidatedBy: ['dashboards.changed'],
});
