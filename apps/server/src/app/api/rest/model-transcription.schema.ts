import { z } from 'zod';

export const transcriptionBody = z.object({
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  audioBase64: z.string().min(1),
  mimeType: z.string().trim().min(1).optional(),
});
