import { z } from 'zod';

export const GitIdentityBodySchema = z.object({
  userName: z.string().min(1).max(200),
  userEmail: z.string().email().max(200),
});
export type GitIdentityBody = z.infer<typeof GitIdentityBodySchema>;
