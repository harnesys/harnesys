import { z } from 'zod';
import { OrgIdSchema } from './org-machine.ts';

export const FileRuleActionSchema = z.enum(['read', 'edit']);
export type FileRuleAction = z.infer<typeof FileRuleActionSchema>;

export const FileRuleEffectSchema = z.enum(['allow', 'deny']);
export type FileRuleEffect = z.infer<typeof FileRuleEffectSchema>;

export const FileRulePublicSchema = z.object({
  id: z.string().uuid(),
  orgId: OrgIdSchema,
  agentId: z.string().uuid().nullable(),
  hostId: z.string().uuid().nullable(),
  pathPattern: z.string().min(1),
  action: FileRuleActionSchema,
  effect: FileRuleEffectSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type FileRulePublic = z.infer<typeof FileRulePublicSchema>;

export const CreateFileRuleBodySchema = z.object({
  agentId: z.string().uuid().nullable().optional(),
  hostId: z.string().uuid().nullable().optional(),
  pathPattern: z.string().trim().min(1),
  action: FileRuleActionSchema,
  effect: FileRuleEffectSchema,
});
export type CreateFileRuleBody = z.infer<typeof CreateFileRuleBodySchema>;

export const ListFileRulesResponseSchema = z.object({
  items: z.array(FileRulePublicSchema),
});
export type ListFileRulesResponse = z.infer<typeof ListFileRulesResponseSchema>;
