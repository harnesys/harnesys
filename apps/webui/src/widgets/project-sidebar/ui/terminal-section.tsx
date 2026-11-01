import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, SquareTerminalIcon, Trash2Icon } from 'lucide-react';
import { useProjects } from '@/entities/project';
import { deskTerminalsKey, useOrgTerminals } from '@/features/desk';
import { useIdeStore, useOpenNewTerminal, useOpenTerminalTab } from '@/features/ide';
import { deleteOrgTerminal, deleteTerminal, type TerminalSessionRecord } from '@/shared/api';
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
          onDelete={() =>
            remove.mutate({
              projectId,
              sessionId: session.id,
              agent: session.origin === 'agent',
            })
          }
        />
      ))}
    </div>
  );
}
function TerminalRow({
  session,
  selected,
  onSelect,
  onDelete,
}: {
  session: TerminalSessionRecord;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
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
          ) : (
            <span
              className="size-1.5 shrink-0 rounded-full bg-emerald-500"
              data-testid={`terminal-active-${session.id}`}
            />
          )}
        </span>
      </button>
      <div className="hidden items-center gap-0.5 pr-1 group-focus-within/term:flex group-hover/term:flex">
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
