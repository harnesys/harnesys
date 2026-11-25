import { useQuery } from '@tanstack/react-query';
import { orgAddonTriggerScriptRunsQuery } from '@/shared/api/addon-trigger-scripts';
import { Badge } from '@/shared/ui/badge';

const VISIBLE_RUNS = 5;

export function TriggerScriptRunsList({
  orgId,
  addonId,
  instanceId,
}: {
  orgId: string;
  addonId: string;
  instanceId: string | undefined;
}) {
  const runs = useQuery(orgAddonTriggerScriptRunsQuery(orgId, addonId, instanceId ?? ''));
  const items = runs.data?.items.slice(0, VISIBLE_RUNS) ?? [];
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        Recent script runs
      </p>
      {items.map((run) => (
        <div key={run.id} className="flex items-center gap-2 text-xs">
          <Badge variant="outline">{run.stage}</Badge>
          <span className={run.status === 'ok' ? 'text-muted-foreground' : 'text-destructive'}>
            {run.summary ?? run.status}
          </span>
          <span className="text-muted-foreground">{run.durationMs} ms</span>
        </div>
      ))}
    </div>
  );
}
