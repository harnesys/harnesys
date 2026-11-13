import { z } from 'zod';

export type FieldType =
  | 'text'
  | 'secret'
  | 'textarea'
  | 'url'
  | 'select'
  | 'number'
  | 'boolean'
  | 'group';

export type FieldValue = string | number | boolean | null;

export interface FieldOption {
  value: string;
  label: string;
  /** Hint shown for the currently selected option. */
  help?: string;
}

/** Conditional visibility: show the field only when `values[key]` matches. */
export interface FieldVisibleWhen {
  key: string;
  equals?: string;
  oneOf?: string[];
}

/** Rich editor registered on the client; unknown kinds fall back to the base type. */
export interface FieldWidget {
  kind: string;
  params?: Record<string, string | number | boolean>;
}

/**
 * Declarative option source resolved by the host: an add-on-owned GET route
 * or the add-on's connected accounts. No per-provider client code.
 */
export type FieldOptionsFrom =
  | {
      /** Route id served under `/orgs/:orgId/addons/:addonId/r/<route>`. */
      kind: 'addonRoute';
      route: string;
      /** Field keys passed to the route as query params. */
      dependsOn?: string[];
      /** Response body key holding the rows. Defaults to `rows`. */
      listKey?: string;
      /** Row field used as the option value. */
      valueKey: string;
      /** Row field used as the option label. Defaults to `valueKey`. */
      labelKey?: string;
    }
  | { kind: 'connections' };

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  help?: string;
  default?: FieldValue;
  options?: FieldOption[];
  /** Option-valued field accepting several values, stored as one comma-separated string. */
  multi?: boolean;
  /** Options resolved by the host at render time; static `options` stay the fallback. */
  optionsFrom?: FieldOptionsFrom;
  pattern?: { regex: string; hint: string };
  editable?: boolean;
  generated?: boolean;
  /** Children of a `group` field. */
  fields?: FieldSpec[];
  visibleWhen?: FieldVisibleWhen;
  widget?: FieldWidget;
  /** `group` only: render collapsed by default. */
  collapsible?: boolean;
  /** `group` only: an expert section, rendered after the main fields. */
  advanced?: boolean;
  /** `group` only: grid columns for children. */
  columns?: number;
}

export const FieldTypeSchema = z.enum([
  'text',
  'secret',
  'textarea',
  'url',
  'select',
  'number',
  'boolean',
  'group',
]);

export const FieldValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const FieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  help: z.string().optional(),
});

export const FieldVisibleWhenSchema = z.object({
  key: z.string().min(1),
  equals: z.string().optional(),
  oneOf: z.array(z.string()).optional(),
});

export const FieldWidgetSchema = z.object({
  kind: z.string().min(1),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const FieldOptionsFromSchema: z.ZodType<FieldOptionsFrom> = z.union([
  z.object({
    kind: z.literal('addonRoute'),
    route: z.string().min(1),
    dependsOn: z.array(z.string().min(1)).optional(),
    listKey: z.string().min(1).optional(),
    valueKey: z.string().min(1),
    labelKey: z.string().min(1).optional(),
  }),
  z.object({ kind: z.literal('connections') }),
]);

export const FieldSpecSchema: z.ZodType<FieldSpec> = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: FieldTypeSchema,
  required: z.boolean(),
  placeholder: z.string().optional(),
  help: z.string().optional(),
  default: FieldValueSchema.optional(),
  options: z.array(FieldOptionSchema).optional(),
  multi: z.boolean().optional(),
  optionsFrom: FieldOptionsFromSchema.optional(),
  pattern: z.object({ regex: z.string(), hint: z.string() }).optional(),
  editable: z.boolean().optional(),
  generated: z.boolean().optional(),
  fields: z.lazy(() => z.array(FieldSpecSchema)).optional(),
  visibleWhen: FieldVisibleWhenSchema.optional(),
  widget: FieldWidgetSchema.optional(),
  collapsible: z.boolean().optional(),
  advanced: z.boolean().optional(),
  columns: z.number().int().min(1).max(4).optional(),
});

export function fieldVisible(field: FieldSpec, values: Record<string, unknown>): boolean {
  const condition = field.visibleWhen;
  if (!condition) {
    return true;
  }
  const actual = values[condition.key];
  if (actual === undefined || actual === null) {
    return false;
  }
  if (condition.equals !== undefined) {
    return String(actual) === condition.equals;
  }
  if (condition.oneOf) {
    return condition.oneOf.includes(String(actual));
  }
  return true;
}

export function defaultConfigValues(fields: FieldSpec[]): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  for (const field of fields) {
    if (field.default !== undefined) {
      values[field.key] = field.default;
    }
  }
  return values;
}
