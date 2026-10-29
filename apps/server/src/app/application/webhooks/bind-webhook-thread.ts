import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { WebhookValidationException } from '../../domain/webhook/webhook.error.ts';
import { WebhookRepositoryPort } from '../../domain/webhook/webhook-repository.port.ts';

export function requireBindableWebhookThread(input: {
  threads: ThreadRepositoryPort;
  webhooks: WebhookRepositoryPort;
  orgId: string;
  agentId: string;
  threadId: string;
  exceptWebhookId?: string;
}): ThreadRecord {
  const threadId = input.threadId.trim();
  if (!threadId) {
    throw new WebhookValidationException('threadId cannot be empty');
  }
  const thread = input.threads.findById(input.orgId, threadId);
  if (!thread || thread.orgId !== input.orgId) {
    throw new WebhookValidationException('thread not found');
  }
  if (thread.agentId !== input.agentId) {
    throw new WebhookValidationException('thread belongs to another agent');
  }
  const occupied = input.webhooks.findByThreadId(input.orgId, thread.id);
  if (occupied && occupied.id !== input.exceptWebhookId) {
    throw new WebhookValidationException('thread already has a webhook');
  }
  return thread;
}
