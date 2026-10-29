import { z } from 'zod';

export type AddSourceTab = 'folder' | 'git';

export const addSourceFieldsSchema = z
  .object({
    tab: z.enum(['folder', 'git']),
    absolutePath: z.string().trim(),
    url: z.string().trim(),
    name: z.string().trim().optional(),
    branch: z.string().trim().optional(),
    credRef: z.string().trim().optional(),
    hostId: z.string().trim().optional(),
    uiVisibility: z.enum(['org', 'host']),
  })
  .superRefine((values, ctx) => {
    if (values.tab === 'folder' && values.absolutePath.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['absolutePath'], message: 'Folder path required' });
    }
    if (values.tab === 'git' && values.url.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'Repository URL required' });
    }
  });

export type AddSourceFieldsInput = z.input<typeof addSourceFieldsSchema>;
export type AddSourceFieldsOutput = z.output<typeof addSourceFieldsSchema>;

export function emptyAddSourceFields(hostId?: string): AddSourceFieldsInput {
  return {
    tab: 'folder',
    absolutePath: '',
    url: '',
    name: '',
    branch: '',
    credRef: '',
    uiVisibility: 'org',
    ...(hostId ? { hostId } : {}),
  };
}
