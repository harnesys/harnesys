import { z } from 'zod';
import { defineCatalogEntry } from './define.ts';

/** `MemberView` returned by `GET /orgs/:orgId/members`, mirrored as a schema. */
export const MemberSchema = z.object({
  userId: z.string(),
  login: z.string(),
  name: z.string(),
  capabilities: z.array(z.string()),
  updatedAt: z.string(),
});
export type Member = z.infer<typeof MemberSchema>;

export const membersCatalogEntry = defineCatalogEntry({
  id: 'members',
  label: 'Members',
  description: 'Org members with their granted capabilities.',
  method: 'GET',
  path: '/orgs/:orgId/members',
  response: z.array(MemberSchema),
  invalidatedBy: [],
});
