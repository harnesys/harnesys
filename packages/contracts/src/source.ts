import { z } from 'zod';
import { OrgIdSchema } from './org-machine.ts';
import { UiVisibilitySchema } from './ui-visibility.ts';

export const SourceDistributionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('host-bound'),
    hostId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal('addon-cloud'),
    addonId: z.string().min(1),
    sourceKindId: z.string().min(1),
    accountId: z.string().min(1).optional(),
    remoteFolderId: z.string().min(1),
  }),
]);
export type SourceDistribution = z.infer<typeof SourceDistributionSchema>;
export type SourceDistributionKind = SourceDistribution extends { kind: infer Kind } ? Kind : never;

export const SourceVcsSchema = z.object({
  engine: z.literal('git'),
  remoteUrl: z.string().min(1).nullable(),
  credRef: z.string().min(1).nullable(),
  defaultBranch: z.string().min(1).nullable(),
  accountId: z.string().min(1).nullish(),
  credentialKey: z.string().min(1).nullish(),
});
export type SourceVcs = z.infer<typeof SourceVcsSchema>;

export const SourceAvailabilitySchema = z.object({
  hostIds: z.array(z.string().uuid()),
});
export type SourceAvailability = z.infer<typeof SourceAvailabilitySchema>;

export const SetSourceAvailabilityBodySchema = z.object({
  hostIds: z.array(z.string().uuid()),
});
export type SetSourceAvailabilityBody = z.infer<typeof SetSourceAvailabilityBodySchema>;

export const SetGitRemoteBodySchema = z.object({
  url: z.string().min(1),
  credRef: z.string().min(1).optional(),
  hostId: z.string().uuid(),
});
export type SetGitRemoteBody = z.infer<typeof SetGitRemoteBodySchema>;

export const SourceSchema = z.object({
  id: z.string().uuid(),
  orgId: OrgIdSchema,
  name: z.string().min(1),
  description: z.string().nullable().default(null),
  distribution: SourceDistributionSchema,
  uiVisibility: UiVisibilitySchema,
  managed: z.boolean(),
  vcs: SourceVcsSchema.nullable().default(null),
  availability: SourceAvailabilitySchema.default({ hostIds: [] }),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type Source = z.infer<typeof SourceSchema>;

export const SourcesListResponseSchema = z.object({
  sources: z.array(SourceSchema),
});
export type SourcesListResponse = z.infer<typeof SourcesListResponseSchema>;

export const MaterializationStateSchema = z.enum(['absent', 'materializing', 'ready', 'failed']);
export type MaterializationState = z.infer<typeof MaterializationStateSchema>;

export const MaterializationOriginSchema = z.enum(['managed', 'attached']);
export type MaterializationOrigin = z.infer<typeof MaterializationOriginSchema>;

export const MaterializationStateFrameSchema = z.object({
  sourceId: z.string().uuid(),
  hostId: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  state: MaterializationStateSchema,
  lastErrorCode: z.string().min(1).optional(),
  lastConflictPaths: z.array(z.string().min(1)).optional(),
  refreshRequired: z.boolean().optional(),
  sourceChanged: z.boolean().optional(),
});
export type MaterializationStateFrame = z.infer<typeof MaterializationStateFrameSchema>;

export const MaterializationProjectionSchema = z.object({
  sourceId: z.string().uuid(),
  hostId: z.string().uuid(),
  state: MaterializationStateSchema,
  revision: z.number().int().nonnegative(),
  lastConfirmedAt: z.string().min(1),
  lastErrorCode: z.string().min(1).optional(),
  lastConflictPaths: z.array(z.string().min(1)).optional(),
  refreshRequired: z.boolean().optional(),
});
export type MaterializationProjection = z.infer<typeof MaterializationProjectionSchema>;

export const SourceHostNodeStatusSchema = z.enum(['online', 'offline', 'draining']);
export type SourceHostNodeStatus = z.infer<typeof SourceHostNodeStatusSchema>;

export const SourceHostStatusSchema = z.object({
  hostId: z.string().uuid(),
  nodeStatus: SourceHostNodeStatusSchema,
  materialization: MaterializationStateSchema,
  lastConfirmedAt: z.string().min(1).nullable(),
  errorCode: z.string().min(1).nullable(),
  stale: z.boolean(),
  defaultWorktreeId: z.string().min(1).nullable().optional(),
  lastConflictPaths: z.array(z.string().min(1)).default([]),
  refreshRequired: z.boolean().default(false),
  availabilityReason: z
    .enum(['origin', 'allowed', 'excluded', 'needs-remote'])
    .nullable()
    .optional(),
});
export type SourceHostStatus = z.infer<typeof SourceHostStatusSchema>;

export const SourceHostStatusResponseSchema = z.object({
  statuses: z.array(SourceHostStatusSchema),
});
export type SourceHostStatusResponse = z.infer<typeof SourceHostStatusResponseSchema>;

export const AttachLocalFolderBodySchema = z.object({
  name: z.string().min(1).optional(),
  absolutePath: z.string().min(1),
  hostId: z.string().min(1).optional(),
  uiVisibility: UiVisibilitySchema.optional(),
});
export type AttachLocalFolderBody = z.infer<typeof AttachLocalFolderBodySchema>;

export const AttachGitBodySchema = z
  .object({
    url: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    hostId: z.string().min(1).optional(),
    uiVisibility: UiVisibilitySchema.optional(),
    branch: z.string().min(1).optional(),
    credRef: z.string().min(1).optional(),
    accountId: z.string().min(1).optional(),
    repo: z
      .string()
      .min(1)
      .regex(/^[\w.-]+\/[\w.-]+$/, 'repo must be "owner/name"')
      .optional(),
  })
  .superRefine((body, ctx) => {
    const hasUrl = body.url !== undefined && body.url !== '';
    const hasAccount = body.accountId !== undefined;
    if (hasUrl === hasAccount) {
      ctx.addIssue({
        code: 'custom',
        path: hasUrl ? ['accountId'] : ['url'],
        message: 'provide either url or accountId+repo, not both',
      });
      return;
    }
    if (hasAccount && body.repo === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['repo'],
        message: 'repo is required with accountId',
      });
      return;
    }
    if (hasAccount && body.credRef !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['credRef'],
        message: 'credRef cannot be combined with accountId',
      });
    }
  });
export type AttachGitBody = z.infer<typeof AttachGitBodySchema>;

export const InitGitBodySchema = z.object({
  hostId: z.string().uuid(),
});
export type InitGitBody = z.infer<typeof InitGitBodySchema>;

export const SwitchGitBranchBodySchema = z.object({
  hostId: z.string().uuid(),
  worktreeId: z.string().min(1),
  branch: z.string().min(1),
});
export type SwitchGitBranchBody = z.infer<typeof SwitchGitBranchBodySchema>;

export const DeleteGitBranchBodySchema = z.object({
  hostId: z.string().uuid(),
  branch: z.string().min(1).max(200),
});
export type DeleteGitBranchBody = z.infer<typeof DeleteGitBranchBodySchema>;

export const GitHostQuerySchema = z.object({
  hostId: z.string().uuid(),
});
export type GitHostQuery = z.infer<typeof GitHostQuerySchema>;

export const GitHostWorktreeQuerySchema = z.object({
  hostId: z.string().uuid(),
  worktreeId: z.string().min(1),
});
export type GitHostWorktreeQuery = z.infer<typeof GitHostWorktreeQuerySchema>;

export const PrepareGitSourceBodySchema = z.object({
  hostId: z.string().uuid(),
});
export type PrepareGitSourceBody = z.infer<typeof PrepareGitSourceBodySchema>;

export const RefreshGitSourceBodySchema = z.object({
  hostId: z.string().uuid(),
  worktreeId: z.string().min(1).optional(),
});
export type RefreshGitSourceBody = z.infer<typeof RefreshGitSourceBodySchema>;

export const PrepareGitSourceResponseSchema = z.object({
  sourceId: z.string().uuid(),
  hostId: z.string().uuid(),
  operationId: z.string().uuid(),
  state: MaterializationStateSchema,
  worktreeId: z.string().min(1).nullable(),
});
export type PrepareGitSourceResponse = z.infer<typeof PrepareGitSourceResponseSchema>;

export const SetSourceVisibilityBodySchema = z.object({
  uiVisibility: UiVisibilitySchema,
});
export type SetSourceVisibilityBody = z.infer<typeof SetSourceVisibilityBodySchema>;

export const RenameSourceBodySchema = z.object({
  name: z.string().min(1),
});
export type RenameSourceBody = z.infer<typeof RenameSourceBodySchema>;

export * from './source-worktree.ts';
