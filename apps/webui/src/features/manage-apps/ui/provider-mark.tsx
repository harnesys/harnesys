import { cn } from '@/shared/lib/utils';

const MARK_BOX = { sm: 'size-8 p-1', md: 'size-10 p-1.5', lg: 'size-12 p-2' } as const;
const MARK_ICON = { sm: 'size-4.5', md: 'size-5.5', lg: 'size-7' } as const;

export function ProviderMark({
  label,
  iconSvg,
  size = 'md',
  className,
}: {
  label: string;
  iconSvg: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-background text-foreground',
        MARK_BOX[size],
        className,
      )}
      aria-hidden="true"
    >
      {iconSvg ? (
        <img
          alt=""
          className={MARK_ICON[size]}
          src={`data:image/svg+xml,${encodeURIComponent(iconSvg)}`}
        />
      ) : (
        <span className={cn('font-heading font-medium', MARK_ICON[size])}>
          {label.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}
