import { z } from 'zod';
import { AgentPublicSchema } from './agent.ts';
import { PresetIdSchema } from './presets.ts';

export const CreateTeamBodySchema = z.object({
  presetId: PresetIdSchema,
  name: z.string().trim().min(1).optional(),
  models: z.record(z.string(), z.string().trim().min(1)),
  digestCron: z.string().trim().min(1).optional(),
});
export type CreateTeamBody = z.infer<typeof CreateTeamBodySchema>;

export const CreateTeamResponseSchema = z.object({
  agents: z.array(AgentPublicSchema),
  boardId: z.string().uuid(),
  scheduleId: z.string().uuid().nullable(),
});
export type CreateTeamResponse = z.infer<typeof CreateTeamResponseSchema>;
