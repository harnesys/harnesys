import type { Agent } from '@/entities/agent';
import { AgentRecordAvatar } from '@/entities/agent';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { dialog } from '@/shared/services/overlay';

function AgentPickDialog({
  data,
  onResolve,
}: DialogComponentProps<string | null, { agents: Agent[] }>) {
  const agents = data?.agents ?? [];
  return (
    <div className="flex flex-col gap-1" data-testid="agent-pick-dialog">
      {agents.map((agent) => (
        <button
          key={agent.id}
          type="button"
          data-testid={`agent-pick-${agent.id}`}
          className="flex items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
          onClick={() => onResolve?.(agent.id)}
        >
          <AgentRecordAvatar agent={agent} />
          <span className="truncate">{agent.name}</span>
        </button>
      ))}
    </div>
  );
}
export function pickAgent(agents: Agent[]): Promise<string | null> {
  if (agents.length === 0) {
    return Promise.resolve(null);
  }
  if (agents.length === 1) {
    return Promise.resolve(agents[0]?.id ?? null);
  }
  return dialog.open(AgentPickDialog, {
    title: 'Choose agent',
    description: 'The new thread belongs to this agent.',
    testId: 'agent-pick',
    data: { agents },
  });
}
