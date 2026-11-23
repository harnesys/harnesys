import { z } from 'zod';

const HostIdSchema = z.string().uuid();
const WorktreeIdSchema = z.string().min(1);

export const GitHostWorktreeQuerySchema = z.object({
  hostId: HostIdSchema,
  worktreeId: WorktreeIdSchema,
});
export type GitHostWorktreeQuery = z.infer<typeof GitHostWorktreeQuerySchema>;

export const GitHostQuerySchema = z.object({
  hostId: HostIdSchema,
});
export type GitHostQuery = z.infer<typeof GitHostQuerySchema>;

export const GitFileStatusQuerySchema = GitHostWorktreeQuerySchema.extend({
  path: z.string().optional(),
});
export type GitFileStatusQuery = z.infer<typeof GitFileStatusQuerySchema>;

export const GitDiffQuerySchema = GitHostWorktreeQuerySchema.extend({
  path: z.string().min(1),
});
export type GitDiffQuery = z.infer<typeof GitDiffQuerySchema>;

export const StageGitBodySchema = z.object({
  hostId: HostIdSchema,
  worktreeId: WorktreeIdSchema,
  paths: z.array(z.string()).optional(),
});
export type StageGitBody = z.infer<typeof StageGitBodySchema>;

export const UnstageGitBodySchema = z.object({
  hostId: HostIdSchema,
  worktreeId: WorktreeIdSchema,
  paths: z.array(z.string()).default([]),
});
export type UnstageGitBody = z.infer<typeof UnstageGitBodySchema>;

export const DiscardGitBodySchema = z.object({
  hostId: HostIdSchema,
  worktreeId: WorktreeIdSchema,
  paths: z.array(z.string()).min(1),
  untrackedPaths: z.array(z.string()).default([]),
});
export type DiscardGitBody = z.infer<typeof DiscardGitBodySchema>;

export const CommitGitBodySchema = z.object({
  hostId: HostIdSchema,
  worktreeId: WorktreeIdSchema,
  message: z.string().min(1),
  paths: z.array(z.string()).optional(),
  amend: z.boolean().optional(),
});
export type CommitGitBody = z.infer<typeof CommitGitBodySchema>;

export const GenerateCommitMessageBodySchema = z.object({
  hostId: HostIdSchema,
  worktreeId: WorktreeIdSchema,
  paths: z.array(z.string()).min(1),
});
export type GenerateCommitMessageBody = z.infer<typeof GenerateCommitMessageBodySchema>;

export const CheckoutGitBodySchema = z.object({
  hostId: HostIdSchema,
  worktreeId: WorktreeIdSchema,
  branch: z.string().min(1),
});
export type CheckoutGitBody = z.infer<typeof CheckoutGitBodySchema>;

export const MergeGitBodySchema = z.object({
  hostId: HostIdSchema,
  worktreeId: WorktreeIdSchema,
  branch: z.string().min(1),
});
export type MergeGitBody = z.infer<typeof MergeGitBodySchema>;

export const CreateGitBranchBodySchema = z.object({
  hostId: HostIdSchema,
  worktreeId: WorktreeIdSchema,
  name: z.string().min(1),
  checkout: z.boolean().optional(),
  from: z.string().min(1).optional(),
});
export type CreateGitBranchBody = z.infer<typeof CreateGitBranchBodySchema>;

export const HostWorktreeBodySchema = z.object({
  hostId: HostIdSchema,
  worktreeId: WorktreeIdSchema,
});
export type HostWorktreeBody = z.infer<typeof HostWorktreeBodySchema>;

export const GitLogQuerySchema = z.object({
  hostId: HostIdSchema,
  worktreeId: WorktreeIdSchema,
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type GitLogQuery = z.infer<typeof GitLogQuerySchema>;

export const GitShowQuerySchema = z.object({
  hostId: HostIdSchema,
  worktreeId: WorktreeIdSchema,
  sha: z.string().min(4),
});
export type GitShowQuery = z.infer<typeof GitShowQuerySchema>;

export const GitRevertBodySchema = z.object({
  hostId: HostIdSchema,
  worktreeId: WorktreeIdSchema,
  sha: z.string().min(4),
});
export type GitRevertBody = z.infer<typeof GitRevertBodySchema>;
