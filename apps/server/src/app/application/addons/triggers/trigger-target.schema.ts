import { z } from 'zod';

export const TriggerTargetSchema = z.object({
  threadId: z.string().uuid(),
  agentId: z.string().uuid(),
  modeId: z.string().trim().min(1).max(48).optional(),
});

export type TriggerTarget = z.infer<typeof TriggerTargetSchema>;
