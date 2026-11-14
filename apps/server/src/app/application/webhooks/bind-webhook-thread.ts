import { TriggerInstanceRepositoryPort } from '../../domain/addons/ports/trigger-instance-repository.port.ts';
import { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { WebhookValidationException } from '../../domain/webhook/webhook.error.ts';
import { WebhookRepositoryPort } from '../../domain/webhook/webhook-repository.port.ts';
import { occupiedTriggerInstanceThreadId } from '../schedules/bind-schedule-thread.ts';

export function requireBindableWebhookThread(input: {
  threads: ThreadRepositoryPort;
  threadAgents: ThreadAgentRepositoryPort;
  webhooks: WebhookRepositoryPort;
  schedules: ScheduleRepositoryPort;
  triggerInstances: TriggerInstanceRepositoryPort;
  orgId: string;
  agentId: string;
  threadId: string;
  exceptWebhookId?: string;
}): ThreadRecord {
  const threadId = input.threadId.trim();
  if (!threadId) {
    throw new WebhookValidationException('threadId cannot be empty');
  }
  const thread = input.threads.findById(input.orgId, threadId);
  if (!thread || thread.orgId !== input.orgId) {
    throw new WebhookValidationException('thread not found');
  }
  const members = input.threadAgents.listByThread(input.orgId, thread.id);
  if (!members.some((member) => member.agentId === input.agentId)) {
    throw new WebhookValidationException('thread belongs to another agent');
  }
  const occupied = input.webhooks.findByThreadId(input.orgId, thread.id);
  if (occupied && occupied.id !== input.exceptWebhookId) {
    throw new WebhookValidationException('thread already has a webhook');
  }
  const scheduleOccupied = input.schedules.findByThreadId(input.orgId, thread.id);
  if (scheduleOccupied) {
    throw new WebhookValidationException('thread already has a schedule');
  }
  const instanceOccupied = occupiedTriggerInstanceThreadId(
    input.triggerInstances.list(input.orgId),
    thread.id,
  );
  if (instanceOccupied) {
    throw new WebhookValidationException('thread already has a trigger');
  }
  return thread;
}
