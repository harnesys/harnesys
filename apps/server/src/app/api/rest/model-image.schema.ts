import { z } from 'zod';

export const generateImageBody = z.object({
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  size: z.string().trim().optional(),
});
