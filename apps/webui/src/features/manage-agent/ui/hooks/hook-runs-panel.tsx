import type { HookRunStatus } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { listAgentHookRuns } from '@/shared/api';
import { RowChip, RowSection } from '@/shared/ui/capability-rows';

const STATUS_TONES: Record<HookRunStatus, 'neutral' | 'danger' | 'ok' | 'warn'> = {
  ok: 'ok',
  blocked: 'danger',
  failed: 'danger',
  timeout: 'warn',
  skipped: 'neutral',
  denied: 'neutral',
};

export function HookRunsPanel({ orgId, agentId }: { orgId: string; agentId: string }) {
  const runs = useQuery({
    queryKey: ['agent-hook-runs', orgId, agentId],
    queryFn: () => listAgentHookRuns(orgId, agentId, 10),
    enabled: Boolean(orgId) && Boolean(agentId),
  });
  const items = runs.data?.items ?? [];
  if (items.length === 0) {
    return null;
  }
  return (
    <RowSection label="Last runs">
      <div className="flex flex-col gap-0.5">
        {items.map((run) => (
          <div key={run.id} className="flex min-w-0 items-center gap-2 px-1 py-0.5">
            <RowChip tone={STATUS_TONES[run.status]}>{run.status}</RowChip>
            <span className="truncate font-mono text-[12px]">{run.event}</span>
            <span className="truncate text-[11px] text-muted-foreground">{run.handlerType}</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {run.durationMs} ms
            </span>
            {run.summary ? (
              <span className="truncate text-[11px] text-muted-foreground">{run.summary}</span>
            ) : null}
          </div>
        ))}
      </div>
    </RowSection>
  );
}
