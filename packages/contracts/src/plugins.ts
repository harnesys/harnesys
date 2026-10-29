import { z } from 'zod';
import { OrgIdSchema } from './org-machine.ts';

export const GrantClassSchema = z.enum(['content', 'process', 'network']);
export type GrantClass = z.infer<typeof GrantClassSchema>;

export const PluginOptionValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export type PluginOptionValue = z.infer<typeof PluginOptionValueSchema>;

export type PluginGrantSelection = Partial<Record<GrantClass, boolean>>;

export const PluginComponentSummarySchema = z.object({
  kind: z.string().min(1),
  status: z.enum(['native', 'inert', 'blocked_by_grant', 'dropped']),
  inertReason: z.string().optional(),
  source: z.object({
    file: z.string(),
    pointer: z.string(),
  }),
});
export type PluginComponentSummary = z.infer<typeof PluginComponentSummarySchema>;

export const PluginDiagnosticSchema = z.object({
  level: z.enum(['error', 'warning']),
  code: z.string().min(1),
  message: z.string().min(1),
  path: z.string().optional(),
});
export type PluginDiagnostic = z.infer<typeof PluginDiagnosticSchema>;

export const PluginSummarySchema = z.object({
  orgId: OrgIdSchema,
  name: z.string().min(1),
  source: z.string().min(1),
  revision: z.string().min(1),
  path: z.string().min(1),
  dataPath: z.string().min(1),
  format: z.string().min(1),
  grants: z.record(z.string(), z.boolean()),
  options: z.record(z.string(), PluginOptionValueSchema),
  registryId: z.string().optional(),
  catalogPluginName: z.string().optional(),
  installedAt: z.string().min(1),
  updatedAt: z.string().min(1),
  version: z.string().optional(),
  description: z.string().optional(),
  components: z.array(PluginComponentSummarySchema),
  skillCount: z.number().int().nonnegative(),
  hookCount: z.number().int().nonnegative(),
  mcpServerCount: z.number().int().nonnegative(),
  agentCount: z.number().int().nonnegative(),
  commandCount: z.number().int().nonnegative(),
  lspServerCount: z.number().int().nonnegative(),
});
export type PluginSummary = z.infer<typeof PluginSummarySchema>;

export const PluginListItemSchema = z.object({
  plugin: PluginSummarySchema,
  diagnostics: z.array(PluginDiagnosticSchema),
});
export type PluginListItem = z.infer<typeof PluginListItemSchema>;

export const PluginMutationResponseSchema = PluginListItemSchema;
export type PluginMutationResponse = z.infer<typeof PluginMutationResponseSchema>;

export const InstallPluginBodySchema = z
  .object({
    source: z.string().trim().min(1).optional(),
    path: z.string().trim().min(1).optional(),
    ref: z.string().trim().min(1).optional(),
    pluginName: z.string().trim().min(1).optional(),
    registryId: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.registryId && !value.pluginName) {
      ctx.addIssue({
        code: 'custom',
        message: 'registryId requires pluginName',
      });
    }
    if (!value.registryId && !value.path && !value.source) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide path (local directory) or source',
      });
    }
  });
export type InstallPluginBody = z.infer<typeof InstallPluginBodySchema>;

export const UpdatePluginBodySchema = z.object({
  ref: z.string().trim().min(1).optional(),
});
export type UpdatePluginBody = z.infer<typeof UpdatePluginBodySchema>;

export const SetPluginGrantsBodySchema = z.object({
  classes: z.array(GrantClassSchema),
});
export type SetPluginGrantsBody = z.infer<typeof SetPluginGrantsBodySchema>;

export const ApprovePluginServerBodySchema = z.object({
  serverId: z.string().trim().min(1),
});
export type ApprovePluginServerBody = z.infer<typeof ApprovePluginServerBodySchema>;

export const SetPluginOptionBodySchema = z.object({
  key: z.string().trim().min(1),
  value: PluginOptionValueSchema,
});
export type SetPluginOptionBody = z.infer<typeof SetPluginOptionBodySchema>;

export const RemovePluginBodySchema = z.object({
  deleteData: z.boolean().optional(),
});
export type RemovePluginBody = z.infer<typeof RemovePluginBodySchema>;

export const PluginRecordResponseSchema = z.object({
  plugin: PluginSummarySchema,
});
export type PluginRecordResponse = z.infer<typeof PluginRecordResponseSchema>;

export const SetPluginOptionResponseSchema = z.object({
  plugin: PluginSummarySchema,
  diagnostics: z.array(PluginDiagnosticSchema),
});
export type SetPluginOptionResponse = z.infer<typeof SetPluginOptionResponseSchema>;

export const PluginRegistryKindSchema = z.literal('claude-marketplace');
export type PluginRegistryKind = z.infer<typeof PluginRegistryKindSchema>;

export const PluginRegistrySummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: PluginRegistryKindSchema,
  source: z.string().min(1),
  path: z.string().min(1),
  revision: z.string().optional(),
  lastSyncAt: z.string().optional(),
  lastError: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type PluginRegistrySummary = z.infer<typeof PluginRegistrySummarySchema>;

export const AddPluginRegistryBodySchema = z.object({
  source: z.string().trim().min(1),
  kind: PluginRegistryKindSchema.optional(),
});
export type AddPluginRegistryBody = z.infer<typeof AddPluginRegistryBodySchema>;

export const CatalogInstallSourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('relative'), path: z.string().min(1) }),
  z.object({
    type: z.literal('github'),
    repo: z.string().min(1),
    ref: z.string().optional(),
    sha: z.string().optional(),
  }),
  z.object({
    type: z.literal('url'),
    url: z.string().min(1),
    ref: z.string().optional(),
    sha: z.string().optional(),
  }),
  z.object({
    type: z.literal('git-subdir'),
    url: z.string().min(1),
    path: z.string().min(1),
    ref: z.string().optional(),
    sha: z.string().optional(),
  }),
  z.object({
    type: z.literal('npm'),
    package: z.string().min(1),
    version: z.string().optional(),
    registry: z.string().optional(),
  }),
  z.object({
    type: z.literal('archive'),
    url: z.string().min(1),
    sha256: z.string().optional(),
  }),
]);
export type CatalogInstallSource = z.infer<typeof CatalogInstallSourceSchema>;

export const PluginCatalogEntrySchema = z.object({
  registryId: z.string().min(1),
  pluginName: z.string().min(1),
  displayName: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  version: z.string().optional(),
  homepage: z.string().optional(),
  installable: z.boolean(),
  unsupportedReason: z.string().optional(),
  installSource: CatalogInstallSourceSchema.optional(),
  format: z.string().optional(),
  inertComponents: z.array(z.string()).optional(),
});
export type PluginCatalogEntry = z.infer<typeof PluginCatalogEntrySchema>;

export const ListPluginCatalogQuerySchema = z.object({
  q: z.string().optional(),
  registryId: z.string().optional(),
});
export type ListPluginCatalogQuery = z.infer<typeof ListPluginCatalogQuerySchema>;
