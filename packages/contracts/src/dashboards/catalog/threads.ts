import { ListThreadsResponseSchema } from '../../thread.ts';
import { defineCatalogEntry } from './define.ts';

export const threadsCatalogEntry = defineCatalogEntry({
  id: 'threads',
  label: 'Threads',
  description: 'Conversation threads in this org with unread state, active run and last error.',
  method: 'GET',
  path: '/orgs/:orgId/threads',
  response: ListThreadsResponseSchema,
  invalidatedBy: ['desk', 'thread-error'],
});
