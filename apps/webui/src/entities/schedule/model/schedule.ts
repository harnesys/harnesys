import { DEFAULT_MODE_ID, type ScheduleRecord, type ScheduleStatus } from '@harnesys/studio-shared';

export { SCHEDULE_STATUSES } from '@harnesys/studio-shared';
export type { ScheduleStatus };
export function scheduleStatusTone(
  status: ScheduleStatus,
): 'idle' | 'live' | 'wait' | 'danger' | 'off' {
  switch (status) {
    case 'active':
      return 'live';
    case 'paused':
      return 'wait';
    case 'failed':
      return 'danger';
  }
}
export function scheduleStatusLabel(status: ScheduleStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'paused':
      return 'Paused';
    case 'failed':
      return 'Failed';
  }
}
export function scheduleInk(status: ScheduleStatus): string {
  switch (status) {
    case 'active':
      return 'text-live';
    case 'paused':
      return 'text-muted-foreground';
    case 'failed':
      return 'text-destructive';
  }
}
export interface Schedule {
  id: string;
  projectId: string;
  name: string;
  status: ScheduleStatus;
  targetAgentId: string;
  detail: string;
  cron: string;
  modeId: string;
  threadId: string;
  nextRunAt?: string;
  lastFiredAt?: string;
  updatedAt: string;
}
export function toClientSchedule(record: ScheduleRecord): Schedule {
  return {
    id: record.id,
    projectId: record.projectId,
    name: record.name,
    status: record.status,
    targetAgentId: record.targetAgentId,
    detail: record.detail,
    cron: record.cron,
    modeId: record.modeId ?? DEFAULT_MODE_ID,
    threadId: record.threadId,
    nextRunAt: record.nextRunAt ?? undefined,
    lastFiredAt: record.lastFiredAt ?? undefined,
    updatedAt: record.updatedAt ?? record.createdAt ?? '',
  };
}
