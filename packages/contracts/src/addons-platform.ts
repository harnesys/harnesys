import { FAMILY_NAMES } from '@harnesys/sdk';
import { z } from 'zod';

// ---------------------------------------------------------------------------

export const AddonPlatformFamilySchema = z.enum(FAMILY_NAMES as [string, ...string[]]);
export type AddonPlatformFamily = z.infer<typeof AddonPlatformFamilySchema>;

export const AddonTrustSchema = z.enum(['builtin', 'local', 'external']);
export type AddonTrust = z.infer<typeof AddonTrustSchema>;

export const AddonCompatibilityOutcomeSchema = z.enum(['ok', 'needs_consent', 'incompatible']);
export type AddonCompatibilityOutcome = z.infer<typeof AddonCompatibilityOutcomeSchema>;

export const AddonCompatibilityViewSchema = z.object({
  outcome: AddonCompatibilityOutcomeSchema,
  reasons: z.array(z.string()).default([]),
  skipped: z
    .array(
      z.object({
        contributionId: z.string().min(1),
        family: z.string().min(1),
        reason: z.enum(['unknown_family', 'unsupported_descriptor_version']),
      }),
    )
    .default([]),
});
export type AddonCompatibilityView = z.infer<typeof AddonCompatibilityViewSchema>;

export const AddonPermissionRiskSchema = z.enum(['low', 'medium', 'high']);
export type AddonPermissionRisk = z.infer<typeof AddonPermissionRiskSchema>;

export const AddonPermissionViewSchema = z.object({
  id: z.string().min(1),
  risk: AddonPermissionRiskSchema,
  scope: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().min(1),
  optional: z.boolean().default(false),
  baseline: z.boolean().default(false),
  granted: z.boolean().default(false),
  effectiveScope: z.record(z.string(), z.unknown()).optional(),
});
export type AddonPermissionView = z.infer<typeof AddonPermissionViewSchema>;

export const AddonActivationSchema = z.enum(['lazy', 'resident']);
export type AddonActivation = z.infer<typeof AddonActivationSchema>;

export const AddonRuntimeProfileSchema = z.enum(['trusted', 'restricted']);
export type AddonRuntimeProfile = z.infer<typeof AddonRuntimeProfileSchema>;

export const AddonManifestSummarySchema = z.object({
  platform: z.number().int().positive(),
  activation: AddonActivationSchema,
  runtimeProfile: AddonRuntimeProfileSchema,
  homepage: z.string().optional(),
  license: z.string().optional(),
  features: z.array(z.string()).default([]),
});
export type AddonManifestSummary = z.infer<typeof AddonManifestSummarySchema>;

export const AddonContributionViewSchema = z.object({
  id: z.string().min(1),
  family: AddonPlatformFamilySchema,
  optional: z.boolean().default(false),
});
export type AddonContributionView = z.infer<typeof AddonContributionViewSchema>;

export const AddonConnectionViewSchema = z.object({
  connectionId: z.string().min(1),
  label: z.string().min(1),
  accountKinds: z.array(z.string()).default([]),
  cardinality: z.enum(['one', 'many']),
  optional: z.boolean().default(false),
  accountIds: z.array(z.string()).default([]),
  needsSetup: z.boolean().default(false),
});
export type AddonConnectionView = z.infer<typeof AddonConnectionViewSchema>;

export const AddonPackageViewSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  digest: z.string().min(1),
  source: z.string().min(1),
  trust: AddonTrustSchema,
  title: z.string().min(1),
  description: z.string().default(''),
  icon: z.string().optional(),
  manifest: AddonManifestSummarySchema,
  warnings: z.array(z.string()).default([]),
});
export type AddonPackageView = z.infer<typeof AddonPackageViewSchema>;

export const AddonRescanAddedSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
});
export type AddonRescanAdded = z.infer<typeof AddonRescanAddedSchema>;

export const AddonRescanResultSchema = z.object({
  added: z.array(AddonRescanAddedSchema).default([]),
});
export type AddonRescanResult = z.infer<typeof AddonRescanResultSchema>;

export const InstallPlanSchema = z.object({
  planId: z.string().min(1),
  id: z.string().min(1),
  version: z.string().min(1),
  digest: z.string().min(1),
  source: z.string().min(1),
  trust: AddonTrustSchema,
  title: z.string().min(1),
  description: z.string().default(''),
  permissions: z.array(AddonPermissionViewSchema).default([]),
  connections: z.array(AddonConnectionViewSchema).default([]),
  warnings: z.array(z.string()).default([]),
});
export type InstallPlan = z.infer<typeof InstallPlanSchema>;

export const InstallPlanConfirmBodySchema = z.object({});
export type InstallPlanConfirmBody = z.infer<typeof InstallPlanConfirmBodySchema>;

export const AddonGrantEntrySchema = z.object({
  id: z.string().min(1),
  scope: z.record(z.string(), z.unknown()).optional(),
});
export type AddonGrantEntry = z.infer<typeof AddonGrantEntrySchema>;

export const AddonGrantBodySchema = z.object({
  version: z.string().min(1).optional(),
  grants: z.array(AddonGrantEntrySchema).default([]),
});
export type AddonGrantBody = z.infer<typeof AddonGrantBodySchema>;

export const AddonUpdateBodySchema = z.object({
  version: z.string().min(1),
  grants: z.array(AddonGrantEntrySchema).optional(),
});
export type AddonUpdateBody = z.infer<typeof AddonUpdateBodySchema>;

export const AddonRollbackBodySchema = z.object({
  version: z.string().min(1),
});
export type AddonRollbackBody = z.infer<typeof AddonRollbackBodySchema>;

export const AddonPolicyViewSchema = z.object({
  forbiddenPermissions: z.array(z.string()).default([]),
  forbiddenHosts: z.array(z.string()).default([]),
  allowedSources: z.array(z.string()).default([]),
  allowUnsandboxedExternal: z.boolean().default(false),
});
export type AddonPolicyView = z.infer<typeof AddonPolicyViewSchema>;

export const AddonGrantDiffViewSchema = z.object({
  added: z.array(AddonPermissionViewSchema).default([]),
  removed: z.array(z.string()).default([]),
});
export type AddonGrantDiffView = z.infer<typeof AddonGrantDiffViewSchema>;

export const OrgAddonHealthSchema = z.enum(['stopped', 'running', 'failed', 'quarantined']);
export type OrgAddonHealth = z.infer<typeof OrgAddonHealthSchema>;

export const OrgAddonSummarySchema = z.object({
  orgId: z.string().min(1),
  addonId: z.string().min(1),
  version: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  icon: z.string().optional(),
  enabled: z.boolean().default(false),
  /** True once the organization owns a row for this add-on (enabled or previously enabled). */
  installed: z.boolean().default(false),
  health: OrgAddonHealthSchema.default('stopped'),
  lastError: z.string().nullable().default(null),
  compatibility: AddonCompatibilityViewSchema,
  updateAvailable: z.string().nullable().default(null),
  warnings: z.array(z.string()).default([]),
});
export type OrgAddonSummary = z.infer<typeof OrgAddonSummarySchema>;

export const OrgAddonDetailSchema = OrgAddonSummarySchema.extend({
  manifest: AddonManifestSummarySchema,
  contributions: z.array(AddonContributionViewSchema).default([]),
  permissions: z.object({
    declared: z.array(AddonPermissionViewSchema).default([]),
    granted: z.array(AddonGrantEntrySchema).default([]),
    diff: AddonGrantDiffViewSchema.default({ added: [], removed: [] }),
  }),
  connections: z.array(AddonConnectionViewSchema).default([]),
  configValues: z.record(z.string(), z.unknown()).default({}),
});
export type OrgAddonDetail = z.infer<typeof OrgAddonDetailSchema>;

export const OrgAddonListResponseSchema = z.object({
  items: z.array(OrgAddonSummarySchema).default([]),
});
export type OrgAddonListResponse = z.infer<typeof OrgAddonListResponseSchema>;

export const TriggerInstanceViewSchema = z.object({
  instanceId: z.string().min(1),
  addonId: z.string().min(1),
  triggerId: z.string().min(1),
  label: z.string().min(1),
  config: z.record(z.string(), z.unknown()).default({}),
  target: z.unknown().optional(),
  enabled: z.boolean().default(true),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type TriggerInstanceView = z.infer<typeof TriggerInstanceViewSchema>;

export const TriggerInstanceUpsertBodySchema = z.object({
  triggerId: z.string().min(1),
  label: z.string().min(1),
  config: z.record(z.string(), z.unknown()).default({}),
  target: z.unknown().optional(),
  enabled: z.boolean().default(true),
});
export type TriggerInstanceUpsertBody = z.infer<typeof TriggerInstanceUpsertBodySchema>;

export const AddonJobScheduleViewSchema = z.union([
  z.object({ cron: z.string().min(1) }),
  z.object({ everySec: z.number().int().positive() }),
]);
export type AddonJobScheduleView = z.infer<typeof AddonJobScheduleViewSchema>;

export const AddonJobViewSchema = z.object({
  addonId: z.string().min(1),
  jobId: z.string().min(1),
  title: z.string().min(1),
  schedule: AddonJobScheduleViewSchema,
  timezone: z.enum(['org', 'utc']).optional(),
  enabled: z.boolean().default(true),
  nextRunAt: z.number().int().nullable().default(null),
  lastRunAt: z.number().int().nullable().default(null),
  lastStatus: z.string().nullable().default(null),
});
export type AddonJobView = z.infer<typeof AddonJobViewSchema>;

export const AddonJobPatchBodySchema = z.object({
  enabled: z.boolean().optional(),
});
export type AddonJobPatchBody = z.infer<typeof AddonJobPatchBodySchema>;

export const LogLineViewSchema = z.object({
  seq: z.number().int().nonnegative(),
  at: z.string().min(1),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string().min(1),
  fields: z.record(z.string(), z.unknown()).default({}),
});
export type LogLineView = z.infer<typeof LogLineViewSchema>;

export const LogLineListResponseSchema = z.object({
  items: z.array(LogLineViewSchema).default([]),
  cursor: z.number().int().nonnegative().optional(),
});
export type LogLineListResponse = z.infer<typeof LogLineListResponseSchema>;

export const AddonMetricPointSchema = z.object({
  name: z.string().min(1),
  value: z.number(),
  labels: z.record(z.string(), z.string()).default({}),
});
export type AddonMetricPoint = z.infer<typeof AddonMetricPointSchema>;

export const MetricsViewSchema = z.object({
  addonId: z.string().min(1),
  generatedAt: z.string().min(1),
  counters: z.array(AddonMetricPointSchema).default([]),
});
export type MetricsView = z.infer<typeof MetricsViewSchema>;

export const AddonStateChangedEventSchema = z.object({
  type: z.literal('addon.state_changed'),
  orgId: z.string().min(1),
  addonId: z.string().min(1),
  at: z.string().min(1),
  state: OrgAddonHealthSchema,
  lastError: z.string().nullable().optional(),
});
export type AddonStateChangedEvent = z.infer<typeof AddonStateChangedEventSchema>;

export const AddonUpdateAvailableEventSchema = z.object({
  type: z.literal('addon.update_available'),
  orgId: z.string().min(1),
  addonId: z.string().min(1),
  at: z.string().min(1),
  currentVersion: z.string().min(1),
  availableVersion: z.string().min(1),
});
export type AddonUpdateAvailableEvent = z.infer<typeof AddonUpdateAvailableEventSchema>;

export const AddonConsentRequiredEventSchema = z.object({
  type: z.literal('addon.consent_required'),
  orgId: z.string().min(1),
  addonId: z.string().min(1),
  at: z.string().min(1),
  currentVersion: z.string().min(1),
  pendingVersion: z.string().min(1),
  addedPermissions: z.array(AddonPermissionViewSchema).default([]),
});
export type AddonConsentRequiredEvent = z.infer<typeof AddonConsentRequiredEventSchema>;

export const AddonEventSchema = z.discriminatedUnion('type', [
  AddonStateChangedEventSchema,
  AddonUpdateAvailableEventSchema,
  AddonConsentRequiredEventSchema,
]);
export type AddonEvent = z.infer<typeof AddonEventSchema>;
