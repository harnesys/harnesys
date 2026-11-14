import { Injectable } from '@harnesys/brix';
import type { SchedulePublic, UpdateScheduleBody } from '@harnesys/contracts';
import { TriggerInstanceRepositoryPort } from '../../domain/addons/ports/trigger-instance-repository.port.ts';
import { AgentNotFoundException } from '../../domain/agent/agent.error.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { DeskEventsPort } from '../../domain/desk/desk-events.port.ts';
import {
  ScheduleNotFoundException,
  ScheduleValidationException,
} from '../../domain/schedule/schedule.error.ts';
import type { SchedulePatch, ScheduleRecord } from '../../domain/schedule/schedule.ts';
import { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { WebhookRepositoryPort } from '../../domain/webhook/webhook-repository.port.ts';
import { insertDedicatedThread } from '../threads/create-dedicated-thread.ts';
import { DeleteThreadUseCase } from '../threads/delete-thread.use-case.ts';
import { recordOwnerOnWrite } from '../threads/run-attribution.ts';
import { requireBindableScheduleThread } from './bind-schedule-thread.ts';
import { isValidCron, nextCronRunAt } from './cron-next.ts';
import { toDeskScheduleEvent, toSchedulePublic } from './schedule.helpers.ts';

export interface UpdateScheduleRequest {
  orgId: string;
  scheduleId: string;
  actorUserId?: string | null;
  body: UpdateScheduleBody;
}

@Injectable()
export class UpdateScheduleUseCase {
  constructor(
    private readonly schedules: ScheduleRepositoryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly webhooks: WebhookRepositoryPort,
    private readonly triggerInstances: TriggerInstanceRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly orgSettings: OrgSettingsPort,
    private readonly deskEvents: DeskEventsPort,
    private readonly deleteThread: DeleteThreadUseCase,
  ) {}

  async execute(request: UpdateScheduleRequest): Promise<SchedulePublic> {
    const current = this.schedules.findById(request.orgId, request.scheduleId);
    if (!current) {
      throw new ScheduleNotFoundException(request.scheduleId);
    }
    const patch = basePatch(request.body);
    patch.createdByUserId = recordOwnerOnWrite(
      current.createdByUserId,
      request.actorUserId ?? null,
    );
    const rename = applyName(patch, request.body, current.name);
    const nextAgentId = applyAgent(patch, request.orgId, request.body, current, this.agents);
    applyCronAndMode(patch, request.body, this.orgSettings.get(request.orgId).timezone);
    applyMissPolicy(patch, request.body);
    applyThreadBind(patch, {
      orgId: request.orgId,
      body: request.body,
      currentId: current.id,
      agentId: nextAgentId,
      title: rename ?? current.name,
      threads: this.threads,
      threadAgents: this.threadAgents,
      schedules: this.schedules,
      webhooks: this.webhooks,
      triggerInstances: this.triggerInstances,
    });
    const updated = this.schedules.update(request.orgId, current.id, patch);
    if (rename) {
      this.threads.patch(request.orgId, updated.threadId, { title: rename });
    }
    if (request.body.threadId !== undefined && updated.threadId !== current.threadId) {
      await this.deleteAbandonedThread(request.orgId, current.threadId);
    }
    this.deskEvents.emit(request.orgId, toDeskScheduleEvent(updated));
    return toSchedulePublic(updated);
  }

  private async deleteAbandonedThread(orgId: string, threadId: string): Promise<void> {
    const abandoned = this.threads.findById(orgId, threadId);
    if (abandoned?.kind === 'schedule') {
      await this.deleteThread.execute({ orgId, threadId: abandoned.id });
    }
  }
}

function basePatch(body: UpdateScheduleBody): SchedulePatch {
  const patch: SchedulePatch = { updatedAt: new Date().toISOString() };
  if (body.status !== undefined) {
    patch.status = body.status;
  }
  if (body.detail !== undefined) {
    patch.detail = body.detail.trim();
  }
  return patch;
}

function applyName(
  patch: SchedulePatch,
  body: UpdateScheduleBody,
  currentName: string,
): string | null {
  if (body.name === undefined) {
    return null;
  }
  const name = body.name.trim();
  if (!name) {
    throw new ScheduleValidationException('schedule name cannot be empty');
  }
  patch.name = name;
  return name !== currentName ? name : null;
}

function applyAgent(
  patch: SchedulePatch,
  orgId: string,
  body: UpdateScheduleBody,
  current: ScheduleRecord,
  agents: AgentRegistryPort,
): string {
  if (body.targetAgentId === undefined) {
    return current.targetAgentId;
  }
  const agent = agents.findById(orgId, body.targetAgentId);
  if (!agent || agent.status === 'archived') {
    throw new AgentNotFoundException(body.targetAgentId);
  }
  patch.targetAgentId = agent.id;
  return agent.id;
}

function applyCronAndMode(patch: SchedulePatch, body: UpdateScheduleBody, timezone: string): void {
  if (body.cron !== undefined) {
    const cron = body.cron.trim();
    if (!isValidCron(cron, timezone)) {
      throw new ScheduleValidationException('invalid cron');
    }
    patch.cron = cron;
    patch.nextRunAt = nextCronRunAt(cron, new Date(), timezone);
  }
  if (body.modeId !== undefined) {
    patch.modeId = body.modeId.trim();
  }
}

function applyMissPolicy(patch: SchedulePatch, body: UpdateScheduleBody): void {
  if (body.missPolicy !== undefined) {
    patch.missPolicy = body.missPolicy;
  }
}

function applyThreadBind(
  patch: SchedulePatch,
  input: {
    orgId: string;
    body: UpdateScheduleBody;
    currentId: string;
    agentId: string;
    title: string;
    threads: ThreadRepositoryPort;
    threadAgents: ThreadAgentRepositoryPort;
    schedules: ScheduleRepositoryPort;
    webhooks: WebhookRepositoryPort;
    triggerInstances: TriggerInstanceRepositoryPort;
  },
): void {
  if (input.body.threadId === undefined) {
    return;
  }
  if (input.body.threadId === null) {
    patch.threadId = insertDedicatedThread(
      { threads: input.threads, threadAgents: input.threadAgents },
      { orgId: input.orgId, agentId: input.agentId, title: input.title, kind: 'schedule' },
    ).id;
    return;
  }
  const bound = requireBindableScheduleThread({
    threads: input.threads,
    threadAgents: input.threadAgents,
    occupancy: {
      orgId: input.orgId,
      threadId: input.body.threadId,
      schedules: input.schedules,
      webhooks: input.webhooks,
      triggerInstances: input.triggerInstances,
      exceptScheduleId: input.currentId,
    },
    agentId: input.agentId,
    threadId: input.body.threadId,
  });
  patch.threadId = bound.id;
}
