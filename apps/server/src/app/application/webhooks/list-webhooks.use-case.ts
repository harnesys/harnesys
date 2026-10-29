import { Injectable } from '@harnesys/brix';
import type { ListWebhooksResponse } from '@harnesys/contracts';
import { WebhookRepositoryPort } from '../../domain/webhook/webhook-repository.port.ts';
import { toWebhookPublic } from './webhook.helpers.ts';

export interface ListWebhooksRequest {
  orgId: string;
}

@Injectable()
export class ListWebhooksUseCase {
  constructor(private readonly webhooks: WebhookRepositoryPort) {}

  execute(request: ListWebhooksRequest): ListWebhooksResponse {
    return {
      items: this.webhooks.listByOrg(request.orgId).map(toWebhookPublic),
    };
  }
}
