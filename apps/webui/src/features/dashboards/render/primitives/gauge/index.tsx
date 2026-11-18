import type { LucideIcon } from 'lucide-react';
import { GaugeIcon as GaugeLucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { asNumeric, asText } from '../coerce';
import type { PrimitiveComponentProps } from '../primitive-props';
import { WidgetEmptyState } from '../states';

export const GaugeIcon: LucideIcon = GaugeLucideIcon;

const ARC_LENGTH = Math.PI * 40;
const ARC_PATH = 'M 10 50 A 40 40 0 0 1 90 50';

interface GaugeRange {
  min: number;
  max: number;
}

function rangeOf(min: number, max: number): GaugeRange {
  return max > min ? { min, max } : { min: 0, max: 100 };
}

export function GaugePrimitive({ props }: PrimitiveComponentProps): ReactNode {
  const value = asNumeric(props.value);
  if (value === undefined) {
    return <WidgetEmptyState message="Gauge has no value" />;
  }
  const label = asText(props.label);
  const range = rangeOf(asNumeric(props.min) ?? 0, asNumeric(props.max) ?? 100);
  const ratio = Math.min(Math.max((value - range.min) / (range.max - range.min), 0), 1);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 overflow-hidden p-1">
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <svg
          viewBox="0 0 100 58"
          className="h-full w-full"
          role="img"
          aria-label={label ?? 'Gauge'}
        >
          <path
            d={ARC_PATH}
            fill="none"
            stroke="var(--color-muted, #e5e7eb)"
            strokeWidth="9"
            strokeLinecap="round"
          />
          {ratio > 0 ? (
            <path
              d={ARC_PATH}
              fill="none"
              stroke="var(--color-primary, #6366f1)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${(ratio * ARC_LENGTH).toFixed(2)} ${ARC_LENGTH.toFixed(2)}`}
            />
          ) : null}
          <text
            x="50"
            y="48"
            textAnchor="middle"
            className="fill-foreground font-semibold text-sm"
            dominantBaseline="middle"
          >
            {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </text>
        </svg>
      </div>
      {label ? (
        <div className="w-full truncate text-center text-muted-foreground text-xs">{label}</div>
      ) : null}
    </div>
  );
}
