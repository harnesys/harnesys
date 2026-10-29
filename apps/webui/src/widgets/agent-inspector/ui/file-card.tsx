import type { ReactNode } from 'react';
import { fileExtLabel, formatBytes } from '@/shared/lib/file-meta';

export function FileCard({
  leading,
  name,
  stat,
  depth = 0,
  testId,
  onClick,
}: {
  leading: ReactNode;
  name: string;
  stat?: string;
  depth?: number;
  testId?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="flex w-full min-w-0 items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted/60"
      style={{ marginLeft: depth * 12 }}
      title={name}
    >
      <span className="flex size-10 shrink-0 items-center justify-center gap-0.5">{leading}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0">
        <span className="truncate font-medium text-foreground text-xs">{name}</span>
        {stat ? <span className="truncate text-muted-foreground text-xs">{stat}</span> : null}
      </span>
    </button>
  );
}

export function fileCardStat(name: string, mediaType: string | undefined, size?: number): string {
  return [size !== undefined ? formatBytes(size) : null, fileExtLabel(name, mediaType ?? '')]
    .filter(Boolean)
    .join(' · ');
}
