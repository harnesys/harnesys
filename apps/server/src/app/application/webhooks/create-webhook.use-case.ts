import { Injectable } from '@harnesys/brix';
import type { CreateWebhookBody, CreateWebhookResponse } from '@harnesys/contracts';
import { AgentNotFoundException } from '../../domain/agent/agent.error.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { DeskEventsPort } from '../../domain/desk/desk-events.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { WebhookRepositoryPort } from '../../domain/webhook/webhook-repository.port.ts';
import { toThreadPublic } from '../threads/thread.helpers.ts';
import { requireBindableWebhookThread } from './bind-webhook-thread.ts';
import { toDeskWebhookEvent, toWebhookPublic, webhookEndpointFor } from './webhook.helpers.ts';

export interface CreateWebhookRequest {
  orgId: string;
  actorUserId?: string | null;
  body: CreateWebhookBody;
}

@Injectable()
export class CreateWebhookUseCase {
  constructor(
    private readonly webhooks: WebhookRepositoryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly deskEvents: DeskEventsPort,
  ) {}

  execute(request: CreateWebhookRequest): CreateWebhookResponse {
    const name = request.body.name.trim();
    const agent = this.agents.findById(request.orgId, request.body.targetAgentId);
    if (!agent || agent.status === 'archived') {
      throw new AgentNotFoundException(request.body.targetAgentId);
    }
    const status = request.body.status ?? 'active';
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const existingThread = request.body.threadId
      ? requireBindableWebhookThread({
          threads: this.threads,
          webhooks: this.webhooks,
          orgId: request.orgId,
          agentId: agent.id,
          threadId: request.body.threadId,
        })
      : undefined;
    const thread =
      existingThread ??
      this.threads.insert({
        id: crypto.randomUUID(),
        orgId: request.orgId,
        agentId: agent.id,
        originAgentId: agent.id,
        title: name,
        kind: 'webhook',
        parentThreadId: null,
        forkAt: null,
        inheritedEventCount: 0,
        metadata: {},
        runProfileId: null,
        runDirectory: null,
        createdAt: now,
        updatedAt: now,
        lastReadAt: now,
      });
    const webhook = this.webhooks.insert({
      id,
      orgId: request.orgId,
      name,
      status,
      targetAgentId: agent.id,
      detail: request.body.detail?.trim() || '',
      endpoint: webhookEndpointFor(request.orgId, id),
      threadId: thread.id,
      lastFiredAt: null,
      createdByUserId: request.actorUserId ?? null,
      createdAt: now,
      updatedAt: now,
    });
    this.deskEvents.emit(request.orgId, toDeskWebhookEvent(webhook));
    return {
      webhook: toWebhookPublic(webhook),
      thread: toThreadPublic({
        thread,
        agentName: agent.name,
        active: null,
        events: [],
        inheritedEventCount: 0,
      }),
    };
  }
}
