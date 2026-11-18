import type { GitFileStatus, GitFileStatusMap, ProjectFileEntry } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronRightIcon } from 'lucide-react';
import { useOpenNewTerminal } from '@/features/ide';
import { getGitFileStatus } from '@/shared/api/git';
import { gitStatusColorClass, useGitStatusColors } from '@/shared/lib/git-status-colors';
import { cn } from '@/shared/lib/utils';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/shared/ui/context-menu';
import { IconRef } from '@/shared/ui/icon';
import { FileTypeIcon, FolderTypeIcon } from '@/shared/ui/icons';
import { SidebarRow } from '@/shared/ui/sidebar-row';
import { useAddonFileIcon } from '../model/addon-file-icon';
import { useEntryActions } from '../model/use-entry-actions';
import type { FileRowMenuProps } from './file-row-actions';
import { FileRowMenuItems } from './file-row-actions';
import { getDirAggregatedStatus } from './git-file-decorations';
import { InlineCreateInput } from './inline-create-input';
import { useFileRowDrag } from './use-file-row-drag';

function EntryTypeIcon({
  isDir,
  isExpanded,
  name,
  addonIcon,
}: {
  isDir: boolean;
  isExpanded: boolean;
  name: string;
  addonIcon?: string;
}) {
  if (isDir) {
    return <FolderTypeIcon open={isExpanded} size="sm" />;
  }
  if (addonIcon !== undefined) {
    return <IconRef icon={addonIcon} className="size-4" />;
  }
  return <FileTypeIcon name={name} size="sm" />;
}

function FileRowLabel({
  entry,
  isDir,
  isExpanded,
  selected,
  git,
  addonIcon,
}: {
  entry: ProjectFileEntry;
  isDir: boolean;
  isExpanded: boolean;
  selected: boolean;
  git: {
    status: GitFileStatus | undefined;
    color: string | undefined;
    decorationClass: string | undefined;
  };
  addonIcon?: string;
}) {
  return (
    <span data-drag-label className="flex min-w-0 items-center gap-1.5">
      {isDir ? (
        <span
          data-dir-chevron={entry.name}
          className="flex size-4 shrink-0 cursor-pointer items-center justify-center"
        >
          <ChevronRightIcon
            className={cn(
              'size-3.5 text-sidebar-foreground/50 transition-transform',
              isExpanded && 'rotate-90',
            )}
          />
        </span>
      ) : (
        <span className="flex size-4 shrink-0 items-center justify-center" />
      )}
      <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-4">
        <EntryTypeIcon
          isDir={isDir}
          isExpanded={isExpanded}
          name={entry.name}
          {...(addonIcon === undefined ? {} : { addonIcon })}
        />
      </span>
      <span
        className={cn(
          'truncate text-[13px] leading-4',
          selected ? 'text-sidebar-foreground/90' : 'text-sidebar-foreground/70',
          git.decorationClass,
        )}
        style={git.color ? { color: git.color } : undefined}
        title={git.status ? `git: ${git.status}` : undefined}
      >
        {entry.name}
      </span>
    </span>
  );
}

function resolveEffectiveMap({
  gitTruncated,
  isDir,
  isExpanded,
  gitMap,
  fetched,
}: {
  gitTruncated: boolean;
  isDir: boolean;
  isExpanded: boolean;
  gitMap: GitFileStatusMap | undefined;
  fetched: GitFileStatusMap | undefined;
}): GitFileStatusMap | undefined {
  if (!gitTruncated) {
    return gitMap;
  }
  return isDir && isExpanded ? fetched : undefined;
}

function resolveGitDecoration({
  isDir,
  fullPath,
  effectiveMap,
  gitMap,
  colors,
  ignored,
}: {
  isDir: boolean;
  fullPath: string;
  effectiveMap: GitFileStatusMap | undefined;
  gitMap: GitFileStatusMap | undefined;
  colors: Record<string, string>;
  ignored: boolean;
}): {
  status: GitFileStatus | undefined;
  color: string | undefined;
  decorationClass: string | undefined;
} {
  if (ignored) {
    return {
      status: 'ignored',
      color: colors.ignored,
      decorationClass: gitStatusColorClass('ignored'),
    };
  }
  const status = isDir
    ? getDirAggregatedStatus(fullPath, effectiveMap ?? gitMap)
    : effectiveMap?.[fullPath];
  return {
    status,
    color: status ? colors[status] : undefined,
    decorationClass: status ? gitStatusColorClass(status) : undefined,
  };
}

export function FileRow({
  entry,
  fullPath,
  depth,
  projectId,
  worktreeId,
  expandedDirs,
  selectedPaths,
  renamePath,
  gitMap,
  gitTruncated,
  onToggle,
  onSelect,
  onOpen,
  onStartCreate,
  onStartRename,
  onRenameFinish,
  onMoveInto,
  onDelete,
}: {
  entry: ProjectFileEntry;
  fullPath: string;
  depth: number;
  projectId: string;
  worktreeId?: string;
  expandedDirs: Set<string>;
  selectedPaths: string[];
  renamePath: string | null;
  gitMap?: GitFileStatusMap;
  gitTruncated?: boolean;
  onToggle: (fullPath: string) => void;
  onSelect: (fullPath: string, event?: React.MouseEvent, isDir?: boolean) => void;
  onOpen: (fullPath: string) => void;
  onStartCreate: (kind: 'file' | 'dir', parentPath: string) => void;
  onStartRename: (fullPath: string) => void;
  onRenameFinish: (fullPath: string, name: string) => void;
  onMoveInto: (targetDir: string, paths: string[]) => void;
  onDelete: (fullPath: string) => void;
}) {
  const isDir = entry.kind === 'dir';
  const isExpanded = expandedDirs.has(fullPath);
  const selected = selectedPaths.includes(fullPath);
  const dirGitQuery = useQuery({
    queryKey: ['projects', projectId, 'git', 'file-status', fullPath],
    queryFn: () => getGitFileStatus(projectId, fullPath),
    enabled: Boolean(gitTruncated && isDir && isExpanded),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const effectiveMap = resolveEffectiveMap({
    gitTruncated: Boolean(gitTruncated),
    isDir,
    isExpanded,
    gitMap,
    fetched: dirGitQuery.data?.map,
  });
  const gitColors = useGitStatusColors((state) => state.colors);
  const git = resolveGitDecoration({
    isDir,
    fullPath,
    effectiveMap,
    gitMap,
    colors: gitColors,
    ignored: entry.ignored === true,
  });
  const openNewTerminal = useOpenNewTerminal();
  const entryActions = useEntryActions(projectId, worktreeId);
  const addonIconFor = useAddonFileIcon();
  const addonIcon = isDir ? undefined : addonIconFor(entry.name);
  const { dropState, dragProps } = useFileRowDrag({
    projectId,
    worktreeId,
    fullPath,
    isDir,
    selected,
    selectedPaths,
    onMoveInto,
  });
  const handleClick = (event: React.MouseEvent) => {
    if (isDir && (event.target as Element | null)?.closest?.('[data-dir-chevron]')) {
      onToggle(fullPath);
      return;
    }
    onSelect(fullPath, event, isDir);
  };
  const handleDoubleClick = () => {
    if (isDir) {
      onToggle(fullPath);
      return;
    }
    onOpen(fullPath);
  };
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    if (isDir) {
      onToggle(fullPath);
    }
    onSelect(fullPath, undefined, isDir);
  };
  const handleContextMenu = () => {
    if (!selected) {
      onSelect(fullPath, undefined, isDir);
    }
  };
  const menuProps: FileRowMenuProps = {
    projectId,
    worktreeId,
    entry,
    fullPath,
    isDir,
    openNewTerminal,
    entryActions,
    onOpen,
    onStartCreate,
    onStartRename,
    onDelete,
  };
  return (
    <ContextMenu>
      <ContextMenuTrigger className="block">
        {renamePath === fullPath ? (
          <InlineCreateInput
            kind={isDir ? 'dir' : 'file'}
            initialValue={entry.name}
            depth={depth}
            onFinish={(name) => onRenameFinish(fullPath, name)}
          />
        ) : (
          <SidebarRow
            selected={selected}
            depth={depth}
            testId={`file-${fullPath}`}
            className={cn(
              dropState === 'valid' && 'bg-live/15 ring-1 ring-live ring-inset',
              dropState === 'invalid' && 'cursor-not-allowed opacity-60',
            )}
            role="treeitem"
            tabIndex={0}
            aria-expanded={isDir ? isExpanded : undefined}
            aria-selected={selected}
            data-path={fullPath}
            data-drop={dropState ?? undefined}
            draggable={dragProps.draggable}
            onDragStart={dragProps.onDragStart}
            onDragEnd={dragProps.onDragEnd}
            onDragOver={dragProps.onDragOver}
            onDragLeave={dragProps.onDragLeave}
            onDrop={dragProps.onDrop}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onKeyDown={handleKeyDown}
            onContextMenu={handleContextMenu}
          >
            <FileRowLabel
              entry={entry}
              isDir={isDir}
              isExpanded={isExpanded}
              selected={selected}
              git={git}
              {...(addonIcon === undefined ? {} : { addonIcon })}
            />
          </SidebarRow>
        )}
      </ContextMenuTrigger>
      <ContextMenuContent onClick={(event) => event.stopPropagation()}>
        <FileRowMenuItems {...menuProps} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
