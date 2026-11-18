import { SourcesListResponseSchema } from '../../source.ts';
import { defineCatalogEntry } from './define.ts';

export const sourcesCatalogEntry = defineCatalogEntry({
  id: 'sources',
  label: 'Sources',
  description: 'Org sources with visibility, git state and host distribution.',
  method: 'GET',
  path: '/orgs/:orgId/sources',
  response: SourcesListResponseSchema,
  invalidatedBy: ['source-change', 'git-summary'],
});
