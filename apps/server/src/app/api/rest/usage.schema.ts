import { z } from 'zod';

export const UsageQuerySchema = z.object({
  groupBy: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  agents: z.string().optional(),
});

export type UsageQuery = z.infer<typeof UsageQuerySchema>;

export const PriceOverrideBodySchema = z.object({
  modelId: z.string().trim().min(1),
  inputPer1M: z.number().nonnegative(),
  outputPer1M: z.number().nonnegative(),
});

export type PriceOverrideBody = z.infer<typeof PriceOverrideBodySchema>;

export const UsageRunsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().optional(),
});

export type UsageRunsQuery = z.infer<typeof UsageRunsQuerySchema>;
