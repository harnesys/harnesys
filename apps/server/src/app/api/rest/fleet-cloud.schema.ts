import { z } from 'zod';

export const CloudSourceSyncGrantBodySchema = z.object({
  sourceId: z.string().min(1),
});

export type CloudSourceSyncGrantBody = z.infer<typeof CloudSourceSyncGrantBodySchema>;

export const CloudSourceSyncCompleteBodySchema = CloudSourceSyncGrantBodySchema.extend({
  operationId: z.string().uuid(),
});

export type CloudSourceSyncCompleteBody = z.infer<typeof CloudSourceSyncCompleteBodySchema>;
