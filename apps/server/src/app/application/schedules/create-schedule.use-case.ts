import { Injectable } from '@harnesys/brix';
import type { CreateScheduleBody, CreateScheduleResponse } from '@harnesys/contracts';
import { DEFAULT_MODE_ID } from '@harnesys/contracts';
import { AgentNotFoundException } from '../../domain/agent/agent.error.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ScheduleValidationException } from '../../domain/schedule/schedule.error.ts';
import { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { toThreadPublic } from '../threads/thread.helpers.ts';
import { requireBindableScheduleThread } from './bind-schedule-thread.ts';
import { isValidCron, nextCronRunAt } from './cron-next.ts';
import { toSchedulePublic } from './schedule.helpers.ts';

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
    private readonly agents: AgentRegistryPort,
    private readonly orgSettings: OrgSettingsPort,
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
    const history = request.body.history ?? 'none';
    const historyLast = Math.min(Math.max(request.body.historyLast ?? 1, 1), 99);
    const missPolicy = request.body.missPolicy ?? 'catch-up';
    const now = new Date().toISOString();
    const existingThread = request.body.threadId
      ? requireBindableScheduleThread({
          threads: this.threads,
          schedules: this.schedules,
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
      });
    const schedule = this.schedules.insert({
      id: crypto.randomUUID(),
      orgId: request.orgId,
      name,
      status: 'active',
      targetAgentId: agent.id,
      detail: request.body.detail?.trim() || '',
      cron,
      modeId,
      history,
      historyLast,
      missPolicy,
      threadId: thread.id,
      nextRunAt: nextCronRunAt(cron, new Date(now), timezone),
      lastFiredAt: null,
      createdByUserId: request.actorUserId ?? null,
      createdAt: now,
      updatedAt: now,
    });
    return {
      schedule: toSchedulePublic(schedule),
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
