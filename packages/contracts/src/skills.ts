import { z } from 'zod';
import { OrgIdSchema } from './org-machine.ts';

export const SkillSidecarSchema = z.object({
  url: z.string().min(1),
  ref: z.string().optional(),
  subPath: z.string().min(1),
  revision: z.string().min(1),
  installedAt: z.string().min(1),
});
export type SkillSidecar = z.infer<typeof SkillSidecarSchema>;

export const SkillOriginSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('org') }),
  z.object({ kind: z.literal('system') }),
  z.object({ kind: z.literal('host') }),
  z.object({
    kind: z.literal('source'),
    sourceId: z.string(),
    sourceName: z.string(),
    relativePath: z.string(),
    outsideContainer: z.boolean(),
  }),
  z.object({
    kind: z.literal('plugin'),
    pluginName: z.string().min(1),
    status: z.string().optional(),
    inertReason: z.string().optional(),
  }),
]);
export type SkillOrigin = z.infer<typeof SkillOriginSchema>;

export const OrgSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  whenToUse: z.string().optional(),
  origin: SkillOriginSchema,
  path: z.string().optional(),
  installedFrom: z.string().optional(),
  canDelete: z.boolean(),
  canUpdate: z.boolean(),
  loadable: z.boolean(),
  updateAvailable: z.boolean().optional(),
});
export type OrgSkill = z.infer<typeof OrgSkillSchema>;

export const EffectiveSkillSchema = OrgSkillSchema.extend({
  granted: z.boolean(),
});
export type EffectiveSkill = z.infer<typeof EffectiveSkillSchema>;

export const ListEffectiveSkillsResponseSchema = z.object({
  skills: z.array(EffectiveSkillSchema),
});
export type ListEffectiveSkillsResponse = z.infer<typeof ListEffectiveSkillsResponseSchema>;

export const DiscoverSkillsBodySchema = z.object({
  url: z.string().min(3),
  ref: z.string().min(1).max(128).optional(),
});
export type DiscoverSkillsBody = z.infer<typeof DiscoverSkillsBodySchema>;

export const SkillCandidateSchema = z.object({
  name: z.string(),
  description: z.string(),
  subPath: z.string(),
  outsideContainer: z.boolean(),
  invalidReason: z.string().optional(),
});
export type SkillCandidate = z.infer<typeof SkillCandidateSchema>;

export const DiscoverSkillsResponseSchema = z.object({
  revision: z.string(),
  candidates: z.array(SkillCandidateSchema),
  diagnostics: z.array(z.object({ subPath: z.string(), reason: z.string() })),
});
export type DiscoverSkillsResponse = z.infer<typeof DiscoverSkillsResponseSchema>;

export const InstallSkillsBodySchema = z.object({
  url: z.string().min(3),
  ref: z.string().min(1).max(128).optional(),
  revision: z.string().min(1),
  selections: z.array(z.string().min(1)).min(1).max(50),
});
export type InstallSkillsBody = z.infer<typeof InstallSkillsBodySchema>;

export const InstallSkillsResponseSchema = z.object({
  installed: z.array(OrgSkillSchema),
  conflicts: z.array(z.string()),
});
export type InstallSkillsResponse = z.infer<typeof InstallSkillsResponseSchema>;

export const SkillSearchHitSchema = z.object({
  id: z.string(),
  source: z.string(),
  skillId: z.string(),
  name: z.string(),
  installs: z.number(),
  installUrl: z.string(),
  isDuplicate: z.boolean().optional(),
});
export type SkillSearchHit = z.infer<typeof SkillSearchHitSchema>;

export const SkillSearchResponseSchema = z.object({
  results: z.array(SkillSearchHitSchema),
  degraded: z.boolean().optional(),
  hint: z.string().optional(),
});
export type SkillSearchResponse = z.infer<typeof SkillSearchResponseSchema>;

export const ListOrgSkillsResponseSchema = z.object({
  skills: z.array(OrgSkillSchema),
});
export type ListOrgSkillsResponse = z.infer<typeof ListOrgSkillsResponseSchema>;

export const CreateOrgSkillBodySchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'skill name must be kebab-case ([a-z0-9][a-z0-9-]*)'),
  description: z.string().trim().min(1),
  whenToUse: z.string().trim().min(1).optional(),
  instructions: z.string().trim().min(1),
});
export type CreateOrgSkillBody = z.infer<typeof CreateOrgSkillBodySchema>;

export const CreateOrgSkillResponseSchema = z.object({
  skill: OrgSkillSchema,
});
export type CreateOrgSkillResponse = z.infer<typeof CreateOrgSkillResponseSchema>;

export const OrgSkillsParamsSchema = z.object({
  orgId: OrgIdSchema,
});
export type OrgSkillsParams = z.infer<typeof OrgSkillsParamsSchema>;

export const EffectiveSkillsQuerySchema = z.object({
  agentId: z.string().min(1),
});
export type EffectiveSkillsQuery = z.infer<typeof EffectiveSkillsQuerySchema>;
