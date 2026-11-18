import { CircleStopIcon, PencilIcon, SquareTerminalIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { TerminalSessionRecord } from '@/shared/api';
import { setEntityRefDrag } from '@/shared/lib/entity-ref-drag';
import { Button } from '@/shared/ui/button';
import { SidebarRow, SidebarRowTitle } from '@/shared/ui/sidebar-row';

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
        className="flex h-7 items-center gap-1.5 rounded-md pr-1.5 pl-1.5"
        data-testid={`terminal-${session.id}`}
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          <SquareTerminalIcon className="size-3.5 text-muted-foreground" />
        </span>
        <TerminalTitleInput initialValue={session.title} onFinish={finishRename} />
      </div>
    );
  }
  return (
    <SidebarRow
      testId={`terminal-${session.id}`}
      selected={selected}
      leading={<SquareTerminalIcon className="text-muted-foreground" />}
      trailing={
        session.exited ? null : (
          <span className="relative inline-flex size-1.5 shrink-0 animate-pulse rounded-full bg-live">
            <span className="sr-only">active</span>
          </span>
        )
      }
      actions={
        <>
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
        </>
      }
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
      <span className="flex min-w-0 items-center gap-1.5">
        <SidebarRowTitle className="min-w-0">{session.title}</SidebarRowTitle>
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
    </SidebarRow>
  );
}
