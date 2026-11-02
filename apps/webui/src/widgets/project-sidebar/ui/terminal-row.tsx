import { CircleStopIcon, PencilIcon, SquareTerminalIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { TerminalSessionRecord } from '@/shared/api';
import { setEntityRefDrag } from '@/shared/lib/entity-ref-drag';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';

function TerminalTitleInput({
  initialValue,
  onFinish,
}: {
  initialValue: string;
  onFinish: (title: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      onFinish(value);
    } else if (event.key === 'Escape') {
      onFinish('');
    }
  };
  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => onFinish(value)}
      className="min-w-0 flex-1 rounded bg-transparent px-1 text-sm outline-none ring-1 ring-sidebar-ring/40"
      data-testid="terminal-rename-input"
    />
  );
}

export function TerminalRow({
  session,
  selected,
  onSelect,
  onStop,
  onDelete,
  onRename,
}: {
  session: TerminalSessionRecord;
  selected: boolean;
  onSelect: () => void;
  onStop: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const finishRename = (title: string) => {
    setEditing(false);
    const trimmed = title.trim();
    if (trimmed !== '' && trimmed !== session.title) {
      onRename(trimmed);
    }
  };
  if (editing) {
    return (
      <div
        className="flex items-center gap-2 rounded-md px-2 py-1"
        data-testid={`terminal-${session.id}`}
      >
        <SquareTerminalIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <TerminalTitleInput initialValue={session.title} onFinish={finishRename} />
      </div>
    );
  }
  return (
    <div
      className={cn(
        'group/term relative flex items-center rounded-md transition-colors hover:bg-sidebar-accent/70',
        selected && 'bg-sidebar-accent/70 text-sidebar-accent-foreground',
      )}
      data-testid={`terminal-${session.id}`}
      data-selected={selected ? 'true' : 'false'}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'copy';
          setEntityRefDrag(event.dataTransfer, {
            kind: 'terminal',
            id: session.id,
            name: session.name ?? session.title,
          });
        }}
        onClick={onSelect}
        onDoubleClick={() => setEditing(true)}
      >
        <SquareTerminalIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="min-w-0 truncate text-sm leading-4">{session.title}</span>
          {session.origin === 'agent' ? (
            <span
              className="shrink-0 rounded bg-muted px-1 py-px text-[9px] text-muted-foreground uppercase tracking-wide"
              data-testid={`terminal-origin-${session.id}`}
            >
              agent
            </span>
          ) : null}
          {session.exited ? (
            <span className="shrink-0 text-[10px] text-muted-foreground">exited</span>
          ) : null}
        </span>
        {!session.exited ? (
          <span
            className="relative inline-flex size-1.5 shrink-0 animate-pulse rounded-full bg-live"
            data-testid={`terminal-active-${session.id}`}
          >
            <span className="sr-only">active</span>
          </span>
        ) : null}
      </button>
      <div className="hidden items-center gap-0.5 pr-1 group-focus-within/term:flex group-hover/term:flex">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-5"
          aria-label="Rename terminal"
          title="Rename terminal"
          data-testid={`terminal-rename-${session.id}`}
          onClick={(event) => {
            event.stopPropagation();
            setEditing(true);
          }}
        >
          <PencilIcon className="size-3 text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
        </Button>
        {!session.exited ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-5"
            aria-label="Stop session"
            title="Stop session"
            data-testid={`terminal-stop-${session.id}`}
            onClick={(event) => {
              event.stopPropagation();
              onStop();
            }}
          >
            <CircleStopIcon className="size-3 text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-5"
          aria-label="Kill terminal"
          title="Kill terminal"
          data-testid={`terminal-kill-${session.id}`}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <Trash2Icon className="size-3 text-sidebar-foreground/50 group-hover/button:text-destructive" />
        </Button>
      </div>
    </div>
  );
}
