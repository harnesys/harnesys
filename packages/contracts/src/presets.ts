import { z } from 'zod';
import { AgentPresetBudgetSchema } from './agent.ts';
import {
  BoardStatusSchema,
  NotifyOwnerActionSchema,
  RuleConditionSchema,
  RuleTriggerSchema,
  SetStatusActionSchema,
} from './boards.ts';
import { PresetIdSchema } from './preset-id.ts';

export type { PresetId } from './preset-id.ts';

export const PRESET_ENVELOPE_MAX_BYTES = 512 * 1024;

export const PresetKindSchema = z.enum(['agent', 'team']);
export type PresetKind = z.infer<typeof PresetKindSchema>;

export const PresetOriginSchema = z.enum(['system', 'user', 'registry']);
export type PresetOrigin = z.infer<typeof PresetOriginSchema>;

export const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
export type Semver = z.infer<typeof SemverSchema>;

export { PresetIdSchema };

export const AgentPresetBodySchema = z.object({
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  instructions: z.string().trim().min(1),
  skills: z.array(z.string()).optional(),
  mcpServers: z.array(z.string()).optional(),
  budget: AgentPresetBudgetSchema.optional(),
  capabilities: z.record(z.string(), z.record(z.string(), z.unknown()).nullable()).optional(),
  permissions: z.record(z.string(), z.enum(['allow', 'ask', 'deny'])).optional(),
  graph: z
    .object({
      nodes: z.record(z.string(), z.unknown()),
      edges: z.array(z.unknown()),
    })
    .optional(),
});
export type AgentPresetBody = z.infer<typeof AgentPresetBodySchema>;

export const TeamPresetRoleSchema = z.object({
  roleKey: z.string().trim().min(1),
  name: z.string().trim().min(1),
  agentRef: PresetIdSchema,
  budgetUsdDaily: z.number().nonnegative(),
  requiresModel: z.boolean(),
  capabilitiesExtra: z.array(z.string()).optional(),
});
export type TeamPresetRole = z.infer<typeof TeamPresetRoleSchema>;

export const PresetAssignAgentActionSchema = z.object({
  type: z.literal('assign_agent'),
  roleKey: z.string().trim().min(1),
  executionProfileId: z.string().uuid().optional(),
});
export type PresetAssignAgentAction = z.infer<typeof PresetAssignAgentActionSchema>;

export const PresetRuleActionSchema = z.discriminatedUnion('type', [
  PresetAssignAgentActionSchema,
  SetStatusActionSchema,
  NotifyOwnerActionSchema,
]);
export type PresetRuleAction = z.infer<typeof PresetRuleActionSchema>;

export const PresetBoardRuleSchema = z.object({
  trigger: RuleTriggerSchema,
  conditions: z.array(RuleConditionSchema),
  actions: z.array(PresetRuleActionSchema).min(1),
  position: z.number().int().nonnegative(),
  enabled: z.boolean(),
});
export type PresetBoardRule = z.infer<typeof PresetBoardRuleSchema>;

export const TeamPresetBoardSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  icon: z.string().trim().optional(),
  color: z.string().trim().optional(),
  statuses: z.array(BoardStatusSchema).min(2),
  rules: z.array(PresetBoardRuleSchema),
});
export type TeamPresetBoard = z.infer<typeof TeamPresetBoardSchema>;

export const TeamPresetDigestSchema = z.object({
  cronDefault: z.string().trim().min(1),
  roleKey: z.string().trim().min(1),
  detail: z.string().trim().min(1),
});
export type TeamPresetDigest = z.infer<typeof TeamPresetDigestSchema>;

export const TeamPresetBodySchema = z.object({
  roles: z.array(TeamPresetRoleSchema).min(1),
  board: TeamPresetBoardSchema,
  digest: TeamPresetDigestSchema,
});
export type TeamPresetBody = z.infer<typeof TeamPresetBodySchema>;

export const AgentCatalogItemSchema = z.object({
  kind: z.literal('agent'),
  id: PresetIdSchema,
  origin: PresetOriginSchema,
  version: SemverSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()),
  installedFrom: z.string().optional(),
  role: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AgentCatalogItem = z.infer<typeof AgentCatalogItemSchema>;

export const TeamCatalogItemSchema = z.object({
  kind: z.literal('team'),
  id: PresetIdSchema,
  origin: PresetOriginSchema,
  version: SemverSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()),
  installedFrom: z.string().optional(),
  roles: z.array(z.object({ roleKey: z.string(), name: z.string() })),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TeamCatalogItem = z.infer<typeof TeamCatalogItemSchema>;

export const CatalogItemSchema = z.discriminatedUnion('kind', [
  AgentCatalogItemSchema,
  TeamCatalogItemSchema,
]);
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

export const AgentPresetDetailSchema = AgentCatalogItemSchema.extend({
  body: AgentPresetBodySchema,
});
export type AgentPresetDetail = z.infer<typeof AgentPresetDetailSchema>;

export const TeamPresetDetailSchema = TeamCatalogItemSchema.extend({
  body: TeamPresetBodySchema,
});
export type TeamPresetDetail = z.infer<typeof TeamPresetDetailSchema>;

export const PresetDetailSchema = z.discriminatedUnion('kind', [
  AgentPresetDetailSchema,
  TeamPresetDetailSchema,
]);
export type PresetDetail = z.infer<typeof PresetDetailSchema>;

export const SaveAgentPresetBodySchema = z.object({
  kind: z.literal('agent'),
  id: PresetIdSchema,
  name: z.string().trim().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  version: SemverSchema.optional(),
  body: AgentPresetBodySchema,
});
export type SaveAgentPresetBody = z.infer<typeof SaveAgentPresetBodySchema>;

export const SaveTeamPresetBodySchema = z.object({
  kind: z.literal('team'),
  id: PresetIdSchema,
  name: z.string().trim().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  version: SemverSchema.optional(),
  body: TeamPresetBodySchema,
});
export type SaveTeamPresetBody = z.infer<typeof SaveTeamPresetBodySchema>;

export const SavePresetBodySchema = z.discriminatedUnion('kind', [
  SaveAgentPresetBodySchema,
  SaveTeamPresetBodySchema,
]);
export type SavePresetBody = z.infer<typeof SavePresetBodySchema>;

export const ListPresetsQuerySchema = z.object({
  kind: PresetKindSchema.optional(),
  origin: PresetOriginSchema.optional(),
});
export type ListPresetsQuery = z.infer<typeof ListPresetsQuerySchema>;

export const ListPresetsResponseSchema = z.object({
  items: z.array(CatalogItemSchema),
});
export type ListPresetsResponse = z.infer<typeof ListPresetsResponseSchema>;

export const EnvelopeAgentSchema = z.object({
  kind: z.literal('agent'),
  id: PresetIdSchema,
  version: SemverSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  body: AgentPresetBodySchema,
});
export type EnvelopeAgent = z.infer<typeof EnvelopeAgentSchema>;

export const EnvelopeTeamSchema = z.object({
  kind: z.literal('team'),
  id: PresetIdSchema,
  version: SemverSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  body: TeamPresetBodySchema,
});
export type EnvelopeTeam = z.infer<typeof EnvelopeTeamSchema>;

export const EnvelopePresetSchema = z.discriminatedUnion('kind', [
  EnvelopeAgentSchema,
  EnvelopeTeamSchema,
]);
export type EnvelopePreset = z.infer<typeof EnvelopePresetSchema>;

export const PresetManifestSchema = z.object({
  id: PresetIdSchema,
  version: SemverSchema,
  kind: PresetKindSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  author: z.object({ name: z.string().min(1) }).optional(),
  tags: z.array(z.string()),
  harnesysRange: z.string().optional(),
});
export type PresetManifest = z.infer<typeof PresetManifestSchema>;

export const PresetEnvelopeSchema = z.object({
  formatVersion: z.literal(1),
  manifest: PresetManifestSchema,
  presets: z.array(EnvelopePresetSchema).min(1),
});
export type PresetEnvelope = z.infer<typeof PresetEnvelopeSchema>;

export const ImportPresetsBodySchema = z.object({
  envelope: PresetEnvelopeSchema,
});
export type ImportPresetsBody = z.infer<typeof ImportPresetsBodySchema>;

export const ImportPresetsResponseSchema = z.object({
  items: z.array(CatalogItemSchema),
});
export type ImportPresetsResponse = z.infer<typeof ImportPresetsResponseSchema>;
