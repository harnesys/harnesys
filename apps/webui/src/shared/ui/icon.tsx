import { PuzzleIcon } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { cn } from '@/shared/lib/utils';

/**
 * Renders an icon reference coming from the API: either a lucide icon name
 * (kebab-case, resolved lazily per icon) or an inline SVG as a `data:image/`
 * URI (addon-shipped icon).
 */
export function IconRef({ icon, className }: { icon: string; className?: string }) {
  if (icon.startsWith('data:image/')) {
    return (
      <img
        src={icon}
        className={cn('object-contain', className)}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    );
  }
  return (
    <DynamicIcon
      name={icon as IconName}
      className={className}
      fallback={() => <PuzzleIcon className={className} />}
    />
  );
}
