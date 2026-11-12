import { Injectable } from '@harnesys/brix';
import type { CreateScheduleBody, CreateScheduleResponse } from '@harnesys/contracts';
import { DEFAULT_MODE_ID } from '@harnesys/contracts';
import { TriggerInstanceRepositoryPort } from '../../domain/addons/ports/trigger-instance-repository.port.ts';
import { AgentNotFoundException } from '../../domain/agent/agent.error.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { DeskEventsPort } from '../../domain/desk/desk-events.port.ts';
import { ScheduleValidationException } from '../../domain/schedule/schedule.error.ts';
import { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { WebhookRepositoryPort } from '../../domain/webhook/webhook-repository.port.ts';
import { insertAgentThread, toThreadPublicForAgent } from '../threads/thread.helpers.ts';
import { requireBindableScheduleThread } from './bind-schedule-thread.ts';
import { isValidCron, nextCronRunAt } from './cron-next.ts';
import { toDeskScheduleEvent, toSchedulePublic } from './schedule.helpers.ts';

export interface CreateScheduleRequest {
  orgId: string;
  actorUserId?: string | null;
  body: CreateScheduleBody;
}

@Injectable()
export class CreateScheduleUseCase {
  constructor(
    private readonly schedules: ScheduleRepositoryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly webhooks: WebhookRepositoryPort,
    private readonly triggerInstances: TriggerInstanceRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly orgSettings: OrgSettingsPort,
    private readonly deskEvents: DeskEventsPort,
  ) {}

  execute(request: CreateScheduleRequest): CreateScheduleResponse {
    const name = request.body.name.trim();
    const agent = this.agents.findById(request.orgId, request.body.targetAgentId);
    if (!agent || agent.status === 'archived') {
      throw new AgentNotFoundException(request.body.targetAgentId);
    }
    const timezone = this.orgSettings.get(request.orgId).timezone;
    const cron = request.body.cron?.trim() || '0 * * * *';
    if (!isValidCron(cron, timezone)) {
      throw new ScheduleValidationException('invalid cron');
    }
    const modeId = request.body.modeId?.trim() || agent.defaultModeId || DEFAULT_MODE_ID;
    const missPolicy = request.body.missPolicy ?? 'catch-up';
    const now = new Date().toISOString();
    const existingThread = request.body.threadId
      ? requireBindableScheduleThread({
          threads: this.threads,
          threadAgents: this.threadAgents,
          occupancy: {
            orgId: request.orgId,
            threadId: request.body.threadId,
            schedules: this.schedules,
            webhooks: this.webhooks,
            triggerInstances: this.triggerInstances,
          },
          agentId: agent.id,
          threadId: request.body.threadId,
        })
      : undefined;
    const thread =
      existingThread ??
      insertAgentThread(
        { threads: this.threads, threadAgents: this.threadAgents },
        {
          id: crypto.randomUUID(),
          orgId: request.orgId,
          title: name,
          kind: 'schedule',
          parentThreadId: null,
          forkAt: null,
          inheritedEventCount: 0,
          metadata: {},
          runProfileId: null,
          runDirectory: null,
          createdAt: now,
          updatedAt: now,
          lastReadAt: now,
        },
        agent.id,
      );
    const schedule = this.schedules.insert({
      id: crypto.randomUUID(),
      orgId: request.orgId,
      name,
      status: 'active',
      targetAgentId: agent.id,
      detail: request.body.detail?.trim() || '',
      cron,
      modeId,
      missPolicy,
      threadId: thread.id,
      nextRunAt: nextCronRunAt(cron, new Date(now), timezone),
      lastFiredAt: null,
      createdByUserId: request.actorUserId ?? null,
      createdAt: now,
      updatedAt: now,
    });
    this.deskEvents.emit(request.orgId, toDeskScheduleEvent(schedule));
    return {
      schedule: toSchedulePublic(schedule),
      thread: toThreadPublicForAgent({
        thread,
        agentId: agent.id,
        agentName: agent.name,
        active: null,
        events: [],
        inheritedEventCount: 0,
      }),
    };
  }
}
