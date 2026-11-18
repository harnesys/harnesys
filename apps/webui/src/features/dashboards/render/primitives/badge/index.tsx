import type { LucideIcon } from 'lucide-react';
import { TagIcon as BadgeLucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { asString, asText } from '../coerce';
import type { PrimitiveComponentProps } from '../primitive-props';

export const BadgeIcon: LucideIcon = BadgeLucideIcon;

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONES: readonly BadgeTone[] = ['neutral', 'success', 'warning', 'danger', 'info'];

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: '',
  success: 'bg-status-ok/15 text-status-ok',
  warning: 'bg-status-warn/15 text-status-warn',
  danger: 'bg-destructive/15 text-destructive',
  info: 'bg-status-info/15 text-status-info',
};

function asTone(value: unknown): BadgeTone {
  const raw = asString(value);
  return TONES.find((tone) => tone === raw) ?? 'neutral';
}

/** Status label with a semantic tone; any unknown tone falls back to neutral. */
export function BadgePrimitive({ props }: PrimitiveComponentProps): ReactNode {
  const value = asText(props.value) ?? '';
  if (value.trim() === '') {
    return (
      <div className="flex h-full w-full items-center justify-center p-1">
        <span className="truncate text-muted-foreground text-xs italic">No value</span>
      </div>
    );
  }
  const tone = asTone(props.tone);
  return (
    <div className="flex h-full w-full items-center justify-center p-1">
      <Badge variant="secondary" className={cn('max-w-full', TONE_CLASS[tone])}>
        <span className="min-w-0 truncate">{value}</span>
      </Badge>
    </div>
  );
}
