import { z } from 'zod';

export const PackCatalogToolSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
});
export type PackCatalogTool = z.infer<typeof PackCatalogToolSchema>;

export const PackCatalogEntrySchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string(),
  icon: z.string().optional(),
  hasSettings: z.boolean(),
  tools: z.array(PackCatalogToolSchema),
  skills: z.array(z.string()),
});
export type PackCatalogEntry = z.infer<typeof PackCatalogEntrySchema>;

export const ListOrgCapabilitiesResponseSchema = z.object({
  capabilities: z.array(PackCatalogEntrySchema),
});
export type ListOrgCapabilitiesResponse = z.infer<typeof ListOrgCapabilitiesResponseSchema>;

export const OrgToolSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  group: z.string().optional(),
});
export type OrgTool = z.infer<typeof OrgToolSchema>;

export const ListOrgToolsResponseSchema = z.object({
  tools: z.array(OrgToolSchema),
});
export type ListOrgToolsResponse = z.infer<typeof ListOrgToolsResponseSchema>;

export const ExplainKindSchema = z.enum([
  'tool',
  'skill',
  'mcp',
  'hook',
  'subagent',
  'note',
  'path',
]);
export type ExplainKind = z.infer<typeof ExplainKindSchema>;

export const ExplainStatusSchema = z.enum([
  'granted',
  'deferred',
  'disabled',
  'dropped-by-mode',
  'denied-by-universe',
  'denied-by-permission',
  'overrode-host',
]);
export type ExplainStatus = z.infer<typeof ExplainStatusSchema>;

export const ExplainEntrySchema = z.object({
  item: z.string().min(1),
  kind: ExplainKindSchema,
  source: z.string().min(1),
  status: ExplainStatusSchema,
  reason: z.string(),
});
export type ExplainEntry = z.infer<typeof ExplainEntrySchema>;

export const AgentCapabilityRegistryEntrySchema = z.object({
  name: z.string().min(1),
  exposure: z.enum(['direct', 'deferred']),
  source: z.string().min(1),
});
export type AgentCapabilityRegistryEntry = z.infer<typeof AgentCapabilityRegistryEntrySchema>;

export const AgentRosterEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  parentId: z.string().nullable().optional(),
});
export type AgentRosterEntry = z.infer<typeof AgentRosterEntrySchema>;

export const AgentCapabilitiesViewSchema = z.object({
  explain: z.array(ExplainEntrySchema),
  registry: z.array(AgentCapabilityRegistryEntrySchema),
  subagents: z.array(AgentRosterEntrySchema),
});
export type AgentCapabilitiesView = z.infer<typeof AgentCapabilitiesViewSchema>;
