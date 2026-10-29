import type { BoardStatus, IssueRecord } from '@harnesys/studio-shared';
import { RotateCcwIcon } from 'lucide-react';
import type { Agent } from '@/entities/agent';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { nudgeIssueRecord } from '@/shared/api';
import { formatFullDate } from '@/shared/lib/format-clock';
import { cn } from '@/shared/lib/utils';
import { toast } from '@/shared/ui/toast';
import { statusOf } from '../../model/board-columns';

export function IssueFireTrail({
  orgId,
  issue,
  agents,
  statuses,
}: {
  orgId: string;
  issue: IssueRecord;
  agents: Agent[];
  statuses: BoardStatus[];
}) {
  const timeZone = useOrgTimeZone();
  return (
    <ul className="space-y-2">
      {[...issue.fireTrail].reverse().map((entry, index) => {
        const agent = agents.find((item) => item.id === entry.agentId);
        const failed = entry.outcome === 'failed';
        return (
          <li key={`${entry.at}-${entry.agentId}-${index}`} className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5">
              <span className="font-medium text-foreground">{agent?.name ?? 'agent'}</span>
              <span className="rounded bg-muted px-1 font-mono text-[10px] uppercase">
                {entry.reason}
              </span>
              {entry.outcome && entry.outcome !== 'fired' ? (
                <span
                  className={cn(
                    'rounded px-1 font-mono text-[10px] uppercase',
                    failed
                      ? 'bg-destructive/15 text-destructive'
                      : 'bg-status-warn/15 text-status-warn',
                  )}
                >
                  {entry.outcome}
                </span>
              ) : null}
            </span>
            <span className="text-[10px] text-muted-foreground/70">
              {statusOf(statuses, entry.statusKey)?.label ?? entry.statusKey} ·{' '}
              {formatFullDate(entry.at, timeZone)}
            </span>
            {entry.error ? (
              <span
                className="break-words font-mono text-[10px] text-destructive"
                title={entry.error}
              >
                {entry.error}
              </span>
            ) : null}
            {failed && index === 0 ? <FireRetryButton orgId={orgId} issueId={issue.id} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

function FireRetryButton({ orgId, issueId }: { orgId: string; issueId: string }) {
  return (
    <button
      type="button"
      className="inline-flex w-fit items-center gap-1 rounded-md border border-destructive/35 px-2 py-0.5 text-[11px] text-destructive transition-colors hover:bg-destructive/10"
      onClick={() => {
        void nudgeIssueRecord(orgId, issueId).catch((error: unknown) => {
          toast.add({
            title: 'Re-run failed',
            description: error instanceof Error ? error.message : 'Retry failed',
            type: 'error',
          });
        });
      }}
    >
      <RotateCcwIcon className="size-3" />
      Re-run
    </button>
  );
}
