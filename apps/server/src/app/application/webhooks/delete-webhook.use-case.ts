import { Injectable } from '@harnesys/brix';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { WebhookNotFoundException } from '../../domain/webhook/webhook.error.ts';
import { WebhookRepositoryPort } from '../../domain/webhook/webhook-repository.port.ts';

export interface DeleteWebhookRequest {
  orgId: string;
  webhookId: string;
}

@Injectable()
export class DeleteWebhookUseCase {
  constructor(
    private readonly webhooks: WebhookRepositoryPort,
    private readonly threads: ThreadRepositoryPort,
  ) {}

  execute(request: DeleteWebhookRequest): void {
    const current = this.webhooks.findById(request.orgId, request.webhookId);
    if (!current) {
      throw new WebhookNotFoundException(request.webhookId);
    }
    this.webhooks.delete(request.orgId, current.id);
    const thread = this.threads.findById(request.orgId, current.threadId);
    if (thread?.kind === 'webhook') {
      this.threads.delete(request.orgId, thread.id);
    }
  }
}
