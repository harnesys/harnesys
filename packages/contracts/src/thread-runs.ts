import { z } from 'zod';

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
    agentId: z.string().uuid().optional(),
  })
  .refine(
    (b) => !b.skills?.length || (b.text?.trim() ?? '') !== '' || (b.attachmentIds?.length ?? 0) > 0,
    { message: 'skills require text or attachments' },
  )
  .refine((b) => (b.worktreeId === undefined) === (b.sourceId === undefined), {
    message: 'sourceId and worktreeId must be provided together',
  });
export type SendThreadRunBody = z.infer<typeof SendThreadRunBodySchema>;

export const RunAcceptedStatusSchema = z.enum(['queued', 'waiting', 'failed']);
export type RunAcceptedStatus = z.infer<typeof RunAcceptedStatusSchema>;

export const RunAcceptedResponseSchema = z.object({
  status: RunAcceptedStatusSchema,
  runId: z.string().uuid(),
  threadId: z.string().uuid(),
  waitingForProfileId: z.string().optional(),
});
export type RunAcceptedResponse = z.infer<typeof RunAcceptedResponseSchema>;

export const StoredMessageReasonSchema = z.enum(['duplicate', 'deferred', 'no_responder']);
export type StoredMessageReason = z.infer<typeof StoredMessageReasonSchema>;

export const StoredMessageResponseSchema = z.object({
  status: z.literal('stored'),
  reason: StoredMessageReasonSchema,
  threadId: z.string().uuid(),
  threadSeq: z.number().int().nonnegative(),
});
export type StoredMessageResponse = z.infer<typeof StoredMessageResponseSchema>;

export const AcceptedRunResponseSchema = z.discriminatedUnion('status', [
  RunAcceptedResponseSchema,
  StoredMessageResponseSchema,
]);
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
