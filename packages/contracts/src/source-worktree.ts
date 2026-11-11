import { z } from 'zod';
import { OrgIdSchema } from './org-machine.ts';

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
