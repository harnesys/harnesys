import { z } from 'zod';
import { OrgIdSchema } from './org-machine.ts';
import { UiVisibilitySchema } from './ui-visibility.ts';

export const SourceDistributionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('host-bound'),
    hostId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal('cloud-drive'),
    backend: z.literal('google'),
    remoteFolderId: z.string().min(1),
    integrationId: z.string().uuid(),
  }),
]);
export type SourceDistribution = z.infer<typeof SourceDistributionSchema>;

export const SourceVcsSchema = z.object({
  engine: z.literal('git'),
  remoteUrl: z.string().min(1).nullable(),
  credRef: z.string().min(1).nullable(),
  defaultBranch: z.string().min(1).nullable(),
  integrationId: z.string().uuid().nullish(),
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
    integrationId: z.string().uuid().optional(),
    repo: z
      .string()
      .min(1)
      .regex(/^[\w.-]+\/[\w.-]+$/, 'repo must be "owner/name"')
      .optional(),
  })
  .superRefine((body, ctx) => {
    const hasUrl = body.url !== undefined && body.url !== '';
    const hasIntegration = body.integrationId !== undefined;
    if (hasUrl === hasIntegration) {
      ctx.addIssue({
        code: 'custom',
        path: hasUrl ? ['integrationId'] : ['url'],
        message: 'provide either url or integrationId+repo, not both',
      });
      return;
    }
    if (hasIntegration && body.repo === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['repo'],
        message: 'repo is required with integrationId',
      });
      return;
    }
    if (hasIntegration && body.credRef !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['credRef'],
        message: 'credRef cannot be combined with integrationId',
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

export const RefreshCloudDriveBodySchema = z.object({
  hostId: z.string().uuid(),
});
export type RefreshCloudDriveBody = z.infer<typeof RefreshCloudDriveBodySchema>;

export const AttachCloudDriveBodySchema = z.object({
  name: z.string().min(1).optional(),
  backend: z.literal('google').default('google'),
  remoteFolderId: z.string().min(1).default('root'),
  integrationId: z.string().uuid(),
  hostId: z.string().min(1).optional(),
  uiVisibility: UiVisibilitySchema.optional(),
});
export type AttachCloudDriveBody = z.infer<typeof AttachCloudDriveBodySchema>;

export const GoogleOAuthLoopbackStartResponseSchema = z.object({
  flow: z.literal('loopback'),
  sessionId: z.string().min(1),
  authUrl: z.string().min(1),
  expiresIn: z.number().int().positive(),
});
export type GoogleOAuthLoopbackStartResponse = z.infer<
  typeof GoogleOAuthLoopbackStartResponseSchema
>;

export const GoogleAppConfigBodySchema = z.object({
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1),
  apiKey: z.string().trim().default(''),
  appId: z.string().trim().default(''),
});
export type GoogleAppConfigBody = z.infer<typeof GoogleAppConfigBodySchema>;

export const GoogleAppConfigStatusResponseSchema = z.object({
  configured: z.boolean(),
  redirectUri: z.string().min(1),
  clientId: z.string(),
  hasClientSecret: z.boolean(),
  hasApiKey: z.boolean(),
  hasAppId: z.boolean(),
});
export type GoogleAppConfigStatusResponse = z.infer<typeof GoogleAppConfigStatusResponseSchema>;

export const GoogleOAuthStatusResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }),
  z.object({ status: z.literal('denied') }),
  z.object({ status: z.literal('expired') }),
  z.object({
    status: z.literal('ready'),
    integrationId: z.string().uuid(),
  }),
]);
export type GoogleOAuthStatusResponse = z.infer<typeof GoogleOAuthStatusResponseSchema>;

export const GoogleOAuthStatusQuerySchema = z.object({
  sessionId: z.string().min(1),
});
export type GoogleOAuthStatusQuery = z.infer<typeof GoogleOAuthStatusQuerySchema>;

export const GooglePickerSessionQuerySchema = z.object({
  integrationId: z.string().uuid(),
});
export type GooglePickerSessionQuery = z.infer<typeof GooglePickerSessionQuerySchema>;

export const GooglePickerSessionResponseSchema = z.object({
  accessToken: z.string().min(1),
  apiKey: z.string().min(1),
  appId: z.string().min(1),
});
export type GooglePickerSessionResponse = z.infer<typeof GooglePickerSessionResponseSchema>;

export const SetSourceVisibilityBodySchema = z.object({
  uiVisibility: UiVisibilitySchema,
});
export type SetSourceVisibilityBody = z.infer<typeof SetSourceVisibilityBodySchema>;

export const RenameSourceBodySchema = z.object({
  name: z.string().min(1),
});
export type RenameSourceBody = z.infer<typeof RenameSourceBodySchema>;

export const RepositoryWorktreeStateSchema = z.enum(['creating', 'ready', 'failed', 'removing']);
export type RepositoryWorktreeState = z.infer<typeof RepositoryWorktreeStateSchema>;

export const RepositoryWorktreeSchema = z.object({
  id: z.string().uuid(),
  orgId: OrgIdSchema,
  sourceId: z.string().uuid(),
  hostId: z.string().uuid(),
  branch: z.string().min(1),
  baseCommit: z.string().min(1).nullable(),
  state: RepositoryWorktreeStateSchema,
  activeRunId: z.string().uuid().nullable(),
  operationId: z.string().uuid(),
  issueId: z.string().uuid().nullable(),
  lastErrorCode: z.string().min(1).nullable(),
  dirty: z.boolean().nullable(),
  unpushed: z.boolean().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type RepositoryWorktree = z.infer<typeof RepositoryWorktreeSchema>;

export const CreateRepositoryWorktreeBodySchema = z.object({
  hostId: z.string().uuid(),
  operationId: z.string().uuid(),
  branch: z.string().min(1),
  createBranch: z.boolean().optional(),
  from: z.string().min(1).optional(),
});
export type CreateRepositoryWorktreeBody = z.infer<typeof CreateRepositoryWorktreeBodySchema>;

export const ListRepositoryWorktreesResponseSchema = z.object({
  worktrees: z.array(RepositoryWorktreeSchema),
});
export type ListRepositoryWorktreesResponse = z.infer<typeof ListRepositoryWorktreesResponseSchema>;

export const DeleteRepositoryWorktreeResponseSchema = z.object({
  worktreeId: z.string().uuid(),
  operationId: z.string().uuid(),
  result: z.enum(['removed', 'failed']),
  errorCode: z.enum(['WORKTREE_NOT_CLEAN', 'BRANCH_IN_USE', 'SOURCE_NOT_READY']).optional(),
});
export type DeleteRepositoryWorktreeResponse = z.infer<
  typeof DeleteRepositoryWorktreeResponseSchema
>;
