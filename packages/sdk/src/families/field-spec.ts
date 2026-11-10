import { z } from 'zod';

export type FieldType = 'text' | 'secret' | 'textarea' | 'url' | 'select' | 'number' | 'boolean';

export type FieldValue = string | number | boolean | null;

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  help?: string;
  default?: FieldValue;
  options?: FieldOption[];
  pattern?: { regex: string; hint: string };
  editable?: boolean;
  generated?: boolean;
}

export const FieldTypeSchema = z.enum([
  'text',
  'secret',
  'textarea',
  'url',
  'select',
  'number',
  'boolean',
]);

export const FieldValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const FieldOptionSchema = z.object({ value: z.string(), label: z.string() });

export const FieldSpecSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: FieldTypeSchema,
  required: z.boolean(),
  placeholder: z.string().optional(),
  help: z.string().optional(),
  default: FieldValueSchema.optional(),
  options: z.array(FieldOptionSchema).optional(),
  pattern: z.object({ regex: z.string(), hint: z.string() }).optional(),
  editable: z.boolean().optional(),
  generated: z.boolean().optional(),
});

export function defaultConfigValues(fields: FieldSpec[]): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  for (const field of fields) {
    if (field.default !== undefined) {
      values[field.key] = field.default;
    }
  }
  return values;
}
