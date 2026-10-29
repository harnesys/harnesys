import { ListPlusIcon, LoaderCircleIcon, SendHorizontalIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import {
  ApiError,
  deleteThreadQueueItem,
  deliverThreadQueueItem,
  type ThreadQueueItem,
} from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import { useThreadQueueStore } from '../model/queue.store';
import { useThreadQueue } from '../model/use-thread-queue';

export function ThreadQueueStack({ threadId }: { threadId: string }) {
  const items = useThreadQueue(threadId);
  const [busyId, setBusyId] = useState<string | null>(null);
  if (items.length === 0) {
    return null;
  }
  return (
    <div
      className="mb-1.5 rounded-xl border border-input px-3 py-2 text-xs dark:bg-input/30"
      data-testid="thread-queue-stack"
    >
      <div className="flex items-center gap-1.5 pb-1 font-mono text-[11px] text-muted-foreground">
        <ListPlusIcon className="size-3" />
        <span>{items.length === 1 ? '1 queued message' : `${items.length} queued messages`}</span>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <QueueRow
            key={item.itemId}
            item={item}
            busy={busyId === item.itemId}
            onDeliver={() => handleDeliver(item)}
            onRemove={() => handleRemove(item)}
          />
        ))}
      </ul>
    </div>
  );
  async function handleDeliver(item: ThreadQueueItem) {
    setBusyId(item.itemId);
    try {
      await deliverThreadQueueItem(threadId, item.itemId);
      await useThreadQueueStore.getState().refresh(threadId);
    } catch (error) {
      toast.add({
        title: 'Could not send now',
        description: error instanceof ApiError ? error.message : 'Send now failed',
      });
    } finally {
      setBusyId(null);
    }
  }
  async function handleRemove(item: ThreadQueueItem) {
    setBusyId(item.itemId);
    try {
      await deleteThreadQueueItem(threadId, item.itemId);
      await useThreadQueueStore.getState().refresh(threadId);
    } catch (error) {
      toast.add({
        title: 'Could not remove',
        description: error instanceof ApiError ? error.message : 'Remove failed',
      });
    } finally {
      setBusyId(null);
    }
  }
}

function QueueRow({
  item,
  busy,
  onDeliver,
  onRemove,
}: {
  item: ThreadQueueItem;
  busy: boolean;
  onDeliver(): void;
  onRemove(): void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-sm bg-muted/50 px-2 py-1">
      <span className="min-w-0 flex-1 truncate">{item.text}</span>
      {busy ? (
        <LoaderCircleIcon className="size-3 animate-spin text-muted-foreground" />
      ) : (
        <>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2"
            onClick={onDeliver}
          >
            <SendHorizontalIcon className="size-3" />
            Send now
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-1.5"
            aria-label="Remove queued message"
            onClick={onRemove}
          >
            <XIcon className="size-3" />
          </Button>
        </>
      )}
    </li>
  );
}
