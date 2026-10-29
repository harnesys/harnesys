import { z } from 'zod';
import { AgentHooksSchema } from './agent-hooks.ts';
import { LOCAL_EXECUTION_PROFILE_ID } from './execution-profile.ts';
import { OrgIdSchema } from './org-machine.ts';
import { PresetIdSchema } from './preset-id.ts';

export const AgentLevelSchema = z.enum(['top', 'delegate']);
export type AgentLevel = z.infer<typeof AgentLevelSchema>;

export const AgentStatusSchema = z.enum(['active', 'archived']);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentSourceLevelSchema = z.enum(['read', 'edit']);
export type AgentSourceLevel = z.infer<typeof AgentSourceLevelSchema>;

export const AgentPublicSchema = z.object({
  id: z.string().uuid(),
  orgId: OrgIdSchema,
  name: z.string().min(1),
  role: z.string().min(1),
  instructions: z.string(),
  modelId: z.string().min(1),
  budgetUsdDaily: z.number().nullable(),
  level: AgentLevelSchema,
  parentId: z.string().uuid().nullable(),
  executionProfileId: z.string().uuid().or(z.literal(LOCAL_EXECUTION_PROFILE_ID)).nullable(),
  status: AgentStatusSchema,
  sharedSourceIds: z.array(z.string()).default([]),
  sourceLevels: z.record(z.string(), AgentSourceLevelSchema).optional(),
  secretNames: z.array(z.string()).default([]),
  skills: z.array(z.string()),
  mcpServers: z.array(z.string()),
  enabledPlugins: z.record(z.string(), z.boolean()),
  defaultModeId: z.string().nullable(),
  config: z.record(z.string(), z.unknown()).optional(),
  hooks: AgentHooksSchema.default([]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type AgentPublic = z.infer<typeof AgentPublicSchema>;

export const CreateAgentBodySchema = z.object({
  name: z.string().trim().min(1),
  role: z.string().trim().min(1).default('Operator'),
  instructions: z.string().default(''),
  modelId: z.string().trim().min(1),
  budgetUsdDaily: z.number().nullable().optional(),
  level: AgentLevelSchema.optional(),
  parentId: z.string().uuid().nullable().optional(),
  executionProfileId: z
    .string()
    .uuid()
    .or(z.literal(LOCAL_EXECUTION_PROFILE_ID))
    .nullable()
    .optional(),
  status: AgentStatusSchema.optional(),
  sharedSourceIds: z.array(z.string()).optional(),
  sourceLevels: z.record(z.string(), AgentSourceLevelSchema).optional(),
  secretNames: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  mcpServers: z.array(z.string()).optional(),
  enabledPlugins: z.record(z.string(), z.boolean()).optional(),
  defaultModeId: z.string().nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  hooks: AgentHooksSchema.optional(),
});
export type CreateAgentBody = z.infer<typeof CreateAgentBodySchema>;

export const UpdateAgentBodySchema = CreateAgentBodySchema.partial().extend({
  role: z.string().trim().min(1).optional(),
  instructions: z.string().optional(),
});
export type UpdateAgentBody = z.infer<typeof UpdateAgentBodySchema>;

export const AgentPresetBudgetSchema = z
  .object({
    maxSteps: z.number().int().positive().optional(),
    maxTokens: z.number().int().positive().optional(),
    deadlineMs: z.number().int().positive().optional(),
    policy: z.enum(['ask', 'error']).optional(),
  })
  .optional();

export const ListAgentsResponseSchema = z.object({
  items: z.array(AgentPublicSchema),
});
export type ListAgentsResponse = z.infer<typeof ListAgentsResponseSchema>;

export const CreateAgentFromPresetBodySchema = z.object({
  presetId: PresetIdSchema,
  name: z.string().trim().min(1).optional(),
  modelId: z.string().trim().min(1).optional(),
  parentId: z.string().uuid().nullable().optional(),
});
export type CreateAgentFromPresetBody = z.infer<typeof CreateAgentFromPresetBodySchema>;
