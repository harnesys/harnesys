import { useQuery } from '@tanstack/react-query';
import { ThreadBindingSelects, useThreadStore } from '@/entities/thread';
import { createThreadRecord, listThreads } from '@/shared/api';
import { cn } from '@/shared/lib/utils';
import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

export const NEW_TRIGGER_THREAD_VALUE = 'new';

export async function resolveTriggerThread(input: {
  agentId: string;
  threadId: string;
  label: string;
}): Promise<string> {
  if (input.threadId) {
    return input.threadId;
  }
  const thread = await createThreadRecord({
    agentId: input.agentId,
    kind: 'chat',
    title: input.label,
    policy: { historyMode: 'none' },
  });
  return thread.id;
}

interface TriggerThreadOption {
  id: string;
  agentId: string;
  title: string;
  runProfileId?: string | null;
  runDirectory?: string | null;
  bindingLocked?: boolean;
}

export function TriggerTargetField({
  orgId,
  agentId,
  value,
  onChange,
  currentThreadId,
}: {
  orgId: string;
  agentId: string;
  value: string;
  onChange: (threadId: string) => void;
  currentThreadId?: string;
}) {
  const storeThreads = useThreadStore((state) => state.items);
  const orgThreads = useQuery({
    queryKey: ['trigger-target-threads', orgId],
    queryFn: () => listThreads(orgId),
    enabled: orgId.length > 0,
    gcTime: 0,
    staleTime: 0,
  });
  const byId = new Map<string, TriggerThreadOption>();
  for (const thread of storeThreads) {
    byId.set(thread.id, {
      id: thread.id,
      agentId: thread.agentId,
      title: thread.title,
      runProfileId: thread.runProfileId,
      runDirectory: thread.runDirectory,
      bindingLocked: thread.bindingLocked,
    });
  }
  for (const thread of orgThreads.data ?? []) {
    if (!byId.has(thread.id)) {
      byId.set(thread.id, {
        id: thread.id,
        agentId: thread.agentId,
        title: thread.title,
        runProfileId: thread.runProfileId,
        runDirectory: thread.runDirectory,
        bindingLocked: thread.bindingLocked,
      });
    }
  }
  const linkedThread = value ? byId.get(value) : undefined;
  const threadsForAgent = [...byId.values()].filter((thread) => thread.agentId === agentId);
  const items = [
    { value: NEW_TRIGGER_THREAD_VALUE, label: 'New dedicated thread' },
    ...threadsForAgent.map((thread) => ({
      value: thread.id,
      label: thread.title.trim() || 'Untitled',
    })),
    ...(currentThreadId && !threadsForAgent.some((thread) => thread.id === currentThreadId)
      ? [{ value: currentThreadId, label: 'Current thread' }]
      : []),
  ];
  return (
    <Field>
      <FieldLabel>Wake thread</FieldLabel>
      <div
        className={cn(
          'grid items-start gap-1.5',
          linkedThread && 'sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.5fr)]',
        )}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Thread</span>
          <Select
            aria-label="Wake thread"
            items={items}
            value={value || NEW_TRIGGER_THREAD_VALUE}
            onValueChange={(next) => {
              if (typeof next === 'string') {
                onChange(next === NEW_TRIGGER_THREAD_VALUE ? '' : next);
              }
            }}
          >
            <SelectTrigger id="trigger-thread" className="w-full">
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
        </div>
        {linkedThread ? (
          <ThreadBindingSelects
            orgId={orgId}
            threadId={linkedThread.id}
            runProfileId={linkedThread.runProfileId ?? null}
            runDirectory={linkedThread.runDirectory ?? null}
            bindingLocked={linkedThread.bindingLocked ?? false}
          />
        ) : null}{' '}
      </div>
      <FieldDescription>
        {linkedThread
          ? 'Profile and folder apply to the runs this trigger wakes.'
          : 'A new dedicated thread is created for this trigger.'}
      </FieldDescription>
    </Field>
  );
}
