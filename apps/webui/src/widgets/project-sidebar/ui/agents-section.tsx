import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Agent } from '@/entities/agent';
import { useDepartmentStore } from '@/entities/department';
import { useThreadStore } from '@/entities/thread';
import { useAgentsDisplayStore } from '@/features/desk';
import {
  openAgentConfigDialog,
  updateAgent,
  updateAgentCapabilities,
} from '@/features/manage-agent';
import { orgAgentCapabilitiesQueryKey } from '@/shared/api/org-capabilities';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/toast';
import { AgentGroupRow } from './agent-group-row';
import { useCreateAgentFlow } from './agents-create-button';
import { AgentMoveMenu, DepartmentGroup } from './department-row';
import { SidebarEmpty } from './sidebar-empty';

export { AgentsSectionActions } from './agents-section-menu';
export function AgentsSection({
  agents,
  activeAgentId,
  activeThreadId,
  onSelectDone,
  loading = false,
}: {
  agents: Agent[];
  activeAgentId: string | null;
  activeThreadId: string | null;
  onSelectDone: () => void;
  loading?: boolean;
}) {
  const createAgent = useCreateAgentFlow(onSelectDone);
  const queryClient = useQueryClient();
  const expanded = useAgentsDisplayStore((state) => state.expanded);
  const toggleExpanded = useAgentsDisplayStore((state) => state.toggle);
  const departments = useDepartmentStore(
    useShallow((state) =>
      state.items.filter((item) => agents.some((agent) => agent.orgId === item.orgId)),
    ),
  );
  const roots = agents.filter((item) => !item.parentId);
  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    const thread = useThreadStore.getState().byId(activeThreadId);
    if (!thread) {
      return;
    }
    const memberIds = new Set(thread.members.map((member) => member.id));
    for (const owner of roots) {
      if (memberIds.has(owner.id)) {
        useAgentsDisplayStore.getState().expand(owner.id);
      }
    }
  }, [activeThreadId, roots]);
  if (roots.length === 0) {
    if (loading) {
      return (
        <div className="flex flex-col gap-1 px-1 group-data-[collapsible=icon]:hidden">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      );
    }
    return <SidebarEmpty title="No agents yet" onAction={createAgent} testId="agents-empty" />;
  }
  const openSettings = (item: Agent) => {
    void openAgentConfigDialog(item, item.orgId).then(async (result) => {
      if (!result) {
        return;
      }
      if (result.deleted) {
        useAgentsDisplayStore.getState().forget(item.id);
        return;
      }
      try {
        await updateAgent(item.orgId, item.id, result.fields);
        await updateAgentCapabilities(item.orgId, item.id, result.capabilities);
        await queryClient.invalidateQueries({
          queryKey: orgAgentCapabilitiesQueryKey(item.orgId, item.id),
        });
      } catch (error) {
        toast.add({
          title: error instanceof Error ? error.message : 'Could not save agent',
        });
      }
    });
  };
  const departmentMembers = (departmentId: string, orgId: string) =>
    roots.filter((agent) => agent.orgId === orgId && agent.departmentId === departmentId);
  const groupedIds = new Set(
    departments.flatMap((department) =>
      departmentMembers(department.id, department.orgId).map((agent) => agent.id),
    ),
  );
  const ungrouped = roots.filter((agent) => !groupedIds.has(agent.id));
  const renderAgent = (item: Agent) => (
    <AgentGroupRow
      key={item.id}
      agent={item}
      expanded={Boolean(expanded[item.id])}
      selected={activeAgentId === item.id}
      activeThreadId={activeThreadId}
      onSelectDone={onSelectDone}
      onToggleExpanded={() => toggleExpanded(item.id)}
      onSettings={() => openSettings(item)}
      moveAction={<AgentMoveMenu agent={item} />}
    />
  );
  return (
    <div className="flex flex-col group-data-[collapsible=icon]:items-center">
      {departments.map((department) => (
        <DepartmentGroup
          key={department.id}
          department={department}
          members={departmentMembers(department.id, department.orgId)}
          activeAgentId={activeAgentId}
          activeThreadId={activeThreadId}
          onSelectDone={onSelectDone}
          onAgentSettings={openSettings}
        />
      ))}
      {ungrouped.map(renderAgent)}
    </div>
  );
}
