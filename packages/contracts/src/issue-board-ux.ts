import { z } from 'zod';
import { BoardRuleSchema } from './boards.ts';
import { ProfileSelectedBySchema } from './execution-profile.ts';
import {
  ExecutionProfileIdSchema,
  IssueAttachmentPublicSchema,
  IssueCommentPublicSchema,
  IssueDependencyPublicSchema,
  IssuePublicSchema,
} from './issues.ts';
import { RepositoryWorktreeSchema } from './source.ts';

export { ExecutionProfileIdSchema } from './issues.ts';

export const IssueExecutionStateSchema = z.enum(['reserved', 'active', 'handoff', 'released']);
export type IssueExecutionState = z.infer<typeof IssueExecutionStateSchema>;

export const IssueExecutionPublicSchema = z.object({
  id: z.string().uuid(),
  issueId: z.string().uuid(),
  runId: z.string().uuid().nullable(),
  agentId: z.string().uuid(),
  worktreeId: z.string().uuid().nullable(),
  state: IssueExecutionStateSchema,
  requestedStatus: z.string().min(1),
  ruleId: z.string().uuid().nullable(),
  profileId: ExecutionProfileIdSchema.nullable(),
  correlationId: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type IssueExecutionPublic = z.infer<typeof IssueExecutionPublicSchema>;

export const IssuePlacementCandidateSchema = z.object({
  nodeId: z.string().min(1),
  eligible: z.boolean(),
  reasons: z.array(z.string()),
  activeClaims: z.number().int().nonnegative(),
});
export type IssuePlacementCandidate = z.infer<typeof IssuePlacementCandidateSchema>;

export const IssuePlacementDiagnosisSchema = z.object({
  summary: z.string().min(1),
  profileId: ExecutionProfileIdSchema.nullable(),
  profileSource: ProfileSelectedBySchema.nullable(),
  selectedNodeId: z.string().nullable(),
  unavailableReason: z.string().nullable(),
  waiting: z.boolean(),
  candidates: z.array(IssuePlacementCandidateSchema),
});
export type IssuePlacementDiagnosis = z.infer<typeof IssuePlacementDiagnosisSchema>;

export const IssueLaunchPreviewSchema = z.object({
  agentId: z.string().uuid().nullable(),
  ruleId: z.string().uuid().nullable(),
  profileId: ExecutionProfileIdSchema.nullable(),
  profileSource: ProfileSelectedBySchema.nullable(),
});
export type IssueLaunchPreview = z.infer<typeof IssueLaunchPreviewSchema>;

export const CreateIssueWorktreeBodySchema = z.object({
  baseBranch: z.string().trim().min(1).optional(),
  branch: z.string().trim().min(1).optional(),
  createBranch: z.boolean().optional(),
});
export type CreateIssueWorktreeBody = z.infer<typeof CreateIssueWorktreeBodySchema>;

export const GetIssueResponseSchema = z.object({
  issue: IssuePublicSchema,
  comments: z.array(IssueCommentPublicSchema),
  subtasks: z.array(IssuePublicSchema),
  dependencies: z.array(IssueDependencyPublicSchema),
  dependents: z.array(IssueDependencyPublicSchema),
  attachments: z.array(IssueAttachmentPublicSchema),
  rules: z.array(BoardRuleSchema),
  execution: IssueExecutionPublicSchema.nullable(),
  worktree: RepositoryWorktreeSchema.nullable(),
  placement: IssuePlacementDiagnosisSchema.nullable(),
  launchPreview: IssueLaunchPreviewSchema,
});
export type GetIssueResponse = z.infer<typeof GetIssueResponseSchema>;
