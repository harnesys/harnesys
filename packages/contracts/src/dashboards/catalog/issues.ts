import { ListIssuesQuerySchema, ListIssuesResponseSchema } from '../../issues.ts';
import { defineCatalogEntry } from './define.ts';

export const issuesCatalogEntry = defineCatalogEntry({
  id: 'issues',
  label: 'Issues',
  description: 'Board issues with attachment and comment counts; narrow by board through boardId.',
  method: 'GET',
  path: '/orgs/:orgId/issues',
  query: ListIssuesQuerySchema,
  response: ListIssuesResponseSchema,
  invalidatedBy: ['desk'],
});
