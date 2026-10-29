import { formatTokenCount } from '@/entities/session';
import type { UsageMemberRow } from '@/entities/usage';
import { RowListSkeleton, SettingsEmpty, SettingsSection } from '@/shared/ui/settings-kit';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import {
  groupAllowedForPreset,
  USAGE_GROUP_OPTIONS,
  USAGE_RANGE_PRESETS,
} from '../model/usage-filters';
import { useUsageBoard } from '../model/use-usage';
import { UsageChart } from './usage-chart';
import { UsageRunsTable } from './usage-runs-table';
import { UsageTable } from './usage-table';

export function UsageBoard({ orgId }: { orgId: string }) {
  const board = useUsageBoard(orgId);
  if (board.isLoading) {
    return (
      <SettingsSection label="Usage" description="Tokens and cost for this organization.">
        <RowListSkeleton rows={4} testId="usage-loading" />
      </SettingsSection>
    );
  }
  if (!board.report || board.report.rows.length === 0) {
    return (
      <SettingsEmpty
        title="No usage in this range"
        description="Run agents to see token and cost aggregates for the selected range and grouping."
        testId="usage-empty"
      />
    );
  }
  const unpricedRuns = board.report.rows.reduce((sum, row) => sum + row.unpriced, 0);
  return (
    <div className="flex w-full flex-col gap-8" data-testid="usage-board">
      <UsageChart
        rows={board.report.rows}
        groupBy={board.groupBy}
        preset={board.preset}
        agentOptions={board.agentOptions}
        selectedAgents={board.agents}
        perAgentRows={board.perAgentRows}
        onToggleAgent={board.toggleAgent}
        onClearAgents={board.clearAgents}
      />
      {board.report.byMember.length > 0 ? (
        <SettingsSection
          label="Usage by member"
          description="Tokens and cost grouped by the member who started each run."
        >
          <MemberTable byMember={board.report.byMember} />
        </SettingsSection>
      ) : null}
      <SettingsSection
        label="Report"
        description={
          unpricedRuns > 0
            ? `Tokens and cost for this organization. ${unpricedRuns} runs have no price.`
            : 'Tokens and cost for this organization.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              variant="segment"
              value={[board.groupBy]}
              onValueChange={(next) => {
                const picked = next[0];
                if (picked === undefined) {
                  return;
                }
                const found = USAGE_GROUP_OPTIONS.find((option) => option.value === picked);
                if (found !== undefined) {
                  board.setGroupBy(found.value);
                }
              }}
              data-testid="usage-group-toggle"
            >
              {USAGE_GROUP_OPTIONS.filter((option) =>
                groupAllowedForPreset(option.value, board.preset),
              ).map((option) => (
                <ToggleGroupItem key={option.value} value={option.value}>
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <ToggleGroup
              variant="segment"
              value={[String(board.preset)]}
              onValueChange={(next) => {
                const picked = next[0];
                if (picked === undefined) {
                  return;
                }
                const found = USAGE_RANGE_PRESETS.find((preset) => String(preset) === picked);
                if (found !== undefined) {
                  board.setPreset(found);
                }
              }}
              data-testid="usage-range-toggle"
            >
              {USAGE_RANGE_PRESETS.map((preset) => (
                <ToggleGroupItem key={preset} value={String(preset)}>
                  {preset}d
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        }
      >
        <UsageTable
          report={board.report}
          groupBy={board.groupBy}
          agentBudgets={board.agentBudgets}
          todaySpend={board.todaySpend}
        />
      </SettingsSection>
      {board.runs ? (
        <SettingsSection
          label="Runs"
          description="Cost per run for the selected range, most expensive first."
        >
          <UsageRunsTable report={board.runs} agentNames={board.agentNames} />
        </SettingsSection>
      ) : null}
    </div>
  );
}

function memberLabel(row: UsageMemberRow): string {
  if (row.name) {
    return row.name;
  }
  if (row.userId) {
    return `${row.userId.slice(0, 8)}...`;
  }
  return 'Unattributed';
}

function MemberTable({ byMember }: { byMember: UsageMemberRow[] }) {
  const totalCost = byMember.reduce((sum, row) => sum + row.costUsd, 0);
  return (
    <div className="overflow-hidden rounded-lg border" data-testid="usage-member-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-muted-foreground text-xs">
            <th className="px-3 py-2 font-medium">Member</th>
            <th className="px-3 py-2 text-right font-medium">Tokens</th>
            <th className="px-3 py-2 text-right font-medium">Cost</th>
            <th className="w-40 px-3 py-2 font-medium">Share</th>
            <th className="px-3 py-2 text-right font-medium">Runs</th>
          </tr>
        </thead>
        <tbody>
          {byMember.map((row) => {
            const tokens =
              row.inputTokens +
              row.outputTokens +
              row.cacheReadTokens +
              row.cacheWriteTokens +
              row.reasoningTokens;
            const share = totalCost > 0 ? Math.min(100, (row.costUsd / totalCost) * 100) : 0;
            return (
              <tr
                key={row.userId ?? 'none'}
                className="border-b last:border-b-0"
                data-testid="usage-member-row"
              >
                <td className="px-3 py-2">{memberLabel(row)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {formatTokenCount(tokens)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  ${row.costUsd.toFixed(4)}
                </td>
                <td className="px-3 py-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${share}%` }} />
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">{row.runs}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
