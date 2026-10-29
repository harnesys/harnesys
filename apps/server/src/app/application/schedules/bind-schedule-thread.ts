import { ScheduleValidationException } from '../../domain/schedule/schedule.error.ts';
import { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export function requireBindableScheduleThread(input: {
  threads: ThreadRepositoryPort;
  schedules: ScheduleRepositoryPort;
  orgId: string;
  agentId: string;
  threadId: string;
  exceptScheduleId?: string;
}): ThreadRecord {
  const threadId = input.threadId.trim();
  if (!threadId) {
    throw new ScheduleValidationException('threadId cannot be empty');
  }
  const thread = input.threads.findById(input.orgId, threadId);
  if (!thread || thread.orgId !== input.orgId) {
    throw new ScheduleValidationException('thread not found');
  }
  if (thread.agentId !== input.agentId) {
    throw new ScheduleValidationException('thread belongs to another agent');
  }
  const occupied = input.schedules.findByThreadId(input.orgId, thread.id);
  if (occupied && occupied.id !== input.exceptScheduleId) {
    throw new ScheduleValidationException('thread already has a schedule');
  }
  return thread;
}
