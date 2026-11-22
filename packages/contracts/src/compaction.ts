import { z } from 'zod';

const MIN_CUT_TOKENS = 1024;
const MAX_CONTEXT_TOKENS = 2_000_000;

const SummaryModelSchema = z
  .object({
    provider: z.string(),
    model: z.string(),
  })
  .passthrough();

export const CompactionSpecSchema = z
  .object({
    maxContextTokens: z.number().int().positive().max(MAX_CONTEXT_TOKENS).optional(),
    protectTokens: z.number().int().positive().optional(),
    thresholdRatio: z.number().min(0.1).max(1).optional(),
    outputReserveRatio: z.number().min(0).max(0.9).optional(),
    protectRecentRatio: z.number().min(0).max(0.9).optional(),
    protectRecentTurns: z.number().int().min(0).optional(),
    auto: z.boolean().optional(),
    preCompactNote: z.boolean().optional(),
    overflowCompaction: z.boolean().optional(),
    microcompact: z.boolean().optional(),
    microcompactKeepRounds: z.number().int().min(0).optional(),
    microcompactStepRounds: z.number().int().min(0).optional(),
    microcompactMinGainTokens: z.number().int().min(0).optional(),
    compactionFailureLimit: z.number().int().min(0).optional(),
    compactionRapidRefillSteps: z.number().int().min(0).optional(),
    preThresholdGapRatio: z.number().min(0).max(0.9).optional(),
    rapidRefillMaxCompactions: z.number().int().min(0).optional(),
    summaryModel: SummaryModelSchema.optional(),
  })
  .superRefine((spec, ctx) => {
    const { maxContextTokens, protectTokens } = spec;
    if (maxContextTokens === undefined || protectTokens === undefined) {
      return;
    }
    if (protectTokens >= maxContextTokens) {
      ctx.addIssue({
        code: 'custom',
        path: ['protectTokens'],
        message: `protectTokens (${protectTokens}) must stay below maxContextTokens (${maxContextTokens})`,
      });
      return;
    }
    if (protectTokens >= maxContextTokens - MIN_CUT_TOKENS) {
      ctx.addIssue({
        code: 'custom',
        path: ['protectTokens'],
        message:
          `protectTokens (${protectTokens}) leaves no room to cut below ` +
          `maxContextTokens (${maxContextTokens}); keep at least ${MIN_CUT_TOKENS} tokens free`,
      });
    }
  });
export type CompactionSpec = z.infer<typeof CompactionSpecSchema>;

export const CompactionConfigSchema = z
  .object({
    name: z.string().optional(),
    spec: CompactionSpecSchema.optional(),
  })
  .passthrough();
export type CompactionConfig = z.infer<typeof CompactionConfigSchema>;
