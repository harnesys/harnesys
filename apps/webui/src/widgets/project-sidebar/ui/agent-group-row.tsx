import { Fragment } from 'react';
import type { Agent } from '@/entities/agent';
import { AGENT_THREAD_KINDS, useAgentsDisplayStore } from '@/features/desk';
import { AgentCard } from '@/widgets/agent-card';
import { useThreadActions } from '../model/thread-actions';
import { AgentInlineThreads } from './agent-inline-threads';
import { AgentThreadsFilterMenu } from './agent-threads-filter';

export function AgentGroupRow({
  agent,
  expanded,
  selected,
  activeThreadId,
  onSelectDone,
  onToggleExpanded,
  onSettings,
  moveAction,
  avatarHighlight,
}: {
  agent: Agent;
  expanded: boolean;
  selected: boolean;
  activeThreadId: string | null;
  onSelectDone: () => void;
  onToggleExpanded: () => void;
  onSettings: () => void;
  moveAction?: React.ReactNode;
  avatarHighlight?: boolean;
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
        moveAction={moveAction}
        avatarHighlight={avatarHighlight}
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
