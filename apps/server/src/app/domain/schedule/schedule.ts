import type { ScheduleHistory, ScheduleMissPolicy, ScheduleStatus } from '@harnesys/contracts';

export const SCHEDULE_CATCHUP_WINDOW_SEC = 3600;
export const SCHEDULE_CATCHUP_BATCH = 50;
export const PLANNER_INTERVAL_MS = 60_000;

export interface ScheduleRecord {
  id: string;
  orgId: string;
  name: string;
  status: ScheduleStatus;
  targetAgentId: string;
  detail: string;
  cron: string;
  modeId: string;
  history: ScheduleHistory;
  historyLast: number;
  missPolicy: ScheduleMissPolicy;
  threadId: string;
  nextRunAt: string | null;
  lastFiredAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleInsert = ScheduleRecord;

export interface ScheduleFireRecord {
  fireId: string;
  scheduleId: string;
  runId: string | null;
  createdAt: string;
}

export type SchedulePatch = Partial<{
  name: string;
  status: ScheduleStatus;
  targetAgentId: string;
  detail: string;
  cron: string;
  modeId: string;
  history: ScheduleHistory;
  historyLast: number;
  missPolicy: ScheduleMissPolicy;
  threadId: string;
  nextRunAt: string | null;
  lastFiredAt: string | null;
  createdByUserId: string | null;
  updatedAt: string;
}>;

export type { ScheduleHistory, ScheduleMissPolicy, ScheduleStatus };
