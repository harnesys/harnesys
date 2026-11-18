import { ListAutomationsResponseSchema } from '../../automations.ts';
import { defineCatalogEntry } from './define.ts';

export const automationsCatalogEntry = defineCatalogEntry({
  id: 'automations',
  label: 'Automations',
  description: 'Scheduled and trigger-based automations with status and connection state.',
  method: 'GET',
  path: '/orgs/:orgId/automations',
  response: ListAutomationsResponseSchema,
  invalidatedBy: ['automations-changed'],
});
