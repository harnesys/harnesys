import { z } from 'zod';

export const installSkillStepSchema = z.object({
  url: z.string().trim().min(3, 'Repository URL is required'),
  ref: z.string().trim().max(128, 'Ref is too long'),
});

export type InstallSkillStepValues = z.infer<typeof installSkillStepSchema>;

export function emptyInstallSkillStep(): InstallSkillStepValues {
  return { url: '', ref: '' };
}

export function toDiscoverBody(values: InstallSkillStepValues): {
  url: string;
  ref?: string;
} {
  return values.ref ? { url: values.url, ref: values.ref } : { url: values.url };
}
