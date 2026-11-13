import { Injectable } from '@harnesys/brix';
import type { UpdateWebhookBody, WebhookPublic } from '@harnesys/contracts';
import { TriggerInstanceRepositoryPort } from '../../domain/addons/ports/trigger-instance-repository.port.ts';
import { AgentNotFoundException } from '../../domain/agent/agent.error.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { DeskEventsPort } from '../../domain/desk/desk-events.port.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import { assertValidModePreset } from '../../domain/mode-presets/validate-mode.ts';
import { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import {
  WebhookNotFoundException,
  WebhookValidationException,
} from '../../domain/webhook/webhook.error.ts';
import type { WebhookPatch } from '../../domain/webhook/webhook.ts';
import { WebhookRepositoryPort } from '../../domain/webhook/webhook-repository.port.ts';
import { insertDedicatedThread } from '../threads/create-dedicated-thread.ts';
import { DeleteThreadUseCase } from '../threads/delete-thread.use-case.ts';
import { recordOwnerOnWrite } from '../threads/run-attribution.ts';
import { requireBindableWebhookThread } from './bind-webhook-thread.ts';
import { toDeskWebhookEvent, toWebhookPublic } from './webhook.helpers.ts';

function requireWebhookName(rawName: string): string {
  const name = rawName.trim();
  if (!name) {
    throw new WebhookValidationException('webhook name cannot be empty');
  }
  return name;
}

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
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly schedules: ScheduleRepositoryPort,
    private readonly triggerInstances: TriggerInstanceRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly deskEvents: DeskEventsPort,
    private readonly modes: ModePresetRegistryPort,
    private readonly deleteThread: DeleteThreadUseCase,
  ) {}

  async execute(request: UpdateWebhookRequest): Promise<WebhookPublic> {
    const current = this.webhooks.findById(request.orgId, request.webhookId);
    if (!current) {
      throw new WebhookNotFoundException(request.webhookId);
    }
    assertValidModePreset(this.modes, request.orgId, request.body.mode);
    const patch: WebhookPatch = {
      updatedAt: new Date().toISOString(),
      createdByUserId: recordOwnerOnWrite(current.createdByUserId, request.actorUserId ?? null),
    };
    if (request.body.name !== undefined) {
      patch.name = requireWebhookName(request.body.name);
    }
    if (request.body.status !== undefined) {
      patch.status = request.body.status;
    }
    const nextAgentId = this.resolveNextAgentId(request, current);
    if (nextAgentId !== current.targetAgentId) {
      patch.targetAgentId = nextAgentId;
    }
    if (request.body.detail !== undefined) {
      patch.detail = request.body.detail.trim();
    }
    if (request.body.mode !== undefined) {
      patch.mode = request.body.mode;
    }
    if (request.body.threadId !== undefined) {
      patch.threadId = this.resolveThreadBind(
        request,
        request.body.threadId,
        current,
        nextAgentId,
        patch.name,
      );
    }
    const updated = this.webhooks.update(request.orgId, current.id, patch);
    if (patch.name && patch.name !== current.name) {
      this.threads.patch(request.orgId, updated.threadId, { title: patch.name });
    }
    if (request.body.threadId !== undefined && updated.threadId !== current.threadId) {
      await this.deleteAbandonedThread(request.orgId, current.threadId);
    }
    this.deskEvents.emit(request.orgId, toDeskWebhookEvent(updated));
    return toWebhookPublic(updated);
  }

  private resolveNextAgentId(
    request: UpdateWebhookRequest,
    current: { targetAgentId: string },
  ): string {
    if (request.body.targetAgentId === undefined) {
      return current.targetAgentId;
    }
    const agent = this.agents.findById(request.orgId, request.body.targetAgentId);
    if (!agent || agent.status === 'archived') {
      throw new AgentNotFoundException(request.body.targetAgentId);
    }
    return agent.id;
  }

  private resolveThreadBind(
    request: UpdateWebhookRequest,
    requestedThreadId: string | null,
    current: { id: string; name: string; threadId: string },
    nextAgentId: string,
    nextName: string | undefined,
  ): string {
    if (requestedThreadId === null) {
      return insertDedicatedThread(
        { threads: this.threads, threadAgents: this.threadAgents },
        {
          orgId: request.orgId,
          agentId: nextAgentId,
          title: nextName ?? current.name,
          kind: 'webhook',
        },
      ).id;
    }
    return requireBindableWebhookThread({
      threads: this.threads,
      threadAgents: this.threadAgents,
      webhooks: this.webhooks,
      schedules: this.schedules,
      triggerInstances: this.triggerInstances,
      orgId: request.orgId,
      agentId: nextAgentId,
      threadId: requestedThreadId,
      exceptWebhookId: current.id,
    }).id;
  }

  private async deleteAbandonedThread(orgId: string, threadId: string): Promise<void> {
    const abandoned = this.threads.findById(orgId, threadId);
    if (abandoned?.kind === 'webhook') {
      await this.deleteThread.execute({ orgId, threadId: abandoned.id });
    }
  }
}
