import type { GitFileStatus, GitFileStatusMap, ProjectFileEntry } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { useOpenNewTerminal } from '@/features/ide';
import { getGitFileStatus } from '@/shared/api/git';
import { gitStatusColorClass, useGitStatusColors } from '@/shared/lib/git-status-colors';
import { cn } from '@/shared/lib/utils';
import { FileTypeIcon, FolderTypeIcon } from '@/shared/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import type { ExplorerCreateDraft } from '../model/explorer-draft.store';
import { childrenOf } from '../model/file-tree-index';
import { useEntryActions } from '../model/use-entry-actions';
import { FileRowActions } from './file-row-actions';
import { getDirAggregatedStatus } from './git-file-decorations';
import { InlineCreateInput } from './inline-create-input';
import { useFileRowDrag } from './use-file-row-drag';

function FileRowLabel({
  entry,
  isDir,
  isExpanded,
  selected,
  git,
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
}) {
  return (
    <span data-drag-label className="flex min-w-0 items-center gap-1.5">
      {isDir ? (
        <span className="flex size-[18px] shrink-0 items-center justify-center">
          <FolderTypeIcon open={isExpanded} size="sm" />
        </span>
      ) : (
        <span className="flex size-[18px] shrink-0 items-center justify-center">
          <FileTypeIcon name={entry.name} size="sm" />
        </span>
      )}
      <span
        className={cn(
          'min-w-0 truncate text-sm group-data-[collapsible=icon]:hidden',
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
}: {
  isDir: boolean;
  fullPath: string;
  effectiveMap: GitFileStatusMap | undefined;
  gitMap: GitFileStatusMap | undefined;
  colors: Record<string, string>;
}): {
  status: GitFileStatus | undefined;
  color: string | undefined;
  decorationClass: string | undefined;
} {
  const status = isDir
    ? getDirAggregatedStatus(fullPath, effectiveMap ?? gitMap)
    : effectiveMap?.[fullPath];
  return {
    status,
    color: status ? colors[status] : undefined,
    decorationClass: status ? gitStatusColorClass(status) : undefined,
  };
}

function resolveInfoLabel(isDir: boolean, childCount: number, size: number | undefined): string {
  if (isDir) {
    return `${childCount} items`;
  }
  return size !== undefined ? formatSize(size) : '';
}

export function FileRow({
  entry,
  parentPath,
  depth,
  projectId,
  worktreeId,
  expandedDirs,
  selectedPaths,
  createDraft,
  renamePath,
  iconMode,
  gitMap,
  gitTruncated,
  treeIndex,
  showHidden,
  onToggle,
  onSelect,
  onOpen,
  onStartCreate,
  onCreateFinish,
  onStartRename,
  onRenameFinish,
  onMoveInto,
  onDelete,
}: {
  entry: ProjectFileEntry;
  parentPath: string;
  depth: number;
  projectId: string;
  worktreeId?: string;
  expandedDirs: Set<string>;
  selectedPaths: string[];
  createDraft: ExplorerCreateDraft | null;
  renamePath: string | null;
  iconMode: boolean;
  gitMap?: GitFileStatusMap;
  gitTruncated?: boolean;
  treeIndex: Map<string, ProjectFileEntry[]>;
  showHidden: boolean;
  onToggle: (fullPath: string) => void;
  onSelect: (fullPath: string, event?: React.MouseEvent) => void;
  onOpen: (fullPath: string) => void;
  onStartCreate: (kind: 'file' | 'dir', parentPath: string) => void;
  onCreateFinish: (name: string) => void;
  onStartRename: (fullPath: string) => void;
  onRenameFinish: (fullPath: string, name: string) => void;
  onMoveInto: (targetDir: string, paths: string[]) => void;
  onDelete: (fullPath: string) => void;
}) {
  const fullPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  const isDir = entry.kind === 'dir';
  const isExpanded = isDir && expandedDirs.has(fullPath);
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
  const git = resolveGitDecoration({ isDir, fullPath, effectiveMap, gitMap, colors: gitColors });
  const openNewTerminal = useOpenNewTerminal();
  const entryActions = useEntryActions(projectId, worktreeId);
  const children = isDir ? childrenOf(treeIndex, fullPath, showHidden) : [];
  const infoLabel = resolveInfoLabel(isDir, children.length, entry.size);
  const showCreateHere = createDraft && isDir && createDraft.parentPath === fullPath;
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
    const hasModifier = event.shiftKey || event.metaKey || event.ctrlKey;
    if (isDir && !hasModifier) {
      onToggle(fullPath);
    }
    onSelect(fullPath, event);
  };
  const handleDoubleClick = () => {
    if (!isDir) {
      onOpen(fullPath);
    }
  };
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    if (isDir) {
      onToggle(fullPath);
    }
    onSelect(fullPath);
  };
  return (
    <>
      {renamePath === fullPath ? (
        <InlineCreateInput
          kind={isDir ? 'dir' : 'file'}
          initialValue={entry.name}
          depth={depth}
          onFinish={(name) => onRenameFinish(fullPath, name)}
        />
      ) : (
        <div
          role="treeitem"
          tabIndex={0}
          aria-expanded={isDir ? isExpanded : undefined}
          aria-selected={selected}
          className={cn(
            'group/file relative flex items-center rounded-md hover:bg-sidebar-accent/70',
            selected && 'bg-sidebar-accent/70 text-sidebar-accent-foreground',
            'group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center',
            dropState === 'valid' && 'bg-live/15 ring-1 ring-live ring-inset',
            dropState === 'invalid' && 'cursor-not-allowed opacity-60',
          )}
          style={!iconMode ? { paddingLeft: `${depth * 12 + 1}px` } : undefined}
          data-testid={`file-${fullPath}`}
          data-selected={selected ? 'true' : 'false'}
          data-drop={dropState ?? undefined}
          data-path={fullPath}
          draggable={dragProps.draggable}
          onDragStart={dragProps.onDragStart}
          onDragEnd={dragProps.onDragEnd}
          onDragOver={dragProps.onDragOver}
          onDragLeave={dragProps.onDragLeave}
          onDrop={dragProps.onDrop}
          onKeyDown={handleKeyDown}
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-0.5 pl-2 text-left group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
                  onClick={handleClick}
                  onDoubleClick={handleDoubleClick}
                />
              }
            >
              <FileRowLabel
                entry={entry}
                isDir={isDir}
                isExpanded={isExpanded}
                selected={selected}
                git={git}
              />
            </TooltipTrigger>
            <TooltipContent side="right" hidden={!iconMode}>
              {fullPath}
            </TooltipContent>
          </Tooltip>

          <FileRowActions
            projectId={projectId}
            worktreeId={worktreeId}
            entry={entry}
            fullPath={fullPath}
            isDir={isDir}
            infoLabel={infoLabel}
            openNewTerminal={openNewTerminal}
            entryActions={entryActions}
            onOpen={onOpen}
            onStartCreate={onStartCreate}
            onStartRename={onStartRename}
            onDelete={onDelete}
          />
        </div>
      )}

      {isDir && isExpanded && (
        <div className="flex flex-col">
          {children.map((child) => (
            <FileRow
              key={child.name}
              entry={child}
              parentPath={fullPath}
              depth={depth + 1}
              projectId={projectId}
              worktreeId={worktreeId}
              expandedDirs={expandedDirs}
              selectedPaths={selectedPaths}
              createDraft={createDraft}
              renamePath={renamePath}
              iconMode={iconMode}
              gitMap={effectiveMap ?? gitMap}
              gitTruncated={gitTruncated}
              treeIndex={treeIndex}
              showHidden={showHidden}
              onToggle={onToggle}
              onSelect={onSelect}
              onOpen={onOpen}
              onStartCreate={onStartCreate}
              onCreateFinish={onCreateFinish}
              onStartRename={onStartRename}
              onRenameFinish={onRenameFinish}
              onMoveInto={onMoveInto}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {showCreateHere && (
        <InlineCreateInput kind={createDraft.kind} onFinish={onCreateFinish} depth={depth + 1} />
      )}
    </>
  );
}
export { InlineCreateInput } from './inline-create-input';

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
