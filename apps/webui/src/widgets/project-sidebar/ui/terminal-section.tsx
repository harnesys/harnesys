import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleStopIcon, PencilIcon, PlusIcon, SquareTerminalIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useProjects } from '@/entities/project';
import { deskTerminalsKey, useOrgTerminals } from '@/features/desk';
import { useIdeStore, useOpenNewTerminal, useOpenTerminalTab } from '@/features/ide';
import {
  deleteOrgTerminal,
  deleteTerminal,
  renameOrgTerminal,
  renameTerminal,
  stopOrgTerminal,
  stopTerminal,
  type TerminalSessionRecord,
} from '@/shared/api';
import { useOrgId } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { toast } from '@/shared/ui/toast';
import { SidebarEmpty } from './sidebar-empty';

function TerminalCreateMenu({
  trigger,
  onCreated,
}: {
  trigger: React.ReactElement;
  onCreated?: () => void;
}) {
  const openNewTerminal = useOpenNewTerminal();
  const projectQuery = useProjects();
  const projects = projectQuery.data ?? [];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="start" className="min-w-44">
        <DropdownMenuGroup>
          {projects.length === 0 ? (
            <DropdownMenuItem disabled>No sources</DropdownMenuItem>
          ) : (
            projects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                data-testid={`terminals-create-${project.id}`}
                onClick={() => {
                  void openNewTerminal(project.id).catch((error: unknown) => {
                    toast.add({
                      title: 'Failed to create terminal',
                      description: error instanceof Error ? error.message : undefined,
                    });
                  });
                  onCreated?.();
                }}
              >
                <SquareTerminalIcon className="size-3.5" />
                {project.name}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function TerminalSectionActions({ onCreated }: { onCreated?: () => void }) {
  return (
    <TerminalCreateMenu
      onCreated={onCreated}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title="New terminal"
          aria-label="New terminal"
          data-testid="terminals-create"
        >
          <PlusIcon className="size-3.5 text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
          <span className="sr-only">New terminal</span>
        </Button>
      }
    />
  );
}
export function TerminalSection({
  activeSessionId,
  onSelectDone,
}: {
  activeSessionId: string | null;
  onSelectDone?: () => void;
}) {
  const { openDesk } = useStudioNavigation();
  const openTerminalTab = useOpenTerminalTab();
  const queryClient = useQueryClient();
  const routeOrgId = useOrgId();
  const sessions = useOrgTerminals();
  const rows: {
    projectId: string;
    session: TerminalSessionRecord;
  }[] = [];
  for (const session of sessions) {
    rows.push({
      projectId: session.projectId || routeOrgId || '',
      session,
    });
  }
  const remove = useMutation({
    mutationFn: ({
      projectId,
      sessionId,
      agent,
    }: {
      projectId: string;
      sessionId: string;
      agent: boolean;
    }) => (agent ? deleteOrgTerminal(sessionId) : deleteTerminal(projectId, sessionId)),
    onSuccess: (_void, variables) => {
      useIdeStore.getState().closeByEntity(variables.projectId, 'terminal', variables.sessionId);
      void queryClient.invalidateQueries({ queryKey: deskTerminalsKey });
      if (activeSessionId === variables.sessionId) {
        openDesk();
      }
    },
    onError: (error) => {
      toast.add({
        title: 'Failed to delete terminal',
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });
  const stop = useMutation({
    mutationFn: ({
      projectId,
      sessionId,
      agent,
    }: {
      projectId: string;
      sessionId: string;
      agent: boolean;
    }) => (agent ? stopOrgTerminal(sessionId) : stopTerminal(projectId, sessionId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: deskTerminalsKey });
    },
    onError: (error) => {
      toast.add({
        title: 'Failed to stop terminal',
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });
  const rename = useMutation({
    mutationFn: ({
      projectId,
      sessionId,
      agent,
      title,
    }: {
      projectId: string;
      sessionId: string;
      agent: boolean;
      title: string;
    }) =>
      agent ? renameOrgTerminal(sessionId, title) : renameTerminal(projectId, sessionId, title),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: deskTerminalsKey });
    },
    onError: (error) => {
      toast.add({
        title: 'Failed to rename terminal',
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });
  if (rows.length === 0) {
    return (
      <TerminalCreateMenu
        onCreated={onSelectDone}
        trigger={<SidebarEmpty title="No terminals" interactive testId="terminals-empty" />}
      />
    );
  }
  return (
    <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
      {rows.map(({ projectId, session }) => (
        <TerminalRow
          key={session.id}
          session={session}
          selected={activeSessionId === session.id}
          onSelect={() => {
            openTerminalTab(projectId, session.id);
            onSelectDone?.();
          }}
          onStop={() =>
            stop.mutate({
              projectId,
              sessionId: session.id,
              agent: session.origin === 'agent',
            })
          }
          onDelete={() =>
            remove.mutate({
              projectId,
              sessionId: session.id,
              agent: session.origin === 'agent',
            })
          }
          onRename={(title) =>
            rename.mutate({
              projectId,
              sessionId: session.id,
              agent: session.origin === 'agent',
              title,
            })
          }
        />
      ))}
    </div>
  );
}
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
function TerminalRow({
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
