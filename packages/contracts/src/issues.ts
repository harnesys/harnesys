import { z } from 'zod';
import { BoardRuleSchema, BoardStatusSchema, BoardTemplateKeySchema } from './boards.ts';

export { ExecutionProfileIdSchema } from './execution-profile.ts';

export const IssueBoardStatusSchema = z.enum(['active', 'archived']);
export type IssueBoardStatus = z.infer<typeof IssueBoardStatusSchema>;

export const IssueTypeSchema = z.enum([
  'task',
  'bug',
  'research',
  'feature',
  'improvement',
  'review',
]);
export type IssueType = z.infer<typeof IssueTypeSchema>;

export const IssuePrioritySchema = z.number().int().min(1).max(4);
export type IssuePriority = z.infer<typeof IssuePrioritySchema>;

export const IssueDependencyTypeSchema = z.enum(['blocks', 'relates', 'duplicate']);
export type IssueDependencyType = z.infer<typeof IssueDependencyTypeSchema>;

export const IssueCommentAuthorTypeSchema = z.enum(['human', 'agent']);
export type IssueCommentAuthorType = z.infer<typeof IssueCommentAuthorTypeSchema>;

export const IssueAttachmentKindSchema = z.enum(['file', 'source']);
export type IssueAttachmentKind = z.infer<typeof IssueAttachmentKindSchema>;

export const IssueBoardPublicSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string(),
  color: z.string(),
  icon: z.string(),
  status: IssueBoardStatusSchema,
  archivedAt: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  statuses: z.array(BoardStatusSchema),
  rules: z.array(BoardRuleSchema),
});
export type IssueBoardPublic = z.infer<typeof IssueBoardPublicSchema>;

export const IssueFireReasonSchema = z.enum(['rule', 'override']);
export type IssueFireReason = z.infer<typeof IssueFireReasonSchema>;

export const IssueFireOutcomeSchema = z.enum(['fired', 'thread-busy', 'failed']);
export type IssueFireOutcome = z.infer<typeof IssueFireOutcomeSchema>;

export const IssueWorktreeRefSchema = z.object({
  id: z.string().uuid(),
  branch: z.string().min(1),
  path: z.string().min(1),
});
export type IssueWorktreeRef = z.infer<typeof IssueWorktreeRefSchema>;

export const IssueFireTrailEntrySchema = z.object({
  agentId: z.string().uuid(),
  statusKey: z.string().min(1),
  reason: IssueFireReasonSchema,
  outcome: IssueFireOutcomeSchema.optional(),
  error: z.string().optional(),
  at: z.string().min(1),
});
export type IssueFireTrailEntry = z.infer<typeof IssueFireTrailEntrySchema>;

export const IssuePublicSchema = z.object({
  id: z.string().uuid(),
  boardId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string(),
  statusKey: z.string().min(1),
  priority: IssuePrioritySchema,
  type: IssueTypeSchema,
  assigneeAgentId: z.string().uuid().nullable(),
  labels: z.array(z.string().uuid()),
  parentIssueId: z.string().uuid().nullable(),
  dueDate: z.string().nullable(),
  closedAt: z.string().nullable(),
  fireTrail: z.array(IssueFireTrailEntrySchema),
  sourceId: z.string().uuid().nullable(),
  branch: z.string().trim().min(1).nullable(),
  worktreeOnStatus: z.string().nullable(),
  worktree: IssueWorktreeRefSchema.nullable().default(null),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type IssuePublic = z.infer<typeof IssuePublicSchema>;

export const IssueCommentPublicSchema = z.object({
  id: z.string().uuid(),
  issueId: z.string().uuid(),
  authorType: IssueCommentAuthorTypeSchema,
  authorAgentId: z.string().uuid().nullable(),
  body: z.string(),
  createdAt: z.string().min(1),
});
export type IssueCommentPublic = z.infer<typeof IssueCommentPublicSchema>;

export const IssueDependencyPublicSchema = z.object({
  issueId: z.string().uuid(),
  dependsOnIssueId: z.string().uuid(),
  type: IssueDependencyTypeSchema,
  createdAt: z.string().min(1),
});
export type IssueDependencyPublic = z.infer<typeof IssueDependencyPublicSchema>;

export const IssueAttachmentPublicSchema = z.object({
  id: z.string().uuid(),
  issueId: z.string().uuid(),
  kind: IssueAttachmentKindSchema,
  name: z.string(),
  mediaType: z.string(),
  kindMedia: z.enum(['image', 'audio', 'video', 'file']),
  sizeBytes: z.number().int().min(0),
  path: z.string().nullable(),
  sourceId: z.string().nullable(),
  sourcePath: z.string().nullable(),
  createdAt: z.string().min(1),
});
export type IssueAttachmentPublic = z.infer<typeof IssueAttachmentPublicSchema>;

export const IssueLabelPublicSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  color: z.string(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type IssueLabelPublic = z.infer<typeof IssueLabelPublicSchema>;

export const CreateIssueBoardBodySchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().trim().optional(),
    color: z.string().trim().optional(),
    icon: z.string().trim().optional(),
    template: BoardTemplateKeySchema.optional(),
    statuses: z.array(BoardStatusSchema).min(2).optional(),
  })
  .refine((body) => (body.template === undefined) !== (body.statuses === undefined), {
    message: 'provide either template or statuses',
    path: ['template'],
  });
export type CreateIssueBoardBody = z.infer<typeof CreateIssueBoardBodySchema>;

export const UpdateIssueBoardBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  color: z.string().trim().optional(),
  icon: z.string().trim().optional(),
});
export type UpdateIssueBoardBody = z.infer<typeof UpdateIssueBoardBodySchema>;

export const CreateIssueBodySchema = z.object({
  boardId: z.string().uuid(),
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
  statusKey: z.string().min(1).optional(),
  priority: IssuePrioritySchema.optional(),
  type: IssueTypeSchema.optional(),
  labels: z.array(z.string().uuid()).optional(),
  assigneeAgentId: z.string().uuid().nullable().optional(),
  parentIssueId: z.string().uuid().optional(),
  dueDate: z.string().nullable().optional(),
  dependencies: z
    .array(
      z.object({
        dependsOnIssueId: z.string().uuid(),
        type: IssueDependencyTypeSchema.optional(),
      }),
    )
    .optional(),
  sourceId: z.string().uuid().optional(),
  branch: z.string().trim().min(1).optional(),
  worktreeOnStatus: z.string().trim().min(1).optional(),
});
export type CreateIssueBody = z.infer<typeof CreateIssueBodySchema>;

export const UpdateIssueBodySchema = z.object({
  boardId: z.string().uuid().optional(),
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  priority: IssuePrioritySchema.optional(),
  type: IssueTypeSchema.optional(),
  labels: z.array(z.string().uuid()).optional(),
  assigneeAgentId: z.string().uuid().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  sourceId: z.string().uuid().nullable().optional(),
  branch: z.string().trim().min(1).nullable().optional(),
  worktreeOnStatus: z.string().trim().min(1).nullable().optional(),
});
export type UpdateIssueBody = z.infer<typeof UpdateIssueBodySchema>;

export const UpdateIssueStatusBodySchema = z.object({
  statusKey: z.string().min(1),
  assigneeAgentId: z.string().uuid().nullable().optional(),
});
export type UpdateIssueStatusBody = z.infer<typeof UpdateIssueStatusBodySchema>;

export const AddIssueCommentBodySchema = z.object({
  body: z.string().trim().min(1),
});
export type AddIssueCommentBody = z.infer<typeof AddIssueCommentBodySchema>;

export const AddIssueDependencyBodySchema = z.object({
  dependsOnIssueId: z.string().uuid(),
  type: IssueDependencyTypeSchema.optional(),
});
export type AddIssueDependencyBody = z.infer<typeof AddIssueDependencyBodySchema>;

export const AddIssueSourceAttachmentBodySchema = z.object({
  sourceId: z.string().min(1),
  sourcePath: z.string().min(1),
  name: z.string().trim().optional(),
});
export type AddIssueSourceAttachmentBody = z.infer<typeof AddIssueSourceAttachmentBodySchema>;

export const LabelColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected #rrggbb');

export const CreateIssueLabelBodySchema = z.object({
  title: z.string().trim().min(1),
  color: LabelColorSchema.optional(),
});
export type CreateIssueLabelBody = z.infer<typeof CreateIssueLabelBodySchema>;

export const UpdateIssueLabelBodySchema = z.object({
  title: z.string().trim().min(1).optional(),
  color: LabelColorSchema.optional(),
});
export type UpdateIssueLabelBody = z.infer<typeof UpdateIssueLabelBodySchema>;

export const ListIssueBoardsResponseSchema = z.object({
  items: z.array(IssueBoardPublicSchema),
});
export type ListIssueBoardsResponse = z.infer<typeof ListIssueBoardsResponseSchema>;

export const GetIssueBoardResponseSchema = z.object({
  board: IssueBoardPublicSchema,
});
export type GetIssueBoardResponse = z.infer<typeof GetIssueBoardResponseSchema>;

export const ListIssuesQuerySchema = z.object({
  boardId: z.string().uuid().optional(),
});
export type ListIssuesQuery = z.infer<typeof ListIssuesQuerySchema>;

export const IssueListItemSchema = IssuePublicSchema.extend({
  attachmentCount: z.number().int().min(0),
  commentCount: z.number().int().min(0),
});
export type IssueListItem = z.infer<typeof IssueListItemSchema>;

export const ListIssuesResponseSchema = z.object({
  items: z.array(IssueListItemSchema),
});
export type ListIssuesResponse = z.infer<typeof ListIssuesResponseSchema>;

export const CreateIssueResponseSchema = z.object({
  issue: IssuePublicSchema,
});
export type CreateIssueResponse = z.infer<typeof CreateIssueResponseSchema>;

export const CreateIssueBoardResponseSchema = z.object({
  board: IssueBoardPublicSchema,
});
export type CreateIssueBoardResponse = z.infer<typeof CreateIssueBoardResponseSchema>;

export const ListIssueLabelsResponseSchema = z.object({
  items: z.array(IssueLabelPublicSchema),
});
export type ListIssueLabelsResponse = z.infer<typeof ListIssueLabelsResponseSchema>;

export const ListIssueCommentsResponseSchema = z.object({
  items: z.array(IssueCommentPublicSchema),
});
export type ListIssueCommentsResponse = z.infer<typeof ListIssueCommentsResponseSchema>;
