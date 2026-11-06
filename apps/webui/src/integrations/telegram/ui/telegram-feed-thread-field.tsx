import { ThreadBindingSelects, useThreadStore } from '@/entities/thread';
import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

export const NEW_FEED_THREAD_VALUE = 'new';

export function TelegramFeedThreadField({
  orgId,
  agentId,
  value,
  onChange,
  currentThreadId,
  occupied,
  allowNew,
}: {
  orgId: string;
  agentId: string;
  value: string;
  onChange: (threadId: string) => void;
  currentThreadId?: string;
  occupied: Set<string>;
  allowNew: boolean;
}) {
  const threads = useThreadStore((state) => state.items);
  const linkedThread = value ? threads.find((thread) => thread.id === value) : undefined;
  const freeThreads = threads.filter(
    (thread) => thread.orgId === orgId && thread.agentId === agentId && !occupied.has(thread.id),
  );
  const items = [
    ...(allowNew ? [{ value: NEW_FEED_THREAD_VALUE, label: 'New feed thread' }] : []),
    ...freeThreads.map((thread) => ({
      value: thread.id,
      label: thread.title.trim() || 'Untitled',
    })),
    ...(currentThreadId && !freeThreads.some((thread) => thread.id === currentThreadId)
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
            value={value || NEW_FEED_THREAD_VALUE}
            onValueChange={(next) => {
              if (typeof next === 'string') {
                onChange(next === NEW_FEED_THREAD_VALUE ? '' : next);
              }
            }}
          >
            <SelectTrigger id="telegram-feed-thread" className="w-full">
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
          ? 'Profile and folder apply to the runs this feed wakes.'
          : 'A new thread is created for the first matching post. An existing chat thread receives the posts in that conversation.'}
      </FieldDescription>
    </Field>
  );
}
