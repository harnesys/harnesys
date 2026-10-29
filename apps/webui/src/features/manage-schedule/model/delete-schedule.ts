import { type Schedule, useScheduleStore } from '@/entities/schedule';
import { useSessionStore } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { deleteScheduleRecord } from '@/shared/api';
import { alert } from '@/shared/services/overlay';
export async function deleteSchedule(projectId: string, scheduleId: string): Promise<boolean> {
  const current = useScheduleStore.getState().byId(scheduleId);
  if (!current || current.projectId !== projectId) {
    return false;
  }
  await deleteScheduleRecord(projectId, scheduleId);
  useScheduleStore.getState().remove(scheduleId);
  const thread = useThreadStore.getState().byId(current.threadId);
  if (thread?.kind === 'schedule') {
    useSessionStore.getState().removeForThreads([current.threadId]);
    useThreadStore.getState().remove(current.threadId);
  }
  return true;
}
export function confirmDeleteSchedule(schedule: Schedule) {
  return alert.confirm({
    title: `Delete ${schedule.name}?`,
    description: 'The schedule and its thread will be permanently deleted.',
    confirmText: 'Delete schedule',
    variant: 'destructive',
    testId: 'delete-schedule-dialog',
  });
}
