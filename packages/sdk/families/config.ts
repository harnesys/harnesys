import { z } from 'zod';

export const ConfigFieldTypeSchema = z.enum(['string', 'number', 'boolean', 'select']);
export type ConfigFieldType = z.infer<typeof ConfigFieldTypeSchema>;

export const ConfigFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: ConfigFieldTypeSchema.default('string'),
  description: z.string().optional(),
  required: z.boolean().default(false),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  options: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).optional(),
});
export type ConfigField = z.infer<typeof ConfigFieldSchema>;

export const ConfigDescriptorSchema = z.object({
  fields: z.array(ConfigFieldSchema).min(1),
});
export type ConfigDescriptor = z.infer<typeof ConfigDescriptorSchema>;

export function defaultConfigValues(fields: readonly ConfigField[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.default !== undefined) {
      values[field.key] = field.default;
    } else if (field.type === 'boolean') {
      values[field.key] = false;
    } else if (field.type === 'number') {
      values[field.key] = 0;
    } else if (field.type === 'select') {
      values[field.key] = field.options?.[0]?.value ?? '';
    } else {
      values[field.key] = '';
    }
  }
  return values;
}

export interface ConfigContribution {
  readonly id: string;
  readonly config: ConfigDescriptor;
}
