import type { CapabilityScope } from '../domain/pack.ts';
import type { PermissionMode, ScheduleHistory } from '../domain/schedule.ts';
export type ScheduleStatus = 'active' | 'paused' | 'failed';
export interface ScheduleRecord {
  id: string;
  orgId: string;
  name: string;
  status: ScheduleStatus;
  targetAgentId: string;
  detail: string;
  cron: string;
  mode: PermissionMode;
  history: ScheduleHistory;
  historyLast: number;
  threadId: string;
  nextRunAt: string | null;
  lastFiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ScheduleCreateInput {
  name: string;
  targetAgentId?: string;
  cron?: string;
  detail?: string;
  mode?: PermissionMode;
  history?: ScheduleHistory;
  historyLast?: number;
  threadId?: string;
}
export interface ScheduleUpdateInput {
  name?: string;
  status?: ScheduleStatus;
  targetAgentId?: string;
  detail?: string;
  cron?: string;
  mode?: PermissionMode;
  history?: ScheduleHistory;
  historyLast?: number;
}
export interface ScheduleCreatedThread {
  id: string;
  title: string;
  kind: string;
  agentId: string;
}
export interface ScheduleCreatedRecord {
  schedule: ScheduleRecord;
  thread: ScheduleCreatedThread;
}
export interface SchedulePeekFire {
  at: string;
  detail: string;
}
export interface SchedulePeekRecord {
  id: string;
  name: string;
  threadId: string;
  lastFiredAt: string | null;
  fires: SchedulePeekFire[];
}
export interface SchedulerPort {
  list(scope: CapabilityScope): Promise<ScheduleRecord[]>;
  peek(scope: CapabilityScope, id: string, last?: number): Promise<SchedulePeekRecord>;
  create(scope: CapabilityScope, input: ScheduleCreateInput): Promise<ScheduleCreatedRecord>;
  update(scope: CapabilityScope, id: string, patch: ScheduleUpdateInput): Promise<ScheduleRecord>;
  remove(scope: CapabilityScope, id: string): Promise<void>;
}
