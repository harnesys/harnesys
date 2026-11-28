import { z } from 'zod';

export const UpdateThreadIssueBodySchema = z.object({
  issueId: z.string().uuid().nullable(),
});
export type UpdateThreadIssueBody = z.infer<typeof UpdateThreadIssueBodySchema>;
