import { formatTokenCount } from '@/entities/session';
import type { UsagePricingSource, UsageRunRow, UsageRunsReport } from '@/entities/usage';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatDayTime } from '@/shared/lib/format-clock';
import { formatUsd } from '@/shared/lib/format-price';
import { Badge } from '@/shared/ui/badge';
import { toast } from '@/shared/ui/toast';

const PRICING_SOURCE_LABEL: Record<UsagePricingSource, string> = {
  catalog: 'catalog',
  manual: 'manual',
  provider: 'provider',
  none: 'no price',
};

export interface UsageRunsTableProps {
  report: UsageRunsReport;
  agentNames: Record<string, string>;
}

export function UsageRunsTable({ report, agentNames }: UsageRunsTableProps) {
  const rows = [...report.rows].sort((left, right) => right.costUsd - left.costUsd);
  return (
    <div className="overflow-hidden rounded-lg border" data-testid="usage-runs-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-muted-foreground text-xs">
            <th className="px-3 py-2 font-medium">Run</th>
            <th className="px-3 py-2 font-medium">Agent</th>
            <th className="px-3 py-2 font-medium">Model</th>
            <th className="px-3 py-2 text-right font-medium">Tokens</th>
            <th className="px-3 py-2 text-right font-medium">Cost</th>
            <th className="px-3 py-2 font-medium">Price source</th>
            <th className="px-3 py-2 text-right font-medium">Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <RunRow key={row.runId} row={row} agentNames={agentNames} />
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
            <td />
            <td className="px-3 py-2 text-right font-mono text-xs">{report.totals.runs}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function RunRow({ row, agentNames }: { row: UsageRunRow; agentNames: Record<string, string> }) {
  const timeZone = useOrgTimeZone();
  const tokens = row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens;
  return (
    <tr className="border-b last:border-b-0" data-testid="usage-run-row">
      <td className="px-3 py-2">
        <button
          type="button"
          className="font-mono text-xs hover:underline"
          title={row.runId}
          onClick={() => {
            void navigator.clipboard
              .writeText(row.runId)
              .then(() => toast.add({ title: 'Run id copied', description: row.runId }))
              .catch(() => toast.add({ title: 'Could not copy run id' }));
          }}
        >
          {row.runId.slice(0, 8)}
        </button>
      </td>
      <td className="px-3 py-2 text-xs">{agentLabel(row, agentNames)}</td>
      <td className="px-3 py-2 font-mono text-xs">{row.model}</td>
      <td className="px-3 py-2 text-right font-mono text-xs">{formatTokenCount(tokens)}</td>
      <td className="px-3 py-2 text-right font-mono text-xs">{formatUsd(row.costUsd)}</td>
      <td className="px-3 py-2">
        <Badge variant="outline">{PRICING_SOURCE_LABEL[row.pricingSource]}</Badge>
      </td>
      <td className="px-3 py-2 text-right text-muted-foreground text-xs">
        {formatDayTime(row.ts, timeZone)}
      </td>
    </tr>
  );
}

function agentLabel(row: UsageRunRow, agentNames: Record<string, string>): string {
  if (row.agentId === null) {
    return '—';
  }
  return agentNames[row.agentId] ?? row.agentId.slice(0, 8);
}
