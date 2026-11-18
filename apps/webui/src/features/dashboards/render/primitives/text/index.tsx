import type { LucideIcon } from 'lucide-react';
import { TypeIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { asText } from '../coerce';
import type { PrimitiveComponentProps } from '../primitive-props';

export const TextIcon: LucideIcon = TypeIcon;

export interface TextPrimitiveProps {
  text?: string | number | boolean | null;
  label?: string | null;
}

/** Plain text line, typically bound to `state.*` or `sources.*` values. */
export function TextPrimitive({ props }: PrimitiveComponentProps): ReactNode {
  const text = asText(props.text) ?? '';
  const label = (asText(props.label) ?? '').trim();
  return (
    <div className="h-full min-h-0 w-full overflow-auto p-1">
      <div className="flex min-h-full flex-col justify-center gap-0.5">
        {label === '' ? null : (
          <div className="truncate text-[10px] text-muted-foreground uppercase">{label}</div>
        )}
        {text === '' ? (
          <div className="text-muted-foreground text-sm italic">No text</div>
        ) : (
          <div className="wrap-anywhere text-sm">{text}</div>
        )}
      </div>
    </div>
  );
}
