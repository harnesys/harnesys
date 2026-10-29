import { z } from 'zod';

export const voicesQuery = z.object({
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
});
