import { z } from 'zod';
import { BoardRuleInputSchema } from './boards.ts';
import {
  AddIssueCommentBodySchema,
  AddIssueDependencyBodySchema,
  AddIssueSourceAttachmentBodySchema,
  CreateIssueBoardBodySchema,
  CreateIssueBodySchema,
  CreateIssueLabelBodySchema,
  UpdateIssueBoardBodySchema,
  UpdateIssueBodySchema,
  UpdateIssueStatusBodySchema,
} from './issues.ts';
import { CreateScheduleBodySchema, UpdateScheduleBodySchema } from './schedules.ts';
import { CreateWebhookBodySchema, UpdateWebhookBodySchema } from './webhooks.ts';

export const WorkerOrgOperationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('issue.listBoards') }),
  z.object({ kind: z.literal('issue.listSources') }),
  z.object({
    kind: z.literal('issue.list'),
    boardId: z.string().uuid().optional(),
  }),
  z.object({ kind: z.literal('issue.get'), issueId: z.string().uuid() }),
  z.object({ kind: z.literal('issue.create'), body: CreateIssueBodySchema }),
  z.object({
    kind: z.literal('issue.update'),
    issueId: z.string().uuid(),
    body: UpdateIssueBodySchema,
  }),
  z.object({
    kind: z.literal('issue.status'),
    issueId: z.string().uuid(),
    body: UpdateIssueStatusBodySchema,
  }),
  z.object({ kind: z.literal('issue.nudge'), issueId: z.string().uuid() }),
  z.object({
    kind: z.literal('issue.comment'),
    issueId: z.string().uuid(),
    body: AddIssueCommentBodySchema,
  }),
  z.object({
    kind: z.literal('issue.addDependency'),
    issueId: z.string().uuid(),
    body: AddIssueDependencyBodySchema,
  }),
  z.object({
    kind: z.literal('issue.removeDependency'),
    issueId: z.string().uuid(),
    dependsOnIssueId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal('issue.addSourceAttachment'),
    issueId: z.string().uuid(),
    body: AddIssueSourceAttachmentBodySchema,
  }),
  z.object({ kind: z.literal('issue.listLabels') }),
  z.object({ kind: z.literal('issue.createLabel'), body: CreateIssueLabelBodySchema }),
  z.object({ kind: z.literal('issue.createBoard'), body: CreateIssueBoardBodySchema }),
  z.object({
    kind: z.literal('issue.updateBoard'),
    boardId: z.string().uuid(),
    body: UpdateIssueBoardBodySchema,
  }),
  z.object({ kind: z.literal('issue.deleteBoard'), boardId: z.string().uuid() }),
  z.object({ kind: z.literal('issue.deleteLabel'), labelId: z.string().uuid() }),
  z.object({
    kind: z.literal('issue.saveBoardRule'),
    boardId: z.string().uuid(),
    ruleId: z.string().uuid().optional(),
    body: BoardRuleInputSchema,
  }),
  z.object({
    kind: z.literal('issue.deleteBoardRule'),
    boardId: z.string().uuid(),
    ruleId: z.string().uuid(),
  }),
  z.object({ kind: z.literal('schedule.list') }),
  z.object({ kind: z.literal('schedule.create'), body: CreateScheduleBodySchema }),
  z.object({
    kind: z.literal('schedule.update'),
    scheduleId: z.string().uuid(),
    body: UpdateScheduleBodySchema,
  }),
  z.object({ kind: z.literal('schedule.remove'), scheduleId: z.string().uuid() }),
  z.object({ kind: z.literal('webhook.list') }),
  z.object({ kind: z.literal('webhook.create'), body: CreateWebhookBodySchema }),
  z.object({
    kind: z.literal('webhook.update'),
    webhookId: z.string().uuid(),
    body: UpdateWebhookBodySchema,
  }),
  z.object({ kind: z.literal('webhook.remove'), webhookId: z.string().uuid() }),
]);
export type WorkerOrgOperation = z.infer<typeof WorkerOrgOperationSchema>;

export const WorkerOrgOperationBodySchema = z.object({
  runId: z.string().uuid(),
  operationId: z.string().uuid(),
  operation: WorkerOrgOperationSchema,
});
export type WorkerOrgOperationBody = z.infer<typeof WorkerOrgOperationBodySchema>;

export const WorkerOrgOperationResponseSchema = z.object({
  operationId: z.string().uuid(),
  result: z.unknown(),
});
export type WorkerOrgOperationResponse = z.infer<typeof WorkerOrgOperationResponseSchema>;

export const FetchRunAttachmentBodySchema = z.object({
  runId: z.string().uuid(),
  threadId: z.string().uuid(),
  attachmentId: z.string().uuid(),
});
export type FetchRunAttachmentBody = z.infer<typeof FetchRunAttachmentBodySchema>;

export const RemoteRunAttachmentMetaSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  mediaType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  kind: z.enum(['image', 'audio', 'video', 'file']),
});
export type RemoteRunAttachmentMeta = z.infer<typeof RemoteRunAttachmentMetaSchema>;
