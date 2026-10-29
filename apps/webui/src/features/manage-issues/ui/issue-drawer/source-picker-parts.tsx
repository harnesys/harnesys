import type { ProjectFileEntry } from '@harnesys/studio-shared';
import { ChevronLeftIcon, ChevronRightIcon, HardDriveIcon, PlusIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { FileTypeIcon, FolderTypeIcon } from '@/shared/ui/icons';
import { Spinner } from '@/shared/ui/spinner';

export interface PickerEntry {
  key: string;
  name: string;
  isDir: boolean;
  entry?: ProjectFileEntry;
}

export function sortEntries(entries: ProjectFileEntry[]): ProjectFileEntry[] {
  return entries
    .filter((entry) => !entry.name.startsWith('.'))
    .sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === 'dir' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
}

export function SourceBreadcrumb({
  sourceName,
  pathSegments,
  onBack,
  onEnter,
  onRoot,
}: {
  sourceName: string;
  pathSegments: string[];
  onBack: () => void;
  onEnter: (path: string) => void;
  onRoot: () => void;
}) {
  return (
    <div
      className="flex items-center gap-0.5 overflow-hidden text-xs"
      data-testid="issue-attach-crumbs"
    >
      <button
        type="button"
        onClick={onBack}
        title="Up one level"
        className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        data-testid="issue-attach-source-up"
      >
        <ChevronLeftIcon className="size-3.5" />
      </button>
      <div className="flex min-w-0 items-center gap-0.5">
        <button
          type="button"
          onClick={onRoot}
          title="All sources"
          className="max-w-[9rem] truncate rounded px-1 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          data-testid="issue-attach-source-root"
        >
          {sourceName}
        </button>
        {pathSegments.map((segment, index) => {
          const target = pathSegments.slice(0, index + 1).join('/');
          const current = index === pathSegments.length - 1;
          return (
            <span key={target} className="flex min-w-0 items-center gap-0.5">
              <span className="text-muted-foreground/60">/</span>
              <button
                type="button"
                disabled={current}
                onClick={() => onEnter(target)}
                className={cn(
                  'max-w-[7rem] truncate rounded px-1 py-0.5 transition-colors',
                  current
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {segment}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function EntryIcon({ item }: { item: PickerEntry }) {
  if (!item.isDir) {
    return <FileTypeIcon name={item.name} size="xs" />;
  }
  if (item.entry) {
    return <FolderTypeIcon size="xs" />;
  }
  return <HardDriveIcon className={cn('size-3.5 shrink-0', 'text-muted-foreground')} />;
}

function EntryMark({
  isDir,
  pending,
  className,
}: {
  isDir: boolean;
  pending: boolean;
  className: string;
}) {
  if (pending) {
    return <Spinner className={cn(className, 'text-muted-foreground')} />;
  }
  if (isDir) {
    return <ChevronRightIcon className={cn(className, 'text-muted-foreground/50')} />;
  }
  return <PlusIcon className={cn(className, 'text-muted-foreground')} />;
}

export function PickerEntries({
  items,
  emptyText,
  pendingPath,
  onPick,
}: {
  items: PickerEntry[] | null;
  emptyText: string;
  pendingPath: string | null;
  onPick: (item: PickerEntry) => void;
}) {
  if (items === null) {
    return (
      <div className="flex items-center justify-center py-6">
        <Spinner className="size-4 text-muted-foreground" />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-muted-foreground text-xs italic">{emptyText}</p>
    );
  }
  return (
    <>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          disabled={pendingPath !== null}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-accent',
            'disabled:pointer-events-none disabled:opacity-60',
          )}
          data-testid={`issue-attach-entry-${item.key}`}
          onClick={() => onPick(item)}
        >
          <EntryIcon item={item} />
          <span className="min-w-0 flex-1 truncate">{item.name}</span>
          <EntryMark isDir={item.isDir} pending={pendingPath === item.key} className="size-3" />
        </button>
      ))}
    </>
  );
}
