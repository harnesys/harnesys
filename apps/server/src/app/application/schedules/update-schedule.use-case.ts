import { Injectable } from '@harnesys/brix';
import type { SchedulePublic, UpdateScheduleBody } from '@harnesys/contracts';
import { AgentNotFoundException } from '../../domain/agent/agent.error.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import {
  ScheduleNotFoundException,
  ScheduleValidationException,
} from '../../domain/schedule/schedule.error.ts';
import type { SchedulePatch, ScheduleRecord } from '../../domain/schedule/schedule.ts';
import { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { recordOwnerOnWrite } from '../threads/run-attribution.ts';
import { requireBindableScheduleThread } from './bind-schedule-thread.ts';
import { isValidCron, nextCronRunAt } from './cron-next.ts';
import { toSchedulePublic } from './schedule.helpers.ts';

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
    private readonly agents: AgentRegistryPort,
    private readonly orgSettings: OrgSettingsPort,
  ) {}

  execute(request: UpdateScheduleRequest): SchedulePublic {
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
    applyHistoryAndPolicy(patch, request.body);
    applyThreadBind(patch, {
      orgId: request.orgId,
      body: request.body,
      currentId: current.id,
      agentId: nextAgentId,
      threads: this.threads,
      schedules: this.schedules,
    });
    const updated = this.schedules.update(request.orgId, current.id, patch);
    if (rename) {
      this.threads.patch(request.orgId, updated.threadId, { title: rename });
    }
    return toSchedulePublic(updated);
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

function applyHistoryAndPolicy(patch: SchedulePatch, body: UpdateScheduleBody): void {
  if (body.history !== undefined) {
    patch.history = body.history;
  }
  if (body.historyLast !== undefined) {
    patch.historyLast = Math.min(Math.max(body.historyLast, 1), 99);
  }
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
    threads: ThreadRepositoryPort;
    schedules: ScheduleRepositoryPort;
  },
): void {
  if (input.body.threadId === undefined) {
    return;
  }
  const bound = requireBindableScheduleThread({
    threads: input.threads,
    schedules: input.schedules,
    orgId: input.orgId,
    agentId: input.agentId,
    threadId: input.body.threadId,
    exceptScheduleId: input.currentId,
  });
  patch.threadId = bound.id;
}
