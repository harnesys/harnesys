import type { TriggerInstanceRow } from '../../domain/addons/ports/trigger-instance-repository.port.ts';
import { TriggerInstanceRepositoryPort } from '../../domain/addons/ports/trigger-instance-repository.port.ts';
import { ScheduleValidationException } from '../../domain/schedule/schedule.error.ts';
import { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { WebhookRepositoryPort } from '../../domain/webhook/webhook-repository.port.ts';

export interface ScheduleThreadOccupancy {
  orgId: string;
  threadId: string;
  schedules: ScheduleRepositoryPort;
  webhooks: WebhookRepositoryPort;
  triggerInstances: TriggerInstanceRepositoryPort;
  exceptScheduleId?: string;
  exceptInstanceId?: string;
}

export function occupiedTriggerInstanceThreadId(
  instances: TriggerInstanceRow[],
  threadId: string,
  exceptInstanceId?: string,
): string | undefined {
  for (const instance of instances) {
    if (instance.id === exceptInstanceId) {
      continue;
    }
    if (triggerInstanceThreadId(instance) === threadId) {
      return instance.id;
    }
  }
  return undefined;
}

export function triggerInstanceThreadId(instance: TriggerInstanceRow): string | undefined {
  try {
    const parsed: unknown = JSON.parse(instance.targetJson);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const threadId = (parsed as Record<string, unknown>).threadId;
      return typeof threadId === 'string' && threadId ? threadId : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function requireBindableScheduleThread(input: {
  threads: ThreadRepositoryPort;
  threadAgents: ThreadAgentRepositoryPort;
  occupancy: ScheduleThreadOccupancy;
  agentId: string;
  threadId: string;
}): ThreadRecord {
  const threadId = input.threadId.trim();
  if (!threadId) {
    throw new ScheduleValidationException('threadId cannot be empty');
  }
  const thread = input.threads.findById(input.occupancy.orgId, threadId);
  if (!thread || thread.orgId !== input.occupancy.orgId) {
    throw new ScheduleValidationException('thread not found');
  }
  const members = input.threadAgents.listByThread(input.occupancy.orgId, thread.id);
  if (!members.some((member) => member.agentId === input.agentId)) {
    throw new ScheduleValidationException('thread belongs to another agent');
  }
  assertScheduleThreadFree({ ...input.occupancy, threadId: thread.id });
  return thread;
}

export function assertScheduleThreadFree(input: ScheduleThreadOccupancy): void {
  const occupied = input.schedules.findByThreadId(input.orgId, input.threadId);
  if (occupied && occupied.id !== input.exceptScheduleId) {
    throw new ScheduleValidationException('thread already has a schedule');
  }
  const webhookOccupied = input.webhooks.findByThreadId(input.orgId, input.threadId);
  if (webhookOccupied) {
    throw new ScheduleValidationException('thread already has a webhook');
  }
  const instanceOccupied = occupiedTriggerInstanceThreadId(
    input.triggerInstances.list(input.orgId),
    input.threadId,
    input.exceptInstanceId,
  );
  if (instanceOccupied) {
    throw new ScheduleValidationException('thread already has a trigger');
  }
}
