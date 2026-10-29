import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontalIcon, PlusIcon, SquareTerminalIcon } from 'lucide-react';
import { useProjects } from '@/entities/project';
import { useIdeStore, useOpenNewTerminal, useOpenTerminalTab } from '@/features/ide';
import {
  deleteTerminal,
  listTerminals,
  type TerminalSessionRecord,
  terminalsQueryKey,
} from '@/shared/api';
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
  const projectQuery = useProjects();
  const projects = projectQuery.data ?? [];
  const { openDesk } = useStudioNavigation();
  const openTerminalTab = useOpenTerminalTab();
  const queryClient = useQueryClient();
  const sessionQueries = useQueries({
    queries: projects.map((project) => ({
      queryKey: terminalsQueryKey(project.id),
      queryFn: () => listTerminals(project.id),
      staleTime: 5000,
    })),
  });
  const rows: {
    projectId: string;
    session: TerminalSessionRecord;
  }[] = [];
  for (let i = 0; i < projects.length; i += 1) {
    const project = projects[i];
    const sessions = sessionQueries[i]?.data ?? [];
    for (const session of sessions) {
      if (project) {
        rows.push({ projectId: project.id, session });
      }
    }
  }
  const remove = useMutation({
    mutationFn: ({ projectId, sessionId }: { projectId: string; sessionId: string }) =>
      deleteTerminal(projectId, sessionId),
    onSuccess: (_void, variables) => {
      useIdeStore.getState().closeByEntity(variables.projectId, 'terminal', variables.sessionId);
      void queryClient.invalidateQueries({
        queryKey: terminalsQueryKey(variables.projectId),
      });
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
          onDelete={() => remove.mutate({ projectId, sessionId: session.id })}
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
        <span className="min-w-0 flex-1 truncate text-sm leading-4">{session.title}</span>
        {session.exited ? (
          <span className="shrink-0 text-[10px] text-muted-foreground">exited</span>
        ) : null}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-hover/term:opacity-100 data-open:opacity-100"
            />
          }
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontalIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
          <span className="sr-only">Terminal actions</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
          <DropdownMenuGroup>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Kill terminal
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
