import { z } from 'zod';
import type { FieldSpec } from './field-spec.ts';
import { FieldSpecSchema } from './field-spec.ts';

export const CONFIG_SCHEMA_VERSION = 1;

export interface ConfigDescriptor {
  fields: FieldSpec[];
}

export const ConfigDescriptorSchema = z.object({
  fields: z.array(FieldSpecSchema),
});

export const configFamily = {
  family: 'config',
  versions: [CONFIG_SCHEMA_VERSION],
  schema: (v: number): z.ZodType => {
    if (v !== CONFIG_SCHEMA_VERSION) {
      throw new Error(`config descriptor schema version ${v} is not supported`);
    }
    return ConfigDescriptorSchema;
  },
};
