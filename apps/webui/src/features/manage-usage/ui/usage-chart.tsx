import { ChevronsUpDownIcon, UsersIcon, XIcon } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { formatTokenCount } from '@/entities/session';
import type { UsageGroupBy, UsageGroupRow } from '@/entities/usage';
import { formatDayKey } from '@/shared/lib/format-clock';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/shared/ui/chart';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { SettingsSection } from '@/shared/ui/settings-kit';

const CHART_SERIES = [
  { key: 'inputTokens', label: 'Input', color: 'var(--chart-1)' },
  { key: 'outputTokens', label: 'Output', color: 'var(--chart-2)' },
  { key: 'cacheReadTokens', label: 'Cache read', color: 'var(--chart-3)' },
  { key: 'cacheWriteTokens', label: 'Cache write', color: 'var(--chart-4)' },
  { key: 'reasoningTokens', label: 'Reasoning', color: 'var(--chart-5)' },
] as const;

export const USAGE_SERIES = CHART_SERIES;

type ChartSeriesKey =
  | 'inputTokens'
  | 'outputTokens'
  | 'cacheReadTokens'
  | 'cacheWriteTokens'
  | 'reasoningTokens';

const kindChartConfig = {
  inputTokens: { label: 'Input', color: 'var(--chart-1)' },
  outputTokens: { label: 'Output', color: 'var(--chart-2)' },
  cacheReadTokens: { label: 'Cache read', color: 'var(--chart-3)' },
  cacheWriteTokens: { label: 'Cache write', color: 'var(--chart-4)' },
  reasoningTokens: { label: 'Reasoning', color: 'var(--chart-5)' },
} satisfies ChartConfig;

function agentColor(index: number): string {
  return `var(--chart-${(index % 5) + 1})`;
}

function shortAgent(agentId: string): string {
  return agentId.slice(0, 8);
}

interface TimePoint {
  key: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
}

interface AgentPoint {
  key: string;
  [agentId: string]: string | number;
}

function timeKey(key: string | null, groupBy: UsageGroupBy): string {
  if (key === null) {
    return '—';
  }
  if (groupBy === 'agent') {
    return key.slice(0, 8);
  }
  return key;
}

function toTimePoints(rows: UsageGroupRow[], groupBy: UsageGroupBy): TimePoint[] {
  const points = rows.map((row) => ({
    key: timeKey(row.key, groupBy),
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheReadTokens: row.cacheReadTokens,
    cacheWriteTokens: row.cacheWriteTokens,
    reasoningTokens: row.reasoningTokens,
  }));
  if (groupBy !== 'agent') {
    return [...points].sort((a, b) => a.key.localeCompare(b.key));
  }
  return points;
}

function toAgentPoints(perAgentRows: { agentId: string; rows: UsageGroupRow[] }[]): AgentPoint[] {
  const keys = [
    ...new Set(perAgentRows.flatMap((entry) => entry.rows.map((row) => row.key ?? '—'))),
  ];
  keys.sort();
  const totalOf = (rows: UsageGroupRow[], key: string): number =>
    rows
      .filter((row) => (row.key ?? '—') === key)
      .reduce(
        (sum, row) =>
          sum +
          row.inputTokens +
          row.outputTokens +
          row.cacheReadTokens +
          row.cacheWriteTokens +
          row.reasoningTokens,
        0,
      );
  return keys.map((key) => {
    const point: AgentPoint = { key };
    for (const entry of perAgentRows) {
      point[entry.agentId] = totalOf(entry.rows, key);
    }
    return point;
  });
}

function agentChartConfig(perAgentRows: { agentId: string }[]): ChartConfig {
  return Object.fromEntries(
    perAgentRows.map((entry, index) => [
      entry.agentId,
      { label: shortAgent(entry.agentId), color: agentColor(index) },
    ]),
  );
}

function tickFormatterFor(groupBy: UsageGroupBy): (value: string) => string {
  if (groupBy === 'day') {
    return (value) => formatDayKey(value);
  }
  if (groupBy === 'hour') {
    return (value) => value.slice(5, 13);
  }
  if (groupBy === 'minute') {
    return (value) => value.slice(11, 16);
  }
  return (value) => value;
}

function rangeLabel(preset: number, comparing: boolean): string {
  const range = preset === 1 ? 'Last 24 hours' : `Last ${preset} days`;
  if (comparing) {
    return `${range}, total tokens per agent`;
  }
  return `${range}, stacked by token kind`;
}

function AgentFilter({
  options,
  selected,
  onToggle,
  onClear,
}: {
  options: string[];
  selected: string[];
  onToggle: (agentId: string) => void;
  onClear: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 font-medium text-sm shadow-xs outline-none hover:bg-muted disabled:opacity-50">
        <UsersIcon className="size-3.5 text-muted-foreground" />
        {selected.length === 0 ? 'All agents' : `${selected.length} selected`}
        <ChevronsUpDownIcon className="size-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Agents</DropdownMenuLabel>
          {options.map((agentId) => (
            <DropdownMenuCheckboxItem
              key={agentId}
              checked={selected.includes(agentId)}
              onCheckedChange={() => onToggle(agentId)}
              onSelect={(event) => event.preventDefault()}
            >
              <span className="font-mono text-xs">{shortAgent(agentId)}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        {selected.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onClear}>
              <XIcon className="size-3" />
              Reset to all
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface UsageChartProps {
  rows: UsageGroupRow[];
  groupBy: UsageGroupBy;
  preset: number;
  agentOptions: string[];
  selectedAgents: string[];
  perAgentRows: { agentId: string; rows: UsageGroupRow[] }[];
  onToggleAgent: (agentId: string) => void;
  onClearAgents: () => void;
}

export function UsageChart({
  rows,
  groupBy,
  preset,
  agentOptions,
  selectedAgents,
  perAgentRows,
  onToggleAgent,
  onClearAgents,
}: UsageChartProps) {
  const comparing = selectedAgents.length >= 2;
  const activeRows = selectedAgents.length === 1 ? (perAgentRows[0]?.rows ?? []) : rows;
  const data = comparing ? toAgentPoints(perAgentRows) : toTimePoints(activeRows, groupBy);
  const config: ChartConfig = comparing ? agentChartConfig(perAgentRows) : kindChartConfig;
  const seriesKeys = comparing
    ? perAgentRows.map((entry) => entry.agentId)
    : CHART_SERIES.map((series) => series.key);
  const title = comparing ? 'Tokens by day, per agent' : `Tokens by ${groupBy}`;
  return (
    <SettingsSection
      label={title}
      description={rangeLabel(preset, comparing)}
      actions={
        <AgentFilter
          options={agentOptions}
          selected={selectedAgents}
          onToggle={onToggleAgent}
          onClear={onClearAgents}
        />
      }
    >
      <ChartContainer config={config} className="aspect-auto h-64 w-full">
        <AreaChart data={data as TimePoint[]} margin={{ left: -16, right: 0 }}>
          <defs>
            {seriesKeys.map((seriesKey) => (
              <linearGradient key={seriesKey} id={`fill-${seriesKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={`var(--color-${seriesKey})`} stopOpacity={0.8} />
                <stop offset="95%" stopColor={`var(--color-${seriesKey})`} stopOpacity={0.1} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="key"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={32}
            tickFormatter={tickFormatterFor(comparing ? 'day' : groupBy)}
          />
          <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={formatTokenCount} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                indicator="dot"
                formatter={(value, name) => (
                  <div className="flex w-full items-center justify-between gap-4">
                    <span className="text-muted-foreground">
                      {config[name ?? '']?.label ?? name}
                    </span>
                    <span className="font-medium font-mono text-foreground tabular-nums">
                      {formatTokenCount(Number(value))}
                    </span>
                  </div>
                )}
              />
            }
          />
          {seriesKeys.map((seriesKey) => (
            <Area
              key={seriesKey}
              dataKey={seriesKey}
              type="monotone"
              fill={`url(#fill-${seriesKey})`}
              stroke={`var(--color-${seriesKey})`}
              stackId="tokens"
            />
          ))}
          <ChartLegend content={<ChartLegendContent />} />
        </AreaChart>
      </ChartContainer>
    </SettingsSection>
  );
}

export type { ChartSeriesKey };
