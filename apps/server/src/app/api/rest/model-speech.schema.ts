import { z } from 'zod';

export const speechBody = z.object({
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  text: z.string().min(1),
  voice: z.string().trim().min(1).optional(),
});
