import type { SchedulePublic } from '@harnesys/contracts';
import type { ScheduleRecord } from '../../domain/schedule/schedule.ts';

export function toSchedulePublic(schedule: ScheduleRecord): SchedulePublic {
  return {
    id: schedule.id,
    orgId: schedule.orgId,
    name: schedule.name,
    status: schedule.status,
    targetAgentId: schedule.targetAgentId,
    detail: schedule.detail,
    cron: schedule.cron,
    modeId: schedule.modeId,
    history: schedule.history,
    historyLast: schedule.historyLast,
    missPolicy: schedule.missPolicy,
    threadId: schedule.threadId,
    nextRunAt: schedule.nextRunAt,
    lastFiredAt: schedule.lastFiredAt,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
  };
}

export function webhookEndpointFor(orgId: string, webhookId: string): string {
  return `/api/orgs/${orgId}/hooks/${webhookId}`;
}
