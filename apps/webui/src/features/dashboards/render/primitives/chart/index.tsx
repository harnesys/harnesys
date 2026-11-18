import type { LucideIcon } from 'lucide-react';
import { LineChartIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MouseHandlerDataParam } from 'recharts';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartConfig } from '@/shared/ui/chart';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/shared/ui/chart';
import { asNumeric, asRecordArray, asString } from '../coerce';
import type { PrimitiveComponentProps } from '../primitive-props';
import { WidgetEmptyState } from '../states';

export const ChartIcon: LucideIcon = LineChartIcon;

const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7'];

interface ChartSeries {
  key: string;
  color: string;
}

type ChartRow = Record<string, unknown>;

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry !== '');
}

function colorOf(colors: string[], index: number): string {
  return colors[index] ?? PALETTE[index % PALETTE.length] ?? '#6366f1';
}

function rowKeys(rows: ChartRow[], excluded: string): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key !== excluded) {
        keys.add(key);
      }
    }
  }
  return [...keys];
}

function numericKeys(rows: ChartRow[], keys: string[]): string[] {
  return keys.filter((key) => rows.some((row) => asNumeric(row[key]) !== undefined));
}

function declaredKeysOf(explicit: string[], single: string | undefined): string[] | undefined {
  if (explicit.length > 0) {
    return explicit;
  }
  if (single !== undefined) {
    return [single];
  }
  return undefined;
}

function chartIndexOf(raw: number | string | null | undefined): number | undefined {
  if (typeof raw === 'number') {
    return Number.isInteger(raw) ? raw : undefined;
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    return Number.isInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function ChartPrimitive({ props, emit }: PrimitiveComponentProps): ReactNode {
  const rows = asRecordArray(props.data);
  if (rows.length === 0) {
    return <WidgetEmptyState message="No chart data" />;
  }
  const kind = asString(props.kind) ?? 'line';
  const xKey = asString(props.xKey) || 'name';
  const colors = stringList(props.colors);
  const explicitKeys = stringList(props.yKeys);
  const singleKey = asString(props.yKey);
  const declaredKeys = declaredKeysOf(explicitKeys, singleKey);
  const yKeys = numericKeys(rows, [...new Set(declaredKeys ?? rowKeys(rows, xKey))]);
  if (yKeys.length === 0) {
    return <WidgetEmptyState message="No numeric values to chart" />;
  }

  const emitPoint = (index: number): void => {
    if (!Number.isInteger(index) || index < 0 || index >= rows.length) {
      return;
    }
    const point = rows[index];
    if (point !== undefined) {
      emit('pointClick', { point, index });
    }
  };
  const onChartClick = (state: MouseHandlerDataParam): void => {
    const index = chartIndexOf(state.activeTooltipIndex ?? state.activeIndex);
    if (index !== undefined) {
      emitPoint(index);
    }
  };

  const series: ChartSeries[] = yKeys.map((key, index) => ({ key, color: colorOf(colors, index) }));
  const chartConfig: ChartConfig = {};
  for (const entry of series) {
    chartConfig[entry.key] = { label: entry.key, color: entry.color };
  }
  const chartRows = rows.map((row) => {
    const next: ChartRow = { ...row };
    for (const key of yKeys) {
      next[key] = asNumeric(row[key]) ?? null;
    }
    return next;
  });

  let chart: ReactNode;
  if (kind === 'pie') {
    const valueKey = yKeys[0];
    if (valueKey === undefined) {
      return <WidgetEmptyState message="No numeric values to chart" />;
    }
    chart = (
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Pie
          data={rows.map((row) => ({
            ...row,
            [valueKey]: Math.max(asNumeric(row[valueKey]) ?? 0, 0),
          }))}
          dataKey={valueKey}
          nameKey={xKey}
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={2}
          onClick={(_entry, index) => {
            emitPoint(index);
          }}
        >
          {rows.map((_row, index) => (
            <Cell key={index} fill={colorOf(colors, index)} />
          ))}
        </Pie>
      </PieChart>
    );
  } else if (kind === 'bar') {
    chart = (
      <BarChart data={chartRows} onClick={onChartClick}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {series.map((entry) => (
          <Bar key={entry.key} dataKey={entry.key} fill={entry.color} radius={3} />
        ))}
      </BarChart>
    );
  } else if (kind === 'area') {
    chart = (
      <AreaChart data={chartRows} onClick={onChartClick}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {series.map((entry) => (
          <Area
            key={entry.key}
            dataKey={entry.key}
            type="monotone"
            stroke={entry.color}
            fill={entry.color}
            fillOpacity={0.2}
            strokeWidth={2}
            dot={chartRows.length < 2}
          />
        ))}
      </AreaChart>
    );
  } else {
    chart = (
      <LineChart data={chartRows} onClick={onChartClick}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {series.map((entry) => (
          <Line
            key={entry.key}
            dataKey={entry.key}
            type="monotone"
            stroke={entry.color}
            strokeWidth={2}
            dot={chartRows.length < 2}
          />
        ))}
      </LineChart>
    );
  }

  return (
    <div className="h-full min-h-0 w-full overflow-hidden">
      <ChartContainer config={chartConfig} className="aspect-auto h-full w-full">
        {chart}
      </ChartContainer>
    </div>
  );
}
