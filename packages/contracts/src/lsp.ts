import { z } from 'zod';
import { PluginDiagnosticSchema } from './plugins.ts';

export const LspServerStatusSchema = z.enum(['live', 'off', 'error']);
export type LspServerStatus = z.infer<typeof LspServerStatusSchema>;

export const OrgLspEntrySchema = z.object({
  serverId: z.string().min(1),
  origin: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  extensionToLanguage: z.record(z.string(), z.string()),
  disabled: z.boolean(),
  granted: z.boolean(),
  binaryOk: z.boolean(),
  status: LspServerStatusSchema,
  lastError: z.string().optional(),
});
export type OrgLspEntry = z.infer<typeof OrgLspEntrySchema>;

export const LspCatalogEntrySchema = z.object({
  serverId: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  extensionToLanguage: z.record(z.string(), z.string()),
  install: z.string().min(1),
  installed: z.boolean(),
  binaryOk: z.boolean(),
});
export type LspCatalogEntry = z.infer<typeof LspCatalogEntrySchema>;

export const OrgLspListResponseSchema = z.object({
  servers: z.array(OrgLspEntrySchema),
  diagnostics: z.array(PluginDiagnosticSchema),
  catalog: z.array(LspCatalogEntrySchema).optional(),
  raw: z.unknown().optional(),
});
export type OrgLspListResponse = z.infer<typeof OrgLspListResponseSchema>;

export const PutOrgLspBodySchema = z.unknown();
export type PutOrgLspBody = z.infer<typeof PutOrgLspBodySchema>;

export const UpsertOrgLspServerBodySchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  extensionToLanguage: z.record(z.string(), z.string()).optional(),
});
export type UpsertOrgLspServerBody = z.infer<typeof UpsertOrgLspServerBodySchema>;
