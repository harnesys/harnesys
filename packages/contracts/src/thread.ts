import { z } from 'zod';
import { ExecutionProfileIdSchema } from './execution-profile.ts';
import { OrgIdSchema } from './org-machine.ts';
import { ThreadActiveRunSchema, ThreadLastErrorSchema } from './thread-runs.ts';
import { WorkspaceRefSchema } from './workspace-ref.ts';

export const ThreadKindSchema = z.enum(['chat', 'group', 'schedule', 'webhook', 'issue']);
export type ThreadKind = z.infer<typeof ThreadKindSchema>;

export const ThreadHistoryModeSchema = z.enum(['full', 'none', 'last']);
export type ThreadHistoryMode = z.infer<typeof ThreadHistoryModeSchema>;

export const ThreadResponderModeSchema = z.enum(['auto', 'mention']);
export type ThreadResponderMode = z.infer<typeof ThreadResponderModeSchema>;

export const ThreadContextFileSchema = z.object({
  path: z.string().min(1).max(512),
  enabled: z.boolean(),
});
export type ThreadContextFile = z.infer<typeof ThreadContextFileSchema>;

export const ThreadContextFilesSchema = z.array(ThreadContextFileSchema).max(20);

export const ThreadPolicySchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]).default(2),
  historyMode: ThreadHistoryModeSchema.optional(),
  historyLast: z.number().int().min(0).max(100).optional(),
  historyFromRunId: z.string().uuid().optional(),
  mentionGating: z.boolean().optional(),
  responderMode: ThreadResponderModeSchema.optional(),
  contextFiles: ThreadContextFilesSchema.optional(),
});
export type ThreadPolicy = z.infer<typeof ThreadPolicySchema>;

export const ThreadMemberSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});
export type ThreadMember = z.infer<typeof ThreadMemberSchema>;

export const ThreadParticipantRoleSchema = z.enum(['member', 'blocked']);
export type ThreadParticipantRole = z.infer<typeof ThreadParticipantRoleSchema>;

export const ThreadParticipantSchema = z.object({
  id: z.string().uuid(),
  provider: z.string().min(1),
  providerUserId: z.string().min(1),
  displayName: z.string(),
  username: z.string().nullable(),
  role: ThreadParticipantRoleSchema,
  lastSeenAt: z.string().nullable(),
});
export type ThreadParticipant = z.infer<typeof ThreadParticipantSchema>;

export const ThreadSummarySchema = z.object({
  id: z.string().uuid(),
  orgId: OrgIdSchema,
  title: z.string().min(1),
  agentId: z.string().uuid(),
  members: z.array(ThreadMemberSchema).min(1),
  autoReplyAgentId: z.string().uuid().nullable(),
  policy: ThreadPolicySchema,
  participants: z.array(ThreadParticipantSchema),
  kind: ThreadKindSchema,
  issueId: z.string().uuid().nullable(),
  parentThreadId: z.string().uuid().nullable(),
  forkAt: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  lastReadAt: z.string().min(1),
  unread: z.boolean(),
  pinned: z.boolean(),
  runMode: z.string().optional(),
  runProfileId: z.string().nullable(),
  runDirectory: z.string().nullable(),
  workspaceRef: WorkspaceRefSchema.nullable(),
  bindingLocked: z.boolean(),
  activeRun: ThreadActiveRunSchema.nullable(),
  lastError: ThreadLastErrorSchema.nullable(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
});
export type ThreadSummary = z.infer<typeof ThreadSummarySchema>;

export const ThreadPublicSchema = ThreadSummarySchema.extend({
  events: z.array(z.unknown()),
  inheritedEventCount: z.number().int().nonnegative(),
});
export type ThreadPublic = z.infer<typeof ThreadPublicSchema>;

export const CreateThreadBodySchema = z.object({
  agentId: z.string().uuid(),
  agentIds: z.array(z.string().uuid()).max(8).optional(),
  participantUserIds: z.array(z.string().uuid()).max(20).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  icon: z.string().trim().min(1).max(64).optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  kind: ThreadKindSchema.optional(),
  parentThreadId: z.string().uuid().optional(),
  forkAt: z.string().trim().min(1).optional(),
  policy: z
    .object({
      historyMode: ThreadHistoryModeSchema.optional(),
      historyLast: z.number().int().min(0).max(100).optional(),
      historyFromRunId: z.string().uuid().optional(),
      responderMode: ThreadResponderModeSchema.optional(),
    })
    .optional(),
});
export type CreateThreadBody = z.infer<typeof CreateThreadBodySchema>;

export const UpdateThreadMetaBodySchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    icon: z.string().trim().min(1).max(64).nullable().optional(),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable()
      .optional(),
  })
  .refine(
    (body) => body.title !== undefined || body.icon !== undefined || body.color !== undefined,
    {
      message: 'at least one of title, icon or color is required',
    },
  );
export type UpdateThreadMetaBody = z.infer<typeof UpdateThreadMetaBodySchema>;

export const AddThreadAgentBodySchema = z.object({
  agentId: z.string().uuid(),
});
export type AddThreadAgentBody = z.infer<typeof AddThreadAgentBodySchema>;

export const AddThreadParticipantBodySchema = z.object({
  userId: z.string().uuid(),
});
export type AddThreadParticipantBody = z.infer<typeof AddThreadParticipantBodySchema>;

export const UpdateThreadPolicyBodySchema = z.object({
  autoReplyAgentId: z.string().uuid().nullable().optional(),
  mentionGating: z.boolean().optional(),
  responderMode: ThreadResponderModeSchema.optional(),
  historyMode: ThreadHistoryModeSchema.optional(),
  historyLast: z.number().int().min(0).max(100).nullable().optional(),
  historyFromRunId: z.string().uuid().nullable().optional(),
  contextFiles: ThreadContextFilesSchema.nullable().optional(),
});
export type UpdateThreadPolicyBody = z.infer<typeof UpdateThreadPolicyBodySchema>;

export const SetThreadParticipantRoleBodySchema = z.object({
  role: ThreadParticipantRoleSchema,
});
export type SetThreadParticipantRoleBody = z.infer<typeof SetThreadParticipantRoleBodySchema>;

export const UpdateThreadBindingBodySchema = z
  .object({
    runProfileId: ExecutionProfileIdSchema.nullable().optional(),
    runDirectory: z
      .string()
      .trim()
      .min(1)
      .refine((value) => value.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(value), {
        message: 'runDirectory must be an absolute path',
      })
      .nullable()
      .optional(),
    workspaceRef: WorkspaceRefSchema.nullable().optional(),
  })
  .refine(
    (body) =>
      body.runProfileId !== undefined ||
      body.runDirectory !== undefined ||
      body.workspaceRef !== undefined,
    { message: 'at least one of runProfileId, runDirectory or workspaceRef is required' },
  )
  .refine((body) => !(body.runDirectory != null && body.workspaceRef != null), {
    message: 'runDirectory and workspaceRef are mutually exclusive',
  });
export type UpdateThreadBindingBody = z.infer<typeof UpdateThreadBindingBodySchema>;

export const ListThreadsResponseSchema = z.object({
  items: z.array(ThreadSummarySchema),
});
export type ListThreadsResponse = z.infer<typeof ListThreadsResponseSchema>;

export const AttachmentKindSchema = z.enum(['image', 'audio', 'video', 'file']);
export type AttachmentKind = z.infer<typeof AttachmentKindSchema>;

export const ThreadAttachmentSchema = z.object({
  id: z.string().uuid(),
  kind: AttachmentKindSchema,
  name: z.string(),
  mediaType: z.string(),
  path: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type ThreadAttachment = z.infer<typeof ThreadAttachmentSchema>;

export const ListThreadAttachmentsResponseSchema = z.object({
  items: z.array(ThreadAttachmentSchema),
});
export type ListThreadAttachmentsResponse = z.infer<typeof ListThreadAttachmentsResponseSchema>;

export const MAX_THREAD_TREE_ENTRIES = 500;

export const ThreadFileEntryTypeSchema = z.enum(['file', 'dir']);
export type ThreadFileEntryType = z.infer<typeof ThreadFileEntryTypeSchema>;

export const ThreadFileEntrySchema = z.object({
  name: z.string().min(1),
  path: z.string(),
  type: ThreadFileEntryTypeSchema,
  size: z.number().int().nonnegative().optional(),
  count: z.number().int().nonnegative().optional(),
});
export type ThreadFileEntry = z.infer<typeof ThreadFileEntrySchema>;

export const ThreadFilesTreeResponseSchema = z.object({
  subPath: z.string(),
  entries: z.array(ThreadFileEntrySchema),
  truncated: z.boolean().optional(),
});
export type ThreadFilesTreeResponse = z.infer<typeof ThreadFilesTreeResponseSchema>;

export const ThreadFilesQuerySchema = z.object({
  subPath: z.string().default('sandbox'),
});
export type ThreadFilesQuery = z.infer<typeof ThreadFilesQuerySchema>;

export const ThreadFilePathQuerySchema = z.object({
  path: z.string().min(1),
});
export type ThreadFilePathQuery = z.infer<typeof ThreadFilePathQuerySchema>;
