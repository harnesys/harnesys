import type { ThreadKind } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { listThreads } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { orgThreadsQueryKey } from '../../model/connector-api';

export function TelegramThreadPicker({
  orgId,
  kind,
  value,
  onChange,
}: {
  orgId: string;
  kind: Extract<ThreadKind, 'chat' | 'group'>;
  value: string | null;
  onChange: (threadId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const threads = useQuery({
    queryKey: [...orgThreadsQueryKey(orgId), kind],
    queryFn: () => listThreads(orgId),
  });
  const items = (threads.data ?? []).filter(
    (thread) =>
      thread.kind === kind &&
      (!search.trim() || thread.title.toLowerCase().includes(search.trim().toLowerCase())),
  );

  if (threads.isPending) {
    return <p className="text-muted-foreground text-xs">Loading threads…</p>;
  }
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-xs" data-testid="telegram-thread-picker-empty">
        {kind === 'chat'
          ? 'No 1:1 threads yet. Create a new one instead.'
          : 'No group threads yet. Create a new one instead.'}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2" data-testid="telegram-thread-picker">
      <Input
        value={search}
        placeholder="Search threads"
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {items.map((thread) => (
          <Button
            key={thread.id}
            type="button"
            size="sm"
            variant={value === thread.id ? 'secondary' : 'ghost'}
            className="justify-start"
            onClick={() => onChange(thread.id)}
          >
            <span className="truncate">{thread.title}</span>
            <span className="ml-auto text-[11px] text-muted-foreground">
              {thread.members.map((member) => member.name).join(', ')}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
