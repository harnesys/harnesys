import { PuzzleIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

const MARK_BOX = { sm: 'size-8 p-1', md: 'size-10 p-1.5', lg: 'size-12 p-2' } as const;
const MARK_ICON = { sm: 'size-4.5', md: 'size-5.5', lg: 'size-7' } as const;

export function AddonMark({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground',
        MARK_BOX[size],
        className,
      )}
      data-testid="addon-mark"
      aria-hidden="true"
    >
      <PuzzleIcon className={MARK_ICON[size]} />
    </span>
  );
}
