import { Injectable } from '@harnesys/brix';
import type { UpdateWebhookBody, WebhookPublic } from '@harnesys/contracts';
import { AgentNotFoundException } from '../../domain/agent/agent.error.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { DeskEventsPort } from '../../domain/desk/desk-events.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import {
  WebhookNotFoundException,
  WebhookValidationException,
} from '../../domain/webhook/webhook.error.ts';
import type { WebhookPatch } from '../../domain/webhook/webhook.ts';
import { WebhookRepositoryPort } from '../../domain/webhook/webhook-repository.port.ts';
import { recordOwnerOnWrite } from '../threads/run-attribution.ts';
import { requireBindableWebhookThread } from './bind-webhook-thread.ts';
import { toDeskWebhookEvent, toWebhookPublic } from './webhook.helpers.ts';

export interface UpdateWebhookRequest {
  orgId: string;
  webhookId: string;
  actorUserId?: string | null;
  body: UpdateWebhookBody;
}

@Injectable()
export class UpdateWebhookUseCase {
  constructor(
    private readonly webhooks: WebhookRepositoryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly deskEvents: DeskEventsPort,
  ) {}

  execute(request: UpdateWebhookRequest): WebhookPublic {
    const current = this.webhooks.findById(request.orgId, request.webhookId);
    if (!current) {
      throw new WebhookNotFoundException(request.webhookId);
    }
    const patch: WebhookPatch = {
      updatedAt: new Date().toISOString(),
      createdByUserId: recordOwnerOnWrite(current.createdByUserId, request.actorUserId ?? null),
    };
    if (request.body.name !== undefined) {
      const name = request.body.name.trim();
      if (!name) {
        throw new WebhookValidationException('webhook name cannot be empty');
      }
      patch.name = name;
    }
    if (request.body.status !== undefined) {
      patch.status = request.body.status;
    }
    let nextAgentId = current.targetAgentId;
    if (request.body.targetAgentId !== undefined) {
      const agent = this.agents.findById(request.orgId, request.body.targetAgentId);
      if (!agent || agent.status === 'archived') {
        throw new AgentNotFoundException(request.body.targetAgentId);
      }
      patch.targetAgentId = agent.id;
      nextAgentId = agent.id;
    }
    if (request.body.detail !== undefined) {
      patch.detail = request.body.detail.trim();
    }
    if (request.body.threadId !== undefined) {
      const bound = requireBindableWebhookThread({
        threads: this.threads,
        webhooks: this.webhooks,
        orgId: request.orgId,
        agentId: nextAgentId,
        threadId: request.body.threadId,
        exceptWebhookId: current.id,
      });
      patch.threadId = bound.id;
    }
    const updated = this.webhooks.update(request.orgId, current.id, patch);
    if (patch.name && patch.name !== current.name) {
      this.threads.patch(request.orgId, updated.threadId, { title: patch.name });
    }
    this.deskEvents.emit(request.orgId, toDeskWebhookEvent(updated));
    return toWebhookPublic(updated);
  }
}
