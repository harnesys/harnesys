import { z } from 'zod';

export {
  type UsageQuery,
  UsageQuerySchema,
  type UsageRunsQuery,
  UsageRunsQuerySchema,
} from '@harnesys/contracts';

export const PriceOverrideBodySchema = z.object({
  modelId: z.string().trim().min(1),
  inputPer1M: z.number().nonnegative(),
  outputPer1M: z.number().nonnegative(),
});

export type PriceOverrideBody = z.infer<typeof PriceOverrideBodySchema>;
