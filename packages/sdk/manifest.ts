import { z } from 'zod';

export const AddonExecutionSchema = z.enum(['process', 'in-process']);
export type AddonExecution = z.infer<typeof AddonExecutionSchema>;

export const ContributionFamilySchema = z.enum([
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
export type ContributionFamily = z.infer<typeof ContributionFamilySchema>;

export const ViewContainerSchema = z.enum([
  'sidebar',
  'element-config',
  'settings-window',
  'agent-inspector',
  'file-inspector',
  'workspace',
  'thread-header',
  'inbox',
]);
export type ViewContainer = z.infer<typeof ViewContainerSchema>;

export const ViewKindSchema = z.enum(['section', 'page', 'tab', 'widget', 'field']);
export type ViewKind = z.infer<typeof ViewKindSchema>;

export const ContributionDescriptorSchema = z.object({
  id: z.string().min(1),
  family: ContributionFamilySchema,
  capabilities: z.array(z.string()).default([]),
  descriptor: z.record(z.string(), z.unknown()).default({}),
});
export type ContributionDescriptor = z.infer<typeof ContributionDescriptorSchema>;

export const AddonManifestSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    title: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
    tags: z.array(z.string()).default([]),
    entry: z.string().min(1),
    execution: AddonExecutionSchema.default('process'),
    assets: z.array(z.string()).default([]),
    contributions: z.array(ContributionDescriptorSchema).default([]),
  })
  .strict();
export type AddonManifest = z.infer<typeof AddonManifestSchema>;

export function parseAddonManifest(raw: unknown): AddonManifest {
  return AddonManifestSchema.parse(raw);
}
