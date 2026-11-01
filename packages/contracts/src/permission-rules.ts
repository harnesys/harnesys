import { z } from 'zod';
import { OrgIdSchema } from './org-machine.ts';

export const PermissionRuleKindSchema = z.enum(['fs-path', 'shell-cmd', 'op', 'ssh-host']);
export type PermissionRuleKind = z.infer<typeof PermissionRuleKindSchema>;

export const PermissionRuleEffectSchema = z.enum(['allow', 'deny']);
export type PermissionRuleEffect = z.infer<typeof PermissionRuleEffectSchema>;

export const PermissionRulePublicSchema = z.object({
  id: z.string().uuid(),
  orgId: OrgIdSchema,
  agentId: z.string().uuid().nullable(),
  hostId: z.string().uuid().nullable(),
  kind: PermissionRuleKindSchema,
  pattern: z.string().min(1),
  action: z.enum(['read', 'edit']).nullable(),
  effect: PermissionRuleEffectSchema,
  decidedBy: z.string().nullable(),
  createdAt: z.string().min(1),
});
export type PermissionRulePublic = z.infer<typeof PermissionRulePublicSchema>;

export const ListPermissionRulesQuerySchema = z.object({
  agentId: z.string().uuid().optional(),
  kind: PermissionRuleKindSchema.optional(),
});
export type ListPermissionRulesQuery = z.infer<typeof ListPermissionRulesQuerySchema>;

export const ListPermissionRulesResponseSchema = z.object({
  items: z.array(PermissionRulePublicSchema),
});
export type ListPermissionRulesResponse = z.infer<typeof ListPermissionRulesResponseSchema>;

export const CreatePermissionRuleBodySchema = z.object({
  agentId: z.string().uuid().nullable().optional(),
  hostId: z.string().uuid().nullable().optional(),
  kind: z.enum(['fs-path', 'shell-cmd']),
  pattern: z.string().trim().min(1),
  action: z.enum(['read', 'edit']).optional(),
  effect: PermissionRuleEffectSchema,
});
export type CreatePermissionRuleBody = z.infer<typeof CreatePermissionRuleBodySchema>;
