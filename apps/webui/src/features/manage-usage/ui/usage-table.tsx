import { formatTokenCount } from '@/entities/session';
import type { UsageGroupBy, UsageGroupRow, UsageReport } from '@/entities/usage';
import { formatUsd } from '@/shared/lib/format-price';
import { Badge } from '@/shared/ui/badge';
import { type BudgetLevel, budgetStatus, formatBudgetPercent } from '../model/budget';
import type { AgentBudgetInfo } from '../model/use-usage';
import { USAGE_SERIES } from './usage-chart';

function keyColumnLabel(groupBy: UsageGroupBy): string {
  if (groupBy === 'day') {
    return 'Day';
  }
  return 'Agent';
}

function rowKeyText(key: string | null, groupBy: UsageGroupBy): string {
  if (key === null) {
    return '—';
  }
  if (groupBy === 'day') {
    return key;
  }
  return key.slice(0, 8);
}

const BUDGET_BADGE_CLASS: Record<BudgetLevel, string> = {
  ok: 'text-muted-foreground',
  warn: 'bg-status-warn/15 text-status-warn',
  critical: 'bg-orange-500/15 text-orange-500',
  exhausted: 'bg-destructive/10 text-destructive',
};

export interface UsageTableProps {
  report: UsageReport;
  groupBy: UsageGroupBy;
  agentBudgets: Record<string, AgentBudgetInfo>;
  todaySpend: Record<string, number>;
}

export function UsageTable({ report, groupBy, agentBudgets, todaySpend }: UsageTableProps) {
  const { rows, totals } = report;
  const withBudget = groupBy === 'agent';
  return (
    <div className="overflow-hidden rounded-lg border" data-testid="usage-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-muted-foreground text-xs">
            <th className="px-3 py-2 font-medium">{keyColumnLabel(groupBy)}</th>
            {USAGE_SERIES.map((series) => (
              <th key={series.key} className="px-3 py-2 text-right font-medium">
                {series.label}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium">Cost</th>
            <th className="w-40 px-3 py-2 font-medium">Share</th>
            <th className="px-3 py-2 text-right font-medium">Runs</th>
            {withBudget ? (
              <>
                <th className="px-3 py-2 text-right font-medium">Budget/day</th>
                <th className="px-3 py-2 font-medium">% of budget</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <UsageRow
              key={row.key ?? 'none'}
              row={row}
              groupBy={groupBy}
              totalCost={totals.costUsd}
              budget={withBudget ? budgetOf(row, agentBudgets) : null}
              todayCost={withBudget && row.key !== null ? (todaySpend[row.key] ?? 0) : 0}
            />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/50 font-medium">
            <td className="px-3 py-2">Totals</td>
            {USAGE_SERIES.map((series) => (
              <td key={series.key} className="px-3 py-2 text-right font-mono text-xs">
                {formatTokenCount(totals[series.key])}
              </td>
            ))}
            <td className="px-3 py-2 text-right font-mono text-xs">{formatUsd(totals.costUsd)}</td>
            <td />
            <td />
            {withBudget ? (
              <>
                <td />
                <td />
              </>
            ) : null}
          </tr>
        </tfoot>
      </table>
      {withBudget ? (
        <p className="border-t px-3 py-2 text-muted-foreground text-xs">
          Budget is the agent daily limit; the percentage counts spend since the organization day
          boundary.
        </p>
      ) : null}
    </div>
  );
}

function budgetOf(
  row: UsageGroupRow,
  agentBudgets: Record<string, AgentBudgetInfo>,
): { label: string; budgetUsdDaily: number | null; name: string | null } {
  if (row.key === null) {
    return { label: '—', budgetUsdDaily: null, name: null };
  }
  const info = agentBudgets[row.key];
  if (!info) {
    return { label: '—', budgetUsdDaily: null, name: null };
  }
  return {
    label: info.budgetUsdDaily === null ? '—' : formatUsd(info.budgetUsdDaily),
    budgetUsdDaily: info.budgetUsdDaily,
    name: info.name,
  };
}

function UsageRow({
  row,
  groupBy,
  totalCost,
  budget,
  todayCost,
}: {
  row: UsageGroupRow;
  groupBy: UsageGroupBy;
  totalCost: number;
  budget: { label: string; budgetUsdDaily: number | null; name: string | null } | null;
  todayCost: number;
}) {
  const share = totalCost > 0 ? Math.min(100, (row.costUsd / totalCost) * 100) : 0;
  const status = budget ? budgetStatus(todayCost, budget.budgetUsdDaily) : null;
  return (
    <tr className="border-b last:border-b-0" data-testid="usage-row">
      <td className="px-3 py-2">
        <span className="flex items-center gap-2">
          <span className={groupBy === 'day' ? '' : 'font-mono text-xs'}>
            {rowKeyText(row.key, groupBy)}
          </span>
          {budget?.name ? (
            <span className="text-muted-foreground text-xs">{budget.name}</span>
          ) : null}
          {row.unpriced > 0 && (
            <Badge variant="outline" title={`${row.unpriced} runs without a price`}>
              unpriced
            </Badge>
          )}
        </span>
      </td>
      {USAGE_SERIES.map((series) => (
        <td key={series.key} className="px-3 py-2 text-right font-mono text-xs">
          {formatTokenCount(row[series.key])}
        </td>
      ))}
      <td className="px-3 py-2 text-right font-mono text-xs">{formatUsd(row.costUsd)}</td>
      <td className="px-3 py-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${share}%` }} />
        </div>
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">{row.runs}</td>
      {budget ? (
        <>
          <td className="px-3 py-2 text-right font-mono text-xs">{budget.label}</td>
          <td className="px-3 py-2">
            {status ? (
              <Badge variant="outline" className={BUDGET_BADGE_CLASS[status.level]}>
                {formatBudgetPercent(status.percent)}
              </Badge>
            ) : (
              <span className="text-muted-foreground text-xs">—</span>
            )}
          </td>
        </>
      ) : null}
    </tr>
  );
}
