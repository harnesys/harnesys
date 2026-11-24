import type { Agent } from '@/entities/agent';
import { AgentRecordAvatar } from '@/entities/agent';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { dialog } from '@/shared/services/overlay';

function DepartmentLeadDialog({
  data,
  onResolve,
}: DialogComponentProps<string | null, { agents: Agent[] }>) {
  const agents = data?.agents ?? [];
  return (
    <div className="flex flex-col gap-1" data-testid="department-lead-dialog">
      <button
        type="button"
        data-testid="department-lead-none"
        className="flex items-center gap-2.5 rounded-md border px-3 py-2 text-left text-muted-foreground text-sm transition-colors hover:bg-accent"
        onClick={() => onResolve?.(null)}
      >
        No lead
      </button>
      {agents.map((agent) => (
        <button
          key={agent.id}
          type="button"
          data-testid={`department-lead-${agent.id}`}
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

export function openDepartmentLeadDialog(agents: Agent[]): Promise<string | null> {
  return dialog.open(DepartmentLeadDialog, {
    title: 'Set department lead',
    description: 'The lead agent represents this department.',
    testId: 'department-lead',
    data: { agents },
  });
}
