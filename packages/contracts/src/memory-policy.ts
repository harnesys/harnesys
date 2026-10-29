import { z } from 'zod';

export const MemoryPolicySchema = z
  .object({
    read: z.boolean().optional(),
    consolidate: z.boolean().optional(),
    reflect: z.boolean().optional(),
    enforce: z.boolean().optional(),
    promote: z.boolean().optional(),
    minSteps: z.number().int().min(0).max(1000).optional(),
    maxNudges: z.number().int().min(0).max(10).optional(),
    reflectInterval: z.number().int().min(1).max(720).optional(),
    decayHalfLifeDays: z.number().int().min(1).max(3650).optional(),
    promoteThreshold: z.number().int().min(0).max(10).optional(),
    consolidateModelId: z.string().optional(),
    projectLimit: z.number().int().min(1).max(100).optional(),
    projectBudgetTokens: z.number().int().min(100).max(8000).optional(),
    pinBudgetTokens: z.number().int().min(100).max(8000).optional(),
    relevanceTopK: z.number().int().min(1).max(50).optional(),
    relevanceMinChars: z.number().int().min(0).max(1000).optional(),
    factClipChars: z.number().int().min(40).max(2000).optional(),
  })
  .strict();
export type MemoryPolicy = z.infer<typeof MemoryPolicySchema>;

export const DEFAULT_MEMORY_POLICY = {
  read: true,
  consolidate: true,
  reflect: false,
  enforce: false,
  promote: false,
  minSteps: 3,
  maxNudges: 1,
  reflectInterval: 24,
  decayHalfLifeDays: 30,
  promoteThreshold: 8,
  projectLimit: 20,
  projectBudgetTokens: 800,
  pinBudgetTokens: 1500,
  relevanceTopK: 8,
  relevanceMinChars: 24,
  factClipChars: 200,
} satisfies MemoryPolicy;

export function parseMemoryPolicy(value: unknown): MemoryPolicy | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const result = MemoryPolicySchema.safeParse(value);
  if (!result.success) {
    return undefined;
  }
  return { ...DEFAULT_MEMORY_POLICY, ...result.data };
}
