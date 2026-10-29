import type { Agent } from '@/entities/agent';
import type { Schedule } from '@/entities/schedule';
import { dialog } from '@/shared/services/overlay';
import { ScheduleConfigDialog } from '../ui/schedule-config-dialog';
import type { ScheduleFormDraft } from './schedule-draft';
export type ScheduleConfigResult =
  | { draft: ScheduleFormDraft; deleted: false }
  | { draft: null; deleted: true };
export function openScheduleConfigDialog(agents: Agent[], projectId: string, schedule?: Schedule) {
  return dialog.open(ScheduleConfigDialog, {
    title: schedule ? `Configure ${schedule.name}` : 'New scheduler',
    className: 'sm:max-w-2xl',
    testId: 'schedule-config-dialog',
    data: { agents, projectId, schedule: schedule ?? null },
  });
}
