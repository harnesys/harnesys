import { z } from 'zod';

export const AddonFamilySchema = z.enum([
  'tool',
  'context',
  'content',
  'hook',
  'mcp',
  'lsp',
  'trigger',
  'route',
  'worker',
  'view',
  'config',
]);
export type AddonFamily = z.infer<typeof AddonFamilySchema>;

export const AddonStateSchema = z.enum(['discovered', 'installed', 'enabled']);
export type AddonState = z.infer<typeof AddonStateSchema>;

export const AddonExecutionSchema = z.enum(['process', 'in-process']);
export type AddonExecution = z.infer<typeof AddonExecutionSchema>;

export const AddonContributionSchema = z.object({
  id: z.string().min(1),
  family: AddonFamilySchema,
  descriptor: z.record(z.string(), z.unknown()).default({}),
});
export type AddonContribution = z.infer<typeof AddonContributionSchema>;

export const AddonSummarySchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  state: AddonStateSchema,
  execution: AddonExecutionSchema,
  title: z.string().min(1),
  description: z.string().default(''),
  icon: z.string().default('puzzle'),
  tags: z.array(z.string()).default([]),
  families: z.array(AddonFamilySchema).default([]),
});
export type AddonSummary = z.infer<typeof AddonSummarySchema>;

export const AddonConfigFieldTypeSchema = z.enum(['string', 'number', 'boolean', 'select']);
export type AddonConfigFieldType = z.infer<typeof AddonConfigFieldTypeSchema>;

export const AddonConfigFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: AddonConfigFieldTypeSchema.default('string'),
  description: z.string().optional(),
  required: z.boolean().default(false),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  options: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).optional(),
});
export type AddonConfigField = z.infer<typeof AddonConfigFieldSchema>;

export const AddonConfigDescriptorSchema = z.object({
  fields: z.array(AddonConfigFieldSchema).min(1),
});
export type AddonConfigDescriptor = z.infer<typeof AddonConfigDescriptorSchema>;

export const AddonConfigValuesSchema = z.record(z.string(), z.unknown());
export type AddonConfigValues = z.infer<typeof AddonConfigValuesSchema>;

export const AddonDetailSchema = AddonSummarySchema.extend({
  entry: z.string().min(1),
  root: z.string().min(1),
  running: z.boolean().default(false),
  contributions: z.array(AddonContributionSchema).default([]),
  config: AddonConfigDescriptorSchema.optional(),
  values: AddonConfigValuesSchema.default({}),
  lastError: z.string().optional(),
});
export type AddonDetail = z.infer<typeof AddonDetailSchema>;

export const EnableAddonResponseSchema = AddonSummarySchema.extend({
  running: z.boolean().default(false),
});
export type EnableAddonResponse = z.infer<typeof EnableAddonResponseSchema>;

export const SetAddonConfigBodySchema = z.object({
  values: AddonConfigValuesSchema,
});
export type SetAddonConfigBody = z.infer<typeof SetAddonConfigBodySchema>;

export const AddonConfigResponseSchema = z.object({
  descriptor: AddonConfigDescriptorSchema.optional(),
  values: AddonConfigValuesSchema.default({}),
});
export type AddonConfigResponse = z.infer<typeof AddonConfigResponseSchema>;

export const AddonLogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
export type AddonLogLevel = z.infer<typeof AddonLogLevelSchema>;

export const AddonLogLineSchema = z.object({
  seq: z.number().int().nonnegative(),
  at: z.string().min(1),
  level: AddonLogLevelSchema,
  message: z.string().min(1),
  fields: z.record(z.string(), z.unknown()).default({}),
});
export type AddonLogLine = z.infer<typeof AddonLogLineSchema>;

export const CallAddonToolBodySchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
});
export type CallAddonToolBody = z.infer<typeof CallAddonToolBodySchema>;

export const CallAddonToolResponseSchema = z.union([
  z.object({ ok: z.literal(true), text: z.string() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type CallAddonToolResponse = z.infer<typeof CallAddonToolResponseSchema>;

export * from './addons-platform.ts';
