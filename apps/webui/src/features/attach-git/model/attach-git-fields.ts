import { z } from 'zod';

export const attachGitFieldsSchema = z.object({
  url: z.string().trim().min(1, 'Repository URL required'),
  name: z.string().trim().optional(),
  branch: z.string().trim().optional(),
  hostId: z.string().trim().optional(),
});

export type AttachGitFieldsInput = z.input<typeof attachGitFieldsSchema>;
export type AttachGitFieldsOutput = z.output<typeof attachGitFieldsSchema>;

export function emptyAttachGitFields(hostId?: string): AttachGitFieldsInput {
  return { url: '', name: '', branch: '', ...(hostId ? { hostId } : {}) };
}
