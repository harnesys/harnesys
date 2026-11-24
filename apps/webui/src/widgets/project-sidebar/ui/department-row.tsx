import {
  ChevronDownIcon,
  ChevronRightIcon,
  CogIcon,
  FolderInputIcon,
  StarIcon,
} from 'lucide-react';
import type { Agent } from '@/entities/agent';
import type { Department } from '@/entities/department';
import { useDepartmentStore } from '@/entities/department';
import { useAgentsDisplayStore } from '@/features/desk';
import { moveAgentToDepartment, openDepartmentSettingsDialog } from '@/features/manage-department';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { SidebarRow, SidebarRowTitle } from '@/shared/ui/sidebar-row';
import { toast } from '@/shared/ui/toast';
import { AgentGroupRow } from './agent-group-row';

export function DepartmentGroup({
  department,
  members,
  activeAgentId,
  activeThreadId,
  onSelectDone,
  onAgentSettings,
}: {
  department: Department;
  members: Agent[];
  activeAgentId: string | null;
  activeThreadId: string | null;
  onSelectDone: () => void;
  onAgentSettings: (agent: Agent) => void;
}) {
  const expanded = useAgentsDisplayStore((state) => state.departmentExpanded[department.id]);
  const toggleDepartment = useAgentsDisplayStore((state) => state.toggleDepartment);
  const lead = members.find((agent) => agent.id === department.leadAgentId);
  const openSettings = async () => {
    const result = await openDepartmentSettingsDialog({ department, members });
    if (result === 'deleted') {
      useAgentsDisplayStore.getState().forgetDepartment(department.id);
    }
  };
  return (
    <div data-testid={`department-group-${department.id}`}>
      <SidebarRow
        testId={`department-row-${department.id}`}
        onClick={() => toggleDepartment(department.id)}
        leading={
          expanded ? (
            <ChevronDownIcon className="text-sidebar-foreground/50" />
          ) : (
            <ChevronRightIcon className="text-sidebar-foreground/50" />
          )
        }
        trailing={
          <span className="flex items-center gap-1 text-sidebar-foreground/50">
            {lead ? (
              <>
                <StarIcon className="size-3 fill-current text-live" />
                <span className="truncate">{lead.name}</span>
              </>
            ) : null}
            <span>{members.length}</span>
          </span>
        }
        actions={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            title="Department settings"
            data-testid={`department-settings-${department.id}`}
            onClick={(event) => {
              event.stopPropagation();
              void openSettings();
            }}
          >
            <CogIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
            <span className="sr-only">Department settings</span>
          </Button>
        }
      >
        <SidebarRowTitle className="ml-0.5">{department.name}</SidebarRowTitle>
      </SidebarRow>
      {expanded ? (
        <div className="ml-4 border-border/50 border-l pl-1">
          {members.map((agent) => (
            <DepartmentMemberRow
              key={agent.id}
              agent={agent}
              isLead={agent.id === department.leadAgentId}
              activeAgentId={activeAgentId}
              activeThreadId={activeThreadId}
              onSelectDone={onSelectDone}
              onAgentSettings={onAgentSettings}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DepartmentMemberRow({
  agent,
  isLead,
  activeAgentId,
  activeThreadId,
  onSelectDone,
  onAgentSettings,
}: {
  agent: Agent;
  isLead: boolean;
  activeAgentId: string | null;
  activeThreadId: string | null;
  onSelectDone: () => void;
  onAgentSettings: (agent: Agent) => void;
}) {
  const expanded = useAgentsDisplayStore((state) => Boolean(state.expanded[agent.id]));
  const toggle = useAgentsDisplayStore((state) => state.toggle);
  return (
    <AgentGroupRow
      agent={agent}
      expanded={expanded}
      selected={activeAgentId === agent.id}
      activeThreadId={activeThreadId}
      onSelectDone={onSelectDone}
      onToggleExpanded={() => toggle(agent.id)}
      onSettings={() => onAgentSettings(agent)}
      moveAction={<AgentMoveMenu agent={agent} />}
      avatarHighlight={isLead}
    />
  );
}

export function AgentMoveMenu({ agent }: { agent: Agent }) {
  const departments = useDepartmentStore((state) => state.items).filter(
    (item) => item.orgId === agent.orgId,
  );
  const move = async (departmentId: string | null) => {
    try {
      await moveAgentToDepartment(agent.orgId, agent.id, departmentId);
    } catch (error) {
      toast.add({
        title: error instanceof Error ? error.message : 'Could not move agent',
      });
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            title="Move to department"
            data-testid={`agent-move-${agent.id}`}
            onClick={(event) => event.stopPropagation()}
          >
            <FolderInputIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
            <span className="sr-only">Move to department</span>
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        {departments.map((department) => (
          <DropdownMenuItem
            key={department.id}
            data-testid={`agent-move-${agent.id}-${department.id}`}
            onClick={() => void move(department.id)}
          >
            {department.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem
          data-testid={`agent-move-${agent.id}-none`}
          onClick={() => void move(null)}
        >
          No department
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
