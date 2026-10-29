import { Fragment, useEffect } from 'react';
import type { Agent } from '@/entities/agent';
import { useThreadStore } from '@/entities/thread';
import { AGENT_THREAD_KINDS, useAgentsDisplayStore } from '@/features/desk';
import {
  openAgentConfigDialog,
  updateAgent,
  updateAgentCapabilities,
} from '@/features/manage-agent';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/toast';
import { AgentCard } from '@/widgets/agent-card';
import { useThreadActions } from '../model/thread-actions';
import { AgentInlineThreads } from './agent-inline-threads';
import { AgentThreadsFilterMenu } from './agent-threads-filter';
import { useCreateAgentFlow } from './agents-create-button';
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
  const expanded = useAgentsDisplayStore((state) => state.expanded);
  const toggleExpanded = useAgentsDisplayStore((state) => state.toggle);
  const roots = agents.filter((item) => !item.parentId);
  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    const thread = useThreadStore.getState().byId(activeThreadId);
    if (!thread) {
      return;
    }
    const owner = roots.find(
      (item) => item.id === thread.agentId || item.id === thread.originAgentId,
    );
    if (owner) {
      useAgentsDisplayStore.getState().expand(owner.id);
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
      } catch (error) {
        toast.add({
          title: error instanceof Error ? error.message : 'Could not save agent',
        });
      }
    });
  };
  return (
    <div className="flex flex-col group-data-[collapsible=icon]:items-center">
      {roots.map((item) => (
        <AgentGroupRow
          key={item.id}
          agent={item}
          expanded={Boolean(expanded[item.id])}
          selected={activeAgentId === item.id}
          activeThreadId={activeThreadId}
          onSelectDone={onSelectDone}
          onToggleExpanded={() => toggleExpanded(item.id)}
          onSettings={() => openSettings(item)}
        />
      ))}
    </div>
  );
}
function AgentGroupRow({
  agent,
  expanded,
  selected,
  activeThreadId,
  onSelectDone,
  onToggleExpanded,
  onSettings,
}: {
  agent: Agent;
  expanded: boolean;
  selected: boolean;
  activeThreadId: string | null;
  onSelectDone: () => void;
  onToggleExpanded: () => void;
  onSettings: () => void;
}) {
  const actions = useThreadActions(agent.orgId);
  const kinds = useAgentsDisplayStore(
    (state) => state.threadKindFilter[agent.id] ?? AGENT_THREAD_KINDS,
  );
  const resetKinds = useAgentsDisplayStore((state) => state.resetKinds);
  return (
    <Fragment>
      <AgentCard
        agent={agent}
        selected={selected}
        onSelect={onToggleExpanded}
        onSettings={onSettings}
        onNewThread={() => actions.createThread(agent.id)}
        threadsFilter={<AgentThreadsFilterMenu agentId={agent.id} />}
      />
      {expanded ? (
        <AgentInlineThreads
          agent={agent}
          projectId={agent.orgId}
          activeThreadId={activeThreadId}
          onDone={onSelectDone}
          kinds={kinds}
          onResetKinds={() => resetKinds(agent.id)}
        />
      ) : null}
    </Fragment>
  );
}
