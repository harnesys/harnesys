import { z } from 'zod';
import { ExecutionProfileIdSchema } from './execution-profile.ts';
import { OrgIdSchema } from './org-machine.ts';

export const ThreadKindSchema = z.enum(['chat', 'schedule', 'webhook', 'issue', 'connector']);
export type ThreadKind = z.infer<typeof ThreadKindSchema>;

export const RunLifecycleStatusSchema = z.enum([
  'queued',
  'running',
  'needs_input',
  'waiting',
  'completed',
  'failed',
  'cancelled',
  'dead_lettered',
]);
export type RunLifecycleStatus = z.infer<typeof RunLifecycleStatusSchema>;

export const RunViaSchema = z.enum(['direct', 'agent']);
export type RunVia = z.infer<typeof RunViaSchema>;

export const ThreadActiveRunSchema = z.object({
  runId: z.string().uuid(),
  status: RunLifecycleStatusSchema,
  leaseExpired: z.boolean().optional(),
  waitingForProfileId: z.string().optional(),
  startedByUserId: z.string().optional(),
  startedByName: z.string().optional(),
  via: RunViaSchema.optional(),
  onNodeId: z.string().nullable().optional(),
  onNodeName: z.string().optional(),
});
export type ThreadActiveRun = z.infer<typeof ThreadActiveRunSchema>;

export const ThreadLastErrorSchema = z.object({
  runId: z.string().uuid(),
  message: z.string().min(1),
  at: z.string().min(1),
});
export type ThreadLastError = z.infer<typeof ThreadLastErrorSchema>;

export const ThreadSummarySchema = z.object({
  id: z.string().uuid(),
  orgId: OrgIdSchema,
  title: z.string().min(1),
  agentId: z.string().uuid(),
  originAgentId: z.string().uuid(),
  agentName: z.string(),
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
  bindingLocked: z.boolean(),
  activeRun: ThreadActiveRunSchema.nullable(),
  lastError: ThreadLastErrorSchema.nullable(),
});
export type ThreadSummary = z.infer<typeof ThreadSummarySchema>;

export const ThreadPublicSchema = ThreadSummarySchema.extend({
  events: z.array(z.unknown()),
  inheritedEventCount: z.number().int().nonnegative(),
});
export type ThreadPublic = z.infer<typeof ThreadPublicSchema>;

export const CreateThreadBodySchema = z.object({
  agentId: z.string().uuid(),
  title: z.string().trim().min(1).optional(),
  kind: ThreadKindSchema.optional(),
  parentThreadId: z.string().uuid().optional(),
  forkAt: z.string().trim().min(1).optional(),
});
export type CreateThreadBody = z.infer<typeof CreateThreadBodySchema>;

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
  })
  .refine((body) => body.runProfileId !== undefined || body.runDirectory !== undefined, {
    message: 'at least one of runProfileId or runDirectory is required',
  });
export type UpdateThreadBindingBody = z.infer<typeof UpdateThreadBindingBodySchema>;

export const ListThreadsResponseSchema = z.object({
  items: z.array(ThreadSummarySchema),
});
export type ListThreadsResponse = z.infer<typeof ListThreadsResponseSchema>;

export const SendThreadRunBodySchema = z
  .object({
    text: z.string().optional(),
    effort: z.string().optional(),
    mode: z.string().optional(),
    skills: z
      .array(z.string().regex(/^[A-Za-z0-9:_-]{1,120}$/))
      .max(10)
      .optional(),
    attachmentIds: z.array(z.string().uuid()).optional(),
    clientEventId: z.string().min(1).optional(),
    origin: z.string().min(1).optional(),
    correlationId: z.string().optional(),
    sourceId: z.string().uuid().optional(),
    worktreeId: z.string().uuid().optional(),
  })
  .refine(
    (b) => !b.skills?.length || (b.text?.trim() ?? '') !== '' || (b.attachmentIds?.length ?? 0) > 0,
    { message: 'skills require text or attachments' },
  )
  .refine((b) => (b.worktreeId === undefined) === (b.sourceId === undefined), {
    message: 'sourceId and worktreeId must be provided together',
  });
export type SendThreadRunBody = z.infer<typeof SendThreadRunBodySchema>;

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

export const AcceptedRunResponseSchema = z.object({
  runId: z.string().uuid(),
  threadId: z.string().uuid(),
  status: z.enum(['queued', 'waiting', 'failed']),
  waitingForProfileId: z.string().optional(),
});
export type AcceptedRunResponse = z.infer<typeof AcceptedRunResponseSchema>;

export const CancelRunResponseSchema = z.object({
  ok: z.literal(true),
});
export type CancelRunResponse = z.infer<typeof CancelRunResponseSchema>;

export const RetryRunResponseSchema = z.object({
  runId: z.string().uuid(),
});
export type RetryRunResponse = z.infer<typeof RetryRunResponseSchema>;

export const RespondRunBodySchema = z.object({
  askId: z.string().min(1),
  payload: z.unknown(),
  clientEventId: z.string().uuid().optional(),
});
export type RespondRunBody = z.infer<typeof RespondRunBodySchema>;

export const RejectRunBodySchema = z.object({
  askId: z.string().min(1),
  note: z.string().optional(),
  clientEventId: z.string().uuid().optional(),
});
export type RejectRunBody = z.infer<typeof RejectRunBodySchema>;

export const RespondRunResponseSchema = z.object({
  ok: z.literal(true),
});
export type RespondRunResponse = z.infer<typeof RespondRunResponseSchema>;

export const StreamRunEventsQuerySchema = z.object({
  fromSeq: z.coerce.number().int().nonnegative().optional(),
});
export type StreamRunEventsQuery = z.infer<typeof StreamRunEventsQuerySchema>;
