import { PuzzleIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { EntityMark } from '@/shared/ui/entity-tile';
import { IconRef } from '@/shared/ui/icon';

const MARK_PADDING = { sm: 'p-1', md: 'p-1.5', lg: 'p-2' } as const;
const MARK_ICON = { sm: 'size-4.5', md: 'size-5.5', lg: 'size-7' } as const;

export function AddonMark({
  size = 'md',
  icon,
  color,
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  color?: string;
  className?: string;
}) {
  return (
    <EntityMark
      size={size}
      color={color}
      className={cn(MARK_PADDING[size], className)}
      testId="addon-mark"
      icon={
        icon ? (
          <IconRef icon={icon} className={MARK_ICON[size]} />
        ) : (
          <PuzzleIcon className={MARK_ICON[size]} />
        )
      }
    />
  );
}
