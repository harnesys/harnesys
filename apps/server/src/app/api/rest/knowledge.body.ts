import { z } from 'zod';

export const upsertKnowledgeRootBody = z.object({
  path: z.string().trim().min(1),
  enabled: z.boolean().optional(),
});

export const putKnowledgeSettingsBody = z
  .object({
    entireSource: z.boolean().optional(),
    backend: z.enum(['fts', 'vector']).optional(),
    embedProvider: z.string().trim().min(1).nullable().optional(),
    embedModel: z.string().trim().min(1).nullable().optional(),
    watchEnabled: z.boolean().optional(),
  })
  .superRefine((body, ctx) => {
    const provider = body.embedProvider;
    const model = body.embedModel;
    if (provider === undefined && model === undefined) {
      return;
    }
    const providerSet = provider != null;
    const modelSet = model != null;
    if (providerSet !== modelSet) {
      ctx.addIssue({
        code: 'custom',
        path: ['embedModel'],
        message: 'embedProvider and embedModel must both be set or both be null',
      });
    }
  });

export const listKnowledgeFilesQuery = z.object({
  status: z.enum(['pending', 'indexed', 'skipped', 'error']).optional(),
});

export const searchKnowledgeQuery = z.object({
  query: z.string().trim().min(1),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
