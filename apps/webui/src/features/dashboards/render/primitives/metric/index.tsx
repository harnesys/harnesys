import type { LucideIcon } from 'lucide-react';
import { SparklesIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { asNumeric, asText } from '../coerce';
import type { PrimitiveComponentProps } from '../primitive-props';
import { WidgetEmptyState } from '../states';

export const MetricIcon: LucideIcon = SparklesIcon;

export type MetricFormat = 'number' | 'percent' | 'currency' | 'compact';

function asFormat(value: unknown): MetricFormat | undefined {
  if (value === 'number' || value === 'percent' || value === 'currency' || value === 'compact') {
    return value;
  }
  return undefined;
}

function formatValue(value: number, format: MetricFormat | undefined): string {
  switch (format) {
    case 'percent':
      return value.toLocaleString(undefined, { style: 'percent', maximumFractionDigits: 1 });
    case 'currency':
      return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
    case 'compact':
      return value.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });
    default:
      return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}

function trendClass(delta: number): string {
  if (delta > 0) {
    return 'text-emerald-600 dark:text-emerald-400';
  }
  return delta < 0 ? 'text-destructive' : 'text-muted-foreground';
}

function trendArrow(delta: number): string | null {
  if (delta > 0) {
    return '▲';
  }
  return delta < 0 ? '▼' : null;
}

function Sparkline({ values }: { values: number[] }): ReactNode {
  if (values.length === 0) {
    return null;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const flat = max === min;
  const range = flat ? 1 : max - min;
  const points =
    values.length === 1
      ? '0,15 100,15'
      : values
          .map((value, index) => {
            const x = (index / (values.length - 1)) * 100;
            const y = flat ? 15 : 28 - ((value - min) / range) * 24;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ');
  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className="h-full min-h-0 w-full text-muted-foreground"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MetricPrimitive({ props }: PrimitiveComponentProps): ReactNode {
  const value = asNumeric(props.value);
  if (value === undefined) {
    return <WidgetEmptyState message="Metric has no value" />;
  }
  const label = asText(props.label);
  const delta = asNumeric(props.delta);
  const deltaLabel = asText(props.deltaLabel);
  const format = asFormat(props.format);
  const sparkline = Array.isArray(props.sparkline)
    ? props.sparkline
        .map((entry) => asNumeric(entry))
        .filter((entry): entry is number => entry !== undefined)
    : [];

  return (
    <div className="flex h-full w-full flex-col justify-center gap-1 overflow-hidden p-1">
      {label ? <div className="truncate text-muted-foreground text-xs">{label}</div> : null}
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate font-semibold text-3xl tabular-nums leading-none">
          {formatValue(value, format)}
        </span>
        {delta !== undefined ? (
          <span className={`flex min-w-0 items-baseline gap-1 text-xs ${trendClass(delta)}`}>
            <span className="shrink-0 tabular-nums">
              {trendArrow(delta) ? `${trendArrow(delta)} ` : null}
              {formatValue(Math.abs(delta), format)}
            </span>
            {deltaLabel ? (
              <span className="truncate text-muted-foreground">{deltaLabel}</span>
            ) : null}
          </span>
        ) : null}
      </div>
      {sparkline.length > 0 ? (
        <div className="min-h-0 flex-1">
          <Sparkline values={sparkline} />
        </div>
      ) : null}
    </div>
  );
}
