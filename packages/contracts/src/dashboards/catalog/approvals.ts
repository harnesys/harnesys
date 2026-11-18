import { ListApprovalsQuerySchema, ListApprovalsResponseSchema } from '../../approvals.ts';
import { defineCatalogEntry } from './define.ts';

export const approvalsCatalogEntry = defineCatalogEntry({
  id: 'approvals',
  label: 'Approvals',
  description: 'HITL approval queue with pending decisions and their context.',
  method: 'GET',
  path: '/orgs/:orgId/approvals',
  query: ListApprovalsQuerySchema,
  response: ListApprovalsResponseSchema,
  invalidatedBy: ['approval'],
});
