import { z } from 'zod';
import { OrgIdSchema } from './org-machine.ts';

export const PermissionGrantPublicSchema = z.object({
  id: z.string().uuid(),
  orgId: OrgIdSchema,
  agentId: z.string().uuid(),
  operation: z.string().min(1),
  decidedBy: z.string().nullable(),
  createdAt: z.string().min(1),
});
export type PermissionGrantPublic = z.infer<typeof PermissionGrantPublicSchema>;

export const ListPermissionGrantsResponseSchema = z.object({
  items: z.array(PermissionGrantPublicSchema),
});
export type ListPermissionGrantsResponse = z.infer<typeof ListPermissionGrantsResponseSchema>;

export const ListPermissionGrantsQuerySchema = z.object({
  agentId: z.string().uuid().optional(),
});
export type ListPermissionGrantsQuery = z.infer<typeof ListPermissionGrantsQuerySchema>;
