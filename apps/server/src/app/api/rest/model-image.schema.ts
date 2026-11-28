import { z } from 'zod';

export const generateImageBody = z.object({
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  size: z.string().trim().optional(),
  negativePrompt: z.string().trim().min(1).optional(),
  seed: z.number().int().min(0).max(2147483647).optional(),
});
