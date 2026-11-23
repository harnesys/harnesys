import type { GitFileStatus } from '@harnesys/studio-shared';
import {
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  MoreHorizontalIcon,
  Trash2Icon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { RowListSkeleton } from '@/shared/ui/settings-kit';
import { type FileEntry, type FileGroups, statusColor, statusLabel } from '../model/source-control';

interface SourceControlChangeListProps {
  groups: FileGroups;
  selectedPath: string | null;
  checkedPaths: Set<string>;
  isLoading?: boolean;
  onSelect: (path: string) => void;
  onToggleChecked: (path: string) => void;
  onToggleAll: (checked: boolean) => void;
  onStage: (paths: string[]) => void;
  onUnstage: (paths: string[]) => void;
  onDiscard: (entries: FileEntry[]) => void;
}

export function SourceControlChangeList({
  groups,
  selectedPath,
  checkedPaths,
  isLoading,
  onSelect,
  onToggleChecked,
  onToggleAll,
  onStage,
  onUnstage,
  onDiscard,
}: SourceControlChangeListProps) {
  if (isLoading) {
    return <RowListSkeleton rows={5} testId="source-control-files-loading" />;
  }
  if (groups.files.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-muted-foreground text-sm">
        No changes to commit
      </div>
    );
  }
  const allChecked = groups.files.every((file) => checkedPaths.has(file.path));
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-2 p-1.5">
        <div className="flex items-center gap-2 px-1.5 py-1">
          <Checkbox
            checked={allChecked}
            onCheckedChange={(value) => onToggleAll(value === true)}
            aria-label="Include all changes in the commit"
            data-testid="git-commit-select-all"
          />
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Changes</span>
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
            {checkedPaths.size} selected
          </span>
        </div>
        {groups.staged.length > 0 ? (
          <FileGroup
            label="Staged"
            staged
            files={groups.staged}
            selectedPath={selectedPath}
            checkedPaths={checkedPaths}
            onSelect={onSelect}
            onToggleChecked={onToggleChecked}
            action={<ButtonRowAction onClick={() => onUnstage([])}>Unstage all</ButtonRowAction>}
            onStage={onStage}
            onUnstage={onUnstage}
            onDiscard={onDiscard}
          />
        ) : null}
        {groups.unstaged.length > 0 ? (
          <FileGroup
            label="Changes"
            staged={false}
            files={groups.unstaged}
            selectedPath={selectedPath}
            checkedPaths={checkedPaths}
            onSelect={onSelect}
            onToggleChecked={onToggleChecked}
            action={
              <div className="flex items-center gap-0.5">
                <ButtonRowAction onClick={() => onStage([])}>Stage all</ButtonRowAction>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground"
                        aria-label="More change actions"
                        title="More change actions"
                      />
                    }
                  >
                    <MoreHorizontalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onDiscard(groups.unstaged)}
                    >
                      <Trash2Icon />
                      Discard all…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            }
            onStage={onStage}
            onUnstage={onUnstage}
            onDiscard={onDiscard}
          />
        ) : null}
      </div>
    </ScrollArea>
  );
}

function FileGroup({
  label,
  staged,
  files,
  selectedPath,
  checkedPaths,
  action,
  onSelect,
  onToggleChecked,
  onStage,
  onUnstage,
  onDiscard,
}: {
  label: string;
  staged: boolean;
  files: FileEntry[];
  selectedPath: string | null;
  checkedPaths: Set<string>;
  action: ReactNode;
  onSelect: (path: string) => void;
  onToggleChecked: (path: string) => void;
  onStage: (paths: string[]) => void;
  onUnstage: (paths: string[]) => void;
  onDiscard: (entries: FileEntry[]) => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex h-7 items-center gap-2 px-1.5">
        <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
          {label} · {files.length}
        </span>
        <div className="ml-auto">{action}</div>
      </div>
      <ul className="flex flex-col">
        {files.map((file) => (
          <FileRow
            key={file.path}
            file={file}
            staged={staged}
            active={file.path === selectedPath}
            checked={checkedPaths.has(file.path)}
            onSelect={onSelect}
            onToggleChecked={onToggleChecked}
            onStage={onStage}
            onUnstage={onUnstage}
            onDiscard={onDiscard}
          />
        ))}
      </ul>
    </div>
  );
}

function FileRow({
  file,
  staged,
  active,
  checked,
  onSelect,
  onToggleChecked,
  onStage,
  onUnstage,
  onDiscard,
}: {
  file: FileEntry;
  staged: boolean;
  active: boolean;
  checked: boolean;
  onSelect: (path: string) => void;
  onToggleChecked: (path: string) => void;
  onStage: (paths: string[]) => void;
  onUnstage: (paths: string[]) => void;
  onDiscard: (entries: FileEntry[]) => void;
}) {
  return (
    <li className="group/row flex items-center gap-1 pr-1 pl-1.5">
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
        <StatusLetter status={file.status} />
        <span
          className={cn('min-w-0 flex-1 truncate font-mono text-[12px]', !checked && 'opacity-50')}
        >
          {file.path}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
        {staged ? (
          <IconAction
            label={`Unstage ${file.path}`}
            onClick={() => onUnstage([file.path])}
            icon={<ArrowDownToLineIcon />}
          />
        ) : (
          <IconAction
            label={`Stage ${file.path}`}
            onClick={() => onStage([file.path])}
            icon={<ArrowUpFromLineIcon />}
          />
        )}
        <IconAction
          label={`Discard ${file.path}`}
          onClick={() => onDiscard([file])}
          icon={<Trash2Icon />}
          destructive
        />
      </div>
    </li>
  );
}

function StatusLetter({ status }: { status: GitFileStatus }) {
  return (
    <span
      className={cn(
        'w-3 shrink-0 text-center font-mono font-semibold text-[10px] uppercase',
        statusColor(status),
      )}
      title={status}
    >
      {statusLabel(status)}
    </span>
  );
}

function ButtonRowAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="h-6 px-1.5 text-[11px] text-muted-foreground"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function IconAction({
  label,
  onClick,
  icon,
  destructive,
}: {
  label: string;
  onClick: () => void;
  icon: ReactNode;
  destructive?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={cn(
        'text-muted-foreground',
        destructive && 'text-destructive hover:text-destructive',
      )}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {icon}
    </Button>
  );
}
