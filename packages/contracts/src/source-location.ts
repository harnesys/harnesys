import { z } from 'zod';
import { MaterializationStateSchema } from './source.ts';

export const SourceLocationQuerySchema = z.object({
  hostId: z.string().uuid().optional(),
});
export type SourceLocationQuery = z.infer<typeof SourceLocationQuerySchema>;

export const SourceLocationResponseSchema = z.object({
  absoluteRoot: z.string().min(1),
  state: MaterializationStateSchema,
  revision: z.number().int().nonnegative(),
});
export type SourceLocationResponse = z.infer<typeof SourceLocationResponseSchema>;
