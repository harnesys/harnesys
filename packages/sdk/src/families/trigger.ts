import { z } from 'zod';
import type { L10n } from '../manifest/l10n.ts';
import { L10nSchema } from '../manifest/l10n.ts';
import type { FieldSpec } from './field-spec.ts';
import { FieldSpecSchema } from './field-spec.ts';

export const TRIGGER_SCHEMA_VERSION = 1;

export interface TriggerLimits {
  perDay?: number;
  throttleSec?: number;
  maxBurst?: number;
}

/**
 * Overrides for the standard trigger-form blocks the host renders for every
 * trigger (name + agent, wake thread, run mode, instructions). Developers get
 * them out of the box; each block can be relabeled or disabled.
 */
export interface StandardFieldOverride {
  disabled?: boolean;
  label?: string;
  help?: string;
  required?: boolean;
}

export interface TriggerStandardBlocks {
  name?: StandardFieldOverride;
  agent?: StandardFieldOverride;
  target?: StandardFieldOverride;
  mode?: StandardFieldOverride;
  instructions?: StandardFieldOverride;
}

export const StandardFieldOverrideSchema = z.object({
  disabled: z.boolean().optional(),
  label: z.string().optional(),
  help: z.string().optional(),
  required: z.boolean().optional(),
});

export interface TriggerDescriptor {
  kind: string;
  title: L10n;
  description: L10n;
  configFields: FieldSpec[];
  connection?: string;
  limits?: TriggerLimits;
  standard?: TriggerStandardBlocks;
}

export const TriggerDescriptorSchema = z.object({
  kind: z.string().min(1),
  title: L10nSchema,
  description: L10nSchema,
  configFields: z.array(FieldSpecSchema),
  connection: z.string().min(1).optional(),
  limits: z
    .object({
      perDay: z.number().int().positive().optional(),
      throttleSec: z.number().int().nonnegative().optional(),
      maxBurst: z.number().int().positive().optional(),
    })
    .optional(),
  standard: z
    .object({
      name: StandardFieldOverrideSchema.optional(),
      agent: StandardFieldOverrideSchema.optional(),
      target: StandardFieldOverrideSchema.optional(),
      mode: StandardFieldOverrideSchema.optional(),
      instructions: StandardFieldOverrideSchema.optional(),
    })
    .optional(),
});

export const triggerFamily = {
  family: 'trigger',
  versions: [TRIGGER_SCHEMA_VERSION],
  schema: (v: number): z.ZodType => {
    if (v !== TRIGGER_SCHEMA_VERSION) {
      throw new Error(`trigger descriptor schema version ${v} is not supported`);
    }
    return TriggerDescriptorSchema;
  },
};
