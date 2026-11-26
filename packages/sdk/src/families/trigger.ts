import { z } from 'zod';
import { HexColorSchema, LucideIconNameSchema } from '../manifest/branding.ts';
import type { L10n } from '../manifest/l10n.ts';
import { L10nSchema } from '../manifest/l10n.ts';
import type { FieldSpec } from './field-spec.ts';
import { FieldSpecSchema } from './field-spec.ts';
import type { JsonSchemaSubset } from './json-schema.ts';
import { JsonSchemaSubsetSchema } from './json-schema.ts';

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
  /** Pre/post script block. Shown by default; the same values are writable through the target. */
  scripts?: StandardFieldOverride;
}

export const StandardFieldOverrideSchema = z.object({
  disabled: z.boolean().optional(),
  label: z.string().optional(),
  help: z.string().optional(),
  required: z.boolean().optional(),
});

export interface TriggerActionDescriptor {
  /** Lowercase action id, e.g. `status`, `test`, `rotate_secret`. */
  id: string;
  title: L10n;
  description?: L10n;
  /** JSON Schema subset for the action input; the host validates before the call. */
  inputSchema?: JsonSchemaSubset;
}

export const TriggerActionDescriptorSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, 'action id must match ^[a-z][a-z0-9_]*$')
    .max(64),
  title: L10nSchema,
  description: L10nSchema.optional(),
  inputSchema: JsonSchemaSubsetSchema.optional(),
});

export interface TriggerDescriptor {
  kind: string;
  title: L10n;
  description: L10n;
  /** Lucide icon name shown on trigger cards (picker, lists). */
  icon?: string;
  /** Brand color as `#RRGGBB`; falls back to the addon manifest color. */
  color?: string;
  configFields: FieldSpec[];
  connection?: string;
  limits?: TriggerLimits;
  standard?: TriggerStandardBlocks;
  /** Add-on operations exposed to agents through the generic automations pack. */
  actions?: TriggerActionDescriptor[];
}

export const TriggerDescriptorSchema = z.object({
  kind: z.string().min(1),
  title: L10nSchema,
  description: L10nSchema,
  icon: LucideIconNameSchema.optional(),
  color: HexColorSchema.optional(),
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
      scripts: StandardFieldOverrideSchema.optional(),
    })
    .optional(),
  actions: z.array(TriggerActionDescriptorSchema).optional(),
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
