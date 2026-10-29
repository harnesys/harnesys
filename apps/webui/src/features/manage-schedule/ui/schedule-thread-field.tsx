import { useScheduleStore } from '@/entities/schedule';
import { type Thread, useThreadStore } from '@/entities/thread';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
export const DEDICATED_THREAD_VALUE = 'dedicated';
export function ScheduleThreadField({
  projectId,
  agentId,
  value,
  onChange,
  currentThreadId,
  allowDedicated,
}: {
  projectId: string;
  agentId: string;
  value: string;
  onChange: (threadId: string) => void;
  currentThreadId?: string;
  allowDedicated: boolean;
}) {
  const threads = useThreadStore((state) => state.items);
  const schedules = useScheduleStore((state) => state.items);
  const options = bindableThreads({
    threads,
    schedules,
    projectId,
    agentId,
    currentThreadId,
  });
  const selectValue = value || DEDICATED_THREAD_VALUE;
  const items = [
    ...(allowDedicated
      ? [{ value: DEDICATED_THREAD_VALUE, label: 'Dedicated schedule thread' }]
      : []),
    ...options.map((thread) => ({
      value: thread.id,
      label: threadLabel(thread),
    })),
  ];
  if (currentThreadId && !items.some((item) => item.value === currentThreadId)) {
    items.push({ value: currentThreadId, label: 'Current thread' });
  }
  return (
    <Select
      aria-label="Wake thread"
      items={items}
      value={selectValue}
      onValueChange={(next) => {
        if (typeof next !== 'string') {
          return;
        }
        onChange(next === DEDICATED_THREAD_VALUE ? '' : next);
      }}
    >
      <SelectTrigger id="schedule-thread" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
function bindableThreads(input: {
  threads: Thread[];
  schedules: {
    threadId: string;
    projectId: string;
  }[];
  projectId: string;
  agentId: string;
  currentThreadId?: string;
}): Thread[] {
  const occupied = new Set(
    input.schedules
      .filter(
        (schedule) =>
          schedule.projectId === input.projectId && schedule.threadId !== input.currentThreadId,
      )
      .map((schedule) => schedule.threadId),
  );
  const matched = input.threads.filter(
    (thread) =>
      (thread.orgId === input.projectId || Boolean(thread.orgId)) &&
      thread.agentId === input.agentId &&
      !occupied.has(thread.id),
  );
  const current = input.currentThreadId
    ? input.threads.find((thread) => thread.id === input.currentThreadId)
    : undefined;
  if (current && !matched.some((thread) => thread.id === current.id)) {
    return [current, ...matched];
  }
  return matched;
}
function threadLabel(thread: Thread): string {
  const title = thread.title.trim() || 'Untitled';
  if (thread.kind === 'schedule') {
    return `${title} · dedicated`;
  }
  return title;
}
