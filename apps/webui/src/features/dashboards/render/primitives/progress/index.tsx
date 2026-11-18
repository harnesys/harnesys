import type { LucideIcon } from 'lucide-react';
import { TrendingUpIcon as ProgressLucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Progress } from '@/shared/ui/progress';
import { asNumeric, asText } from '../coerce';
import type { PrimitiveComponentProps } from '../primitive-props';
import { WidgetEmptyState } from '../states';

export const ProgressIcon: LucideIcon = ProgressLucideIcon;

function asMax(value: unknown): number {
  const max = asNumeric(value);
  return max !== undefined && max > 0 ? max : 100;
}

export function ProgressPrimitive({ props }: PrimitiveComponentProps): ReactNode {
  const value = asNumeric(props.value);
  if (value === undefined) {
    return <WidgetEmptyState message="Progress has no value" />;
  }
  const max = asMax(props.max);
  const label = asText(props.label);
  const ratio = Math.min(Math.max(value / max, 0), 1);

  return (
    <div className="flex h-full w-full flex-col justify-center p-1">
      <Progress value={ratio * 100} className="w-full flex-col flex-nowrap items-stretch gap-1">
        <div className="flex w-full min-w-0 items-baseline justify-between gap-2 text-xs leading-none">
          {label ? (
            <span className="min-w-0 truncate text-muted-foreground">{label}</span>
          ) : (
            <span />
          )}
          <span className="shrink-0 tabular-nums">
            {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            <span className="text-muted-foreground">
              {` / ${max.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            </span>
          </span>
        </div>
      </Progress>
    </div>
  );
}
