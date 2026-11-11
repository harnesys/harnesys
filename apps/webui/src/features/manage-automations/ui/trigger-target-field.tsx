import { ThreadBindingSelects, useThreadStore } from '@/entities/thread';
import { createThreadRecord } from '@/shared/api';
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
  });
  return thread.id;
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
  const threads = useThreadStore((state) => state.items);
  const linkedThread = value ? threads.find((thread) => thread.id === value) : undefined;
  const threadsForAgent = threads.filter(
    (thread) => thread.orgId === orgId && thread.agentId === agentId,
  );
  const items = [
    { value: NEW_TRIGGER_THREAD_VALUE, label: 'New thread' },
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
      <div className="grid items-start gap-1.5 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.5fr)]">
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
        ) : null}
      </div>
      <FieldDescription>
        {linkedThread
          ? 'Profile and folder apply to the runs this automation wakes.'
          : 'A new chat thread is created for the first matching event.'}
      </FieldDescription>
    </Field>
  );
}
