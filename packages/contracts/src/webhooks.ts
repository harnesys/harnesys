import { z } from 'zod';
import { OrgIdSchema } from './org-machine.ts';
import { ThreadPublicSchema } from './thread.ts';

export const WebhookStatusSchema = z.enum(['active', 'paused', 'failed']);
export type WebhookStatus = z.infer<typeof WebhookStatusSchema>;

export const WebhookPublicSchema = z.object({
  id: z.string().uuid(),
  orgId: OrgIdSchema,
  name: z.string().min(1),
  status: WebhookStatusSchema,
  targetAgentId: z.string().uuid(),
  detail: z.string(),
  endpoint: z.string().min(1),
  threadId: z.string().uuid(),
  lastFiredAt: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type WebhookPublic = z.infer<typeof WebhookPublicSchema>;

export const CreateWebhookBodySchema = z.object({
  name: z.string().trim().min(1),
  targetAgentId: z.string().uuid(),
  detail: z.string().trim().optional(),
  status: WebhookStatusSchema.optional(),
  threadId: z.string().uuid().optional(),
});
export type CreateWebhookBody = z.infer<typeof CreateWebhookBodySchema>;

export const UpdateWebhookBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  status: WebhookStatusSchema.optional(),
  targetAgentId: z.string().uuid().optional(),
  detail: z.string().trim().optional(),
  threadId: z.string().uuid().optional(),
});
export type UpdateWebhookBody = z.infer<typeof UpdateWebhookBodySchema>;

export const ListWebhooksResponseSchema = z.object({
  items: z.array(WebhookPublicSchema),
});
export type ListWebhooksResponse = z.infer<typeof ListWebhooksResponseSchema>;

export const CreateWebhookResponseSchema = z.object({
  webhook: WebhookPublicSchema,
  thread: ThreadPublicSchema,
});
export type CreateWebhookResponse = z.infer<typeof CreateWebhookResponseSchema>;

export const FireWebhookBodySchema = z.object({
  text: z.string().optional(),
});
export type FireWebhookBody = z.infer<typeof FireWebhookBodySchema>;

export const FireWebhookResponseSchema = z.object({
  runId: z.string().uuid().optional(),
  status: z.enum(['fired', 'queued-behind-active-run', 'paused']).optional(),
});
export type FireWebhookResponse = z.infer<typeof FireWebhookResponseSchema>;
