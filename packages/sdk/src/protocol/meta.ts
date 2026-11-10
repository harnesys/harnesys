import { z } from 'zod';

export interface CallMeta {
  correlationId: string;
  deadline: number;
  principal: { type: 'agent' | 'user' | 'system'; id?: string };
  agentId?: string;
  threadId?: string;
  runId?: string;
  locale: string;
}

export const CallMetaSchema = z.object({
  correlationId: z.string().min(1),
  deadline: z.number(),
  principal: z.object({
    type: z.enum(['agent', 'user', 'system']),
    id: z.string().optional(),
  }),
  agentId: z.string().optional(),
  threadId: z.string().optional(),
  runId: z.string().optional(),
  locale: z.string().min(1),
});
