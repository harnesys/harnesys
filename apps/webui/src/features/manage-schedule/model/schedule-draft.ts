import { DEFAULT_MODE_ID } from '@harnesys/studio-shared';
import type { Agent } from '@/entities/agent';
import type { Schedule, ScheduleStatus } from '@/entities/schedule';
export interface ScheduleFormDraft {
  name: string;
  status: ScheduleStatus;
  targetAgentId: string;
  detail: string;
  cron: string;
  modeId: string;
  threadId: string;
}
export function draftFrom(item: Schedule): ScheduleFormDraft {
  return {
    name: item.name,
    status: item.status,
    targetAgentId: item.targetAgentId,
    detail: item.detail,
    cron: item.cron,
    modeId: item.modeId,
    threadId: item.threadId,
  };
}
export function emptyScheduleDraft(agents: Agent[]): ScheduleFormDraft {
  return {
    name: '',
    status: 'active',
    targetAgentId: agents[0]?.id ?? '',
    detail: '',
    cron: '0 * * * *',
    modeId: DEFAULT_MODE_ID,
    threadId: '',
  };
}
