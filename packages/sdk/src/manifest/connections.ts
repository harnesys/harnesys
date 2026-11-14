import { z } from 'zod';
import type { L10n } from './l10n.ts';
import { L10nSchema } from './l10n.ts';

export interface ConnectionRequirement {
  id: string;
  label: L10n;
  accountKinds: string[];
  scopes?: string[];
  cardinality: 'one' | 'many';
  optional?: boolean;
}

export const ConnectionRequirementSchema = z.object({
  id: z.string().min(1),
  label: L10nSchema,
  accountKinds: z.array(z.string().min(1)).min(1),
  scopes: z.array(z.string().min(1)).optional(),
  cardinality: z.enum(['one', 'many']),
  optional: z.boolean().optional(),
});
