import { ListAgentsResponseSchema } from '../../agent.ts';
import { defineCatalogEntry } from './define.ts';

export const agentsCatalogEntry = defineCatalogEntry({
  id: 'agents',
  label: 'Agents',
  description: 'Installed agents with model, role and instructions.',
  method: 'GET',
  path: '/orgs/:orgId/agents',
  response: ListAgentsResponseSchema,
  invalidatedBy: ['desk'],
});
