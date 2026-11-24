import { z } from 'zod';

export const OrgAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  action: z.string().min(1).optional(),
  actorKind: z.string().min(1).optional(),
  result: z.string().min(1).optional(),
  actorId: z.string().min(1).optional(),
  q: z.string().min(1).optional(),
});
export type OrgAuditQuery = z.infer<typeof OrgAuditQuerySchema>;
