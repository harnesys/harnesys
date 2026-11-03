import { cn } from '@/shared/lib/utils';

const USER_TINTS = [
  'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
] as const;

const AVATAR_SIZES = {
  xs: 'size-3.5 text-[8px] leading-none',
  sm: 'size-4 text-[8px] leading-none',
  md: 'size-6 text-xs',
  lg: 'size-10 text-sm',
} as const;

export type UserAvatarSize = keyof typeof AVATAR_SIZES;

export function initialsOfUser(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return '?';
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0]?.slice(0, 2).toUpperCase() ?? '?';
  }
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

function tintOf(seed: string): string {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return USER_TINTS[Math.abs(hash) % USER_TINTS.length] ?? USER_TINTS[0];
}

export function UserAvatar({
  name,
  seed,
  title,
  size = 'sm',
  className,
}: {
  name: string;
  seed?: string;
  title?: string;
  size?: UserAvatarSize;
  className?: string;
}) {
  return (
    <span
      title={title ?? name}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-medium',
        AVATAR_SIZES[size],
        tintOf(seed ?? name),
        className,
      )}
    >
      {initialsOfUser(name)}
    </span>
  );
}
