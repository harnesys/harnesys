import type { LucideIcon } from 'lucide-react';
import { Rows3Icon as KvLucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { asRecordArray, asText } from '../coerce';
import type { PrimitiveComponentProps } from '../primitive-props';
import { WidgetEmptyState } from '../states';

export const KvIcon: LucideIcon = KvLucideIcon;

interface ResolvedPair {
  label: string;
  value: string;
}

/** Scalars render as text; objects, arrays and nullish values drop the pair. */
function pairsOf(raw: unknown): ResolvedPair[] {
  const pairs: ResolvedPair[] = [];
  for (const pair of asRecordArray(raw)) {
    const label = asText(pair.label);
    const value = asText(pair.value);
    if (label !== undefined && value !== undefined) {
      pairs.push({ label, value });
    }
  }
  return pairs;
}

/** Compact label/value rows for summary panels. */
export function KvPrimitive({ props }: PrimitiveComponentProps): ReactNode {
  const pairs = pairsOf(props.pairs);
  if (pairs.length === 0) {
    return <WidgetEmptyState message="Key-value has no pairs" />;
  }
  return (
    <dl className="flex h-full min-h-0 w-full flex-col gap-1 overflow-auto p-1 text-sm">
      {pairs.map((pair, index) => (
        <div
          key={`${pair.label}-${index}`}
          className="flex shrink-0 items-baseline justify-between gap-3 border-border/50 border-b pb-1 last:border-0"
        >
          <dt className="shrink-0 truncate text-muted-foreground text-xs">{pair.label}</dt>
          <dd className="min-w-0 truncate text-right font-medium tabular-nums">{pair.value}</dd>
        </div>
      ))}
    </dl>
  );
}
