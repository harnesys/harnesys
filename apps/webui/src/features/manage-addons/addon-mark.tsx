import { PuzzleIcon } from 'lucide-react';
import { softTint } from '@/shared/lib/color';
import { cn } from '@/shared/lib/utils';
import { IconRef } from '@/shared/ui/icon';

const MARK_BOX = { sm: 'size-8 p-1', md: 'size-10 p-1.5', lg: 'size-12 p-2' } as const;
const MARK_ICON = { sm: 'size-4.5', md: 'size-5.5', lg: 'size-7' } as const;

export function AddonMark({
  size = 'md',
  icon,
  color,
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  /** Icon reference from the addon manifest: lucide name or inline SVG data URI. */
  icon?: string;
  /** Brand color from the addon manifest as `#RRGGBB`. */
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg border bg-background',
        color ? 'border-transparent' : 'text-muted-foreground',
        MARK_BOX[size],
        className,
      )}
      style={color ? { backgroundColor: softTint(color), color } : undefined}
      data-testid="addon-mark"
      aria-hidden="true"
    >
      {icon ? (
        <IconRef icon={icon} className={MARK_ICON[size]} />
      ) : (
        <PuzzleIcon className={MARK_ICON[size]} />
      )}
    </span>
  );
}
