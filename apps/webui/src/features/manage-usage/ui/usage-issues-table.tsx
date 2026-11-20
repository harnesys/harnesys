import { formatTokenCount } from '@/entities/session';
import type { UsageIssueRow, UsageIssuesReport } from '@/entities/usage';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatDayTime } from '@/shared/lib/format-clock';
import { formatUsd } from '@/shared/lib/format-price';
import { Badge } from '@/shared/ui/badge';
import { toast } from '@/shared/ui/toast';

export interface UsageIssuesTableProps {
  report: UsageIssuesReport;
  agentNames: Record<string, string>;
}

export function UsageIssuesTable({ report, agentNames }: UsageIssuesTableProps) {
  const rows = [...report.rows].sort((left, right) => right.costUsd - left.costUsd);
  return (
    <div className="overflow-hidden rounded-lg border" data-testid="usage-issues-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-muted-foreground text-xs">
            <th className="px-3 py-2 font-medium">Issue</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Agent</th>
            <th className="px-3 py-2 text-right font-medium">Tokens</th>
            <th className="px-3 py-2 text-right font-medium">Cost</th>
            <th className="px-3 py-2 text-right font-medium">Runs</th>
            <th className="px-3 py-2 text-right font-medium">Last activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <IssueRow key={row.issueId} row={row} agentNames={agentNames} />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/50 font-medium">
            <td className="px-3 py-2" colSpan={3}>
              Totals
            </td>
            <td className="px-3 py-2 text-right font-mono text-xs">
              {formatTokenCount(report.totals.inputTokens + report.totals.outputTokens)}
            </td>
            <td className="px-3 py-2 text-right font-mono text-xs">
              {formatUsd(report.totals.costUsd)}
            </td>
            <td className="px-3 py-2 text-right font-mono text-xs">{report.totals.runs}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function agentNamesOf(row: UsageIssueRow, agentNames: Record<string, string>): string {
  if (row.agents.length === 0) {
    return '—';
  }
  return row.agents
    .map((agentId) => agentNames[agentId] ?? agentId.slice(0, 8))
    .join(', ');
}

function IssueRow({
  row,
  agentNames,
}: {
  row: UsageIssueRow;
  agentNames: Record<string, string>;
}) {
  const timeZone = useOrgTimeZone();
  const tokens = row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens;
  return (
    <tr className="border-b last:border-b-0" data-testid="usage-issue-row">
      <td className="px-3 py-2">
        <button
          type="button"
          className="max-w-[24rem] truncate text-left hover:underline"
          title={row.title}
          onClick={() => {
            void navigator.clipboard
              .writeText(row.issueId)
              .then(() => toast.add({ title: 'Issue id copied', description: row.issueId }))
              .catch(() => toast.add({ title: 'Could not copy issue id' }));
          }}
        >
          {row.title}
        </button>
      </td>
      <td className="px-3 py-2">
        <Badge variant="outline">{row.statusKey}</Badge>
      </td>
      <td className="px-3 py-2 text-xs">{agentNamesOf(row, agentNames)}</td>
      <td className="px-3 py-2 text-right font-mono text-xs">{formatTokenCount(tokens)}</td>
      <td className="px-3 py-2 text-right font-mono text-xs">{formatUsd(row.costUsd)}</td>
      <td className="px-3 py-2 text-right font-mono text-xs">{row.runs}</td>
      <td className="px-3 py-2 text-right text-muted-foreground text-xs">
        {formatDayTime(row.lastTs, timeZone)}
      </td>
    </tr>
  );
}
