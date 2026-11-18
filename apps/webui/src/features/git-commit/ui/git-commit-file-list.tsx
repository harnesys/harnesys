import type { GitFileStatus } from '@harnesys/studio-shared';
import { FileIcon, FilePlusIcon, FileXIcon, PencilIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Checkbox } from '@/shared/ui/checkbox';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { RowListSkeleton } from '@/shared/ui/settings-kit';

interface FileEntry {
  path: string;
  status: GitFileStatus;
}
export function GitCommitFileList({
  files,
  selectedPath,
  onSelect,
  checkedPaths,
  onToggleChecked,
  onToggleAll,
  isLoading,
}: {
  files: FileEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  checkedPaths: Set<string>;
  onToggleChecked: (path: string) => void;
  onToggleAll: (checked: boolean) => void;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return <RowListSkeleton rows={4} testId="git-commit-files-loading" />;
  }
  if (files.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">No changes to commit</div>
    );
  }
  const allChecked = files.every((file) => checkedPaths.has(file.path));
  return (
    <ScrollArea className="flex-1">
      <div className="p-1">
        <div className="mb-1 flex items-center gap-2 px-2 py-1">
          <Checkbox
            checked={allChecked}
            onCheckedChange={(value) => onToggleAll(value === true)}
            aria-label="Include all changes in the commit"
            data-testid="git-commit-select-all"
          />
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
            Changes · {files.length}
          </span>
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
            {checkedPaths.size} selected
          </span>
        </div>
        <ul className="flex flex-col gap-0.5">
          {files.map((file) => {
            const active = file.path === selectedPath;
            const checked = checkedPaths.has(file.path);
            return (
              <li key={file.path} className="flex items-center gap-1 pr-2 pl-2">
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onToggleChecked(file.path)}
                  aria-label={`Include ${file.path} in the commit`}
                  data-testid={`git-commit-check-${file.path}`}
                />
                <button
                  type="button"
                  onClick={() => onSelect(file.path)}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1.5 text-left text-xs transition-colors',
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center',
                      statusColor(file.status),
                    )}
                  >
                    <StatusIcon status={file.status} />
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate font-mono text-[12px]',
                      !checked && 'opacity-50',
                    )}
                  >
                    {file.path}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded px-1 py-0.5 font-mono text-[10px] uppercase',
                      badgeColor(file.status),
                    )}
                  >
                    {statusLabel(file.status)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </ScrollArea>
  );
}
function StatusIcon({ status }: { status: GitFileStatus }) {
  if (status === 'added' || status === 'untracked') {
    return <FilePlusIcon className="size-3" />;
  }
  if (status === 'deleted') {
    return <FileXIcon className="size-3" />;
  }
  if (status === 'modified' || status === 'staged') {
    return <PencilIcon className="size-3" />;
  }
  return <FileIcon className="size-3" />;
}
function statusColor(status: GitFileStatus): string {
  switch (status) {
    case 'added':
    case 'staged':
      return 'text-status-ok';
    case 'untracked':
      return 'text-destructive/80';
    case 'deleted':
      return 'text-muted-foreground';
    case 'modified':
      return 'text-status-info';
    case 'conflicted':
      return 'text-destructive';
    case 'renamed':
      return 'text-status-info';
    default:
      return 'text-muted-foreground';
  }
}
function badgeColor(status: GitFileStatus): string {
  switch (status) {
    case 'added':
    case 'staged':
      return 'bg-status-ok/15 text-status-ok';
    case 'untracked':
      return 'bg-destructive/15 text-destructive';
    case 'modified':
      return 'bg-status-info/15 text-status-info';
    case 'deleted':
      return 'bg-muted text-muted-foreground line-through';
    case 'conflicted':
      return 'bg-destructive/15 text-destructive';
    case 'renamed':
      return 'bg-status-info/15 text-status-info';
    default:
      return 'bg-muted text-muted-foreground';
  }
}
function statusLabel(status: GitFileStatus): string {
  if (status === 'untracked') {
    return 'U';
  }
  if (status === 'modified') {
    return 'M';
  }
  if (status === 'added') {
    return 'A';
  }
  if (status === 'deleted') {
    return 'D';
  }
  if (status === 'staged') {
    return 'S';
  }
  if (status === 'conflicted') {
    return 'C';
  }
  if (status === 'renamed') {
    return 'R';
  }
  return status.slice(0, 1).toUpperCase();
}
