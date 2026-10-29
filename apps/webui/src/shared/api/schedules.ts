import type {
  CreateScheduleResponse as ContractCreateScheduleResponse,
  CreateScheduleBody,
  ListSchedulesResponse,
  SchedulePublic,
  UpdateScheduleBody,
} from '@harnesys/contracts';
import type {
  CreateScheduleResponse,
  ScheduleHistory,
  ScheduleRecord,
  ScheduleStatus,
  SessionEvent,
} from '@harnesys/studio-shared';
import { getActiveOrgId } from './active-org';
import { ApiError, apiJson } from './client';

export interface CreateScheduleInput {
  name: string;
  targetAgentId: string;
  detail?: string;
  cron?: string;
  modeId?: string;
  history?: ScheduleHistory;
  historyLast?: number;
  missPolicy?: 'catch-up' | 'skip' | 'escalate';
  threadId?: string;
}

export interface UpdateScheduleInput {
  name?: string;
  status?: ScheduleStatus;
  targetAgentId?: string;
  detail?: string;
  cron?: string;
  modeId?: string;
  history?: ScheduleHistory;
  historyLast?: number;
  missPolicy?: 'catch-up' | 'skip' | 'escalate';
  threadId?: string;
}

function requireOrgId(orgId?: string): string {
  const resolved = orgId ?? getActiveOrgId();
  if (!resolved) {
    throw new ApiError(400, 'No active organization');
  }
  return resolved;
}

function schedulesBase(orgId: string): string {
  return `/api/orgs/${encodeURIComponent(orgId)}/schedules`;
}

function toStudioSchedule(record: SchedulePublic): ScheduleRecord {
  return {
    id: record.id,
    projectId: record.orgId,
    name: record.name,
    status: record.status,
    targetAgentId: record.targetAgentId,
    detail: record.detail,
    cron: record.cron,
    modeId: record.modeId,
    history: record.history,
    historyLast: record.historyLast,
    threadId: record.threadId,
    nextRunAt: record.nextRunAt,
    lastFiredAt: record.lastFiredAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toStudioCreateResponse(res: ContractCreateScheduleResponse): CreateScheduleResponse {
  return {
    schedule: toStudioSchedule(res.schedule),
    thread: {
      id: res.thread.id,
      title: res.thread.title,
      agentId: res.thread.agentId,
      originAgentId: res.thread.originAgentId,
      agentName: res.thread.agentName,
      projectId: res.thread.orgId,
      kind: res.thread.kind,
      issueId: res.thread.issueId,
      parentThreadId: res.thread.parentThreadId,
      forkAt: res.thread.forkAt,
      inheritedEventCount: res.thread.inheritedEventCount,
      createdAt: res.thread.createdAt,
      updatedAt: res.thread.updatedAt,
      lastReadAt: res.thread.lastReadAt,
      unread: res.thread.unread,
      pinned: res.thread.pinned,
      runMode: res.thread.runMode,
      runProfileId: res.thread.runProfileId,
      runDirectory: res.thread.runDirectory,
      bindingLocked: res.thread.bindingLocked,
      events: res.thread.events as SessionEvent[],
      activeRun: res.thread.activeRun,
    },
  };
}

export function listSchedules(orgId?: string): Promise<ScheduleRecord[]> {
  const resolved = requireOrgId(orgId);
  return apiJson<ListSchedulesResponse>(schedulesBase(resolved)).then((res) =>
    res.items.map(toStudioSchedule),
  );
}

export function createScheduleRecord(orgId: string, body: CreateScheduleInput) {
  const resolved = requireOrgId(orgId);
  const payload: CreateScheduleBody = {
    name: body.name,
    targetAgentId: body.targetAgentId,
    detail: body.detail,
    cron: body.cron,
    modeId: body.modeId,
    history: body.history,
    historyLast: body.historyLast,
    missPolicy: body.missPolicy,
    threadId: body.threadId,
  };
  return apiJson<ContractCreateScheduleResponse>(schedulesBase(resolved), {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then(toStudioCreateResponse);
}

export function updateScheduleRecord(orgId: string, scheduleId: string, body: UpdateScheduleInput) {
  const resolved = requireOrgId(orgId);
  const payload: UpdateScheduleBody = {
    name: body.name,
    status: body.status,
    targetAgentId: body.targetAgentId,
    detail: body.detail,
    cron: body.cron,
    modeId: body.modeId,
    history: body.history,
    historyLast: body.historyLast,
    missPolicy: body.missPolicy,
    threadId: body.threadId,
  };
  return apiJson<SchedulePublic>(`${schedulesBase(resolved)}/${encodeURIComponent(scheduleId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }).then(toStudioSchedule);
}

export function deleteScheduleRecord(orgId: string, scheduleId: string) {
  const resolved = requireOrgId(orgId);
  return apiJson<void>(`${schedulesBase(resolved)}/${encodeURIComponent(scheduleId)}`, {
    method: 'DELETE',
  });
}
