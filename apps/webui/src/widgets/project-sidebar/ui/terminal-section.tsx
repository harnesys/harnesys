import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, SquareTerminalIcon } from 'lucide-react';
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
import { TerminalRow } from './terminal-row';

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
