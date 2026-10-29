import type { WebhookPublic } from '@harnesys/contracts';
import type { WebhookRecord } from '../../domain/webhook/webhook.ts';
import { webhookEndpointFor } from '../schedules/schedule.helpers.ts';

export function toWebhookPublic(webhook: WebhookRecord): WebhookPublic {
  return {
    id: webhook.id,
    orgId: webhook.orgId,
    name: webhook.name,
    status: webhook.status,
    targetAgentId: webhook.targetAgentId,
    detail: webhook.detail,
    endpoint: webhook.endpoint || webhookEndpointFor(webhook.orgId, webhook.id),
    threadId: webhook.threadId,
    lastFiredAt: webhook.lastFiredAt,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
  };
}

export { webhookEndpointFor };
