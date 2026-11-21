import { useQuery, useQueryClient } from '@tanstack/react-query';
import { startTransition, useEffect, useRef, useState } from 'react';
import { useIdeStore } from '@/features/ide';
import {
  buildMoveItems,
  buildRenameItem,
  canDropInto,
  isValidFileName,
  moveDrag,
  sameMoveScope,
  setMoveDrag,
  useMoveProjectFiles,
} from '@/features/move-project-files';
import { createProjectFile, deleteProjectFile, listSourceFilesTree } from '@/shared/api/files';
import {
  type RepositoryWorktree,
  repositoryWorktreesQueryKey,
} from '@/shared/api/repository-worktrees';
import { cn } from '@/shared/lib/utils';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/shared/ui/context-menu';
import { SIDEBAR_ROW_HEIGHT, SIDEBAR_ROW_INDENT, SidebarRow } from '@/shared/ui/sidebar-row';
import { Spinner } from '@/shared/ui/spinner';
import { toast } from '@/shared/ui/toast';
import { useExplorerExpandStore } from '../model/explorer-expand.store';
import { useExplorerHiddenStore } from '../model/explorer-hidden.store';
import { createLazyChildrenState, ensurePrunedChildren } from '../model/explorer-lazy-children';
import { useFileSelectionStore } from '../model/file-selection.store';
import { type FlatTreeRow, flattenFileTree, indexFileTree } from '../model/file-tree-index';
import { BranchFolderLabel } from './branch-folder-label';
import { worktreeBranchKey } from './branch-keys';
import { renderFileTreeRow } from './file-row-render';
import { FileTreeWindow } from './file-tree-window';
import { InlineCreateInput } from './inline-create-input';

import { worktreeFilesTreeQueryKey } from './worktree-tree-key';

export function WorktreeSection({
  projectId,
  orgId,
  sourceName,
  worktree,
  depthOffset,
}: {
  projectId: string;
  orgId: string;
  sourceName: string;
  worktree: RepositoryWorktree;
  depthOffset: number;
}) {
  const qc = useQueryClient();
  const showHidden = useExplorerHiddenStore((store) => store.showHidden);
  const branchKey = worktreeBranchKey(worktree.id);
  const expanded = useExplorerExpandStore((s) =>
    Boolean(s.branches[projectId]?.includes(branchKey)),
  );
  const toggleBranch = useExplorerExpandStore((s) => s.toggleBranch);
  const [dirs, setDirs] = useState<string[]>([]);
  const [draft, setDraft] = useState<{ kind: 'file' | 'dir'; parentPath: string } | null>(null);
  const [renamePath, setRenamePath] = useState<string | null>(null);
  const treeKey = worktreeFilesTreeQueryKey(projectId, worktree.id, showHidden);
  const treeQuery = useQuery({
    queryKey: treeKey,
    queryFn: () =>
      listSourceFilesTree(projectId, { includeHidden: showHidden, worktreeId: worktree.id }),
    enabled: expanded,
    staleTime: 30000,
  });
  const selectedPaths = useFileSelectionStore((s) => s.selectedPaths);
  const selectionProjectId = useFileSelectionStore((s) => s.projectId);
  const selectionScope = useFileSelectionStore((s) => s.scopeWorktreeId);
  const setVisiblePaths = useFileSelectionStore((s) => s.setVisiblePaths);
  const activeSelectedPaths =
    selectionProjectId === projectId && selectionScope === worktree.id ? selectedPaths : [];
  const moveMutation = useMoveProjectFiles(projectId, worktree.id);
  const lazyState = useRef(createLazyChildrenState());
  const treeIndex = indexFileTree(treeQuery.data ?? []);
  const expandedDirs = new Set(dirs);
  const rows = flattenFileTree({
    index: treeIndex,
    showHidden,
    expandedDirs,
    depthOffset: depthOffset + 1,
    createDraft: draft,
  });
  const rootLabel = worktree.branch;
  const rootTitle = `${sourceName}.worktrees/${worktree.branch}`;
  const [rootDrop, setRootDrop] = useState<'valid' | 'invalid' | null>(null);

  useEffect(() => {
    if (selectionProjectId !== projectId || selectionScope !== worktree.id) {
      return;
    }
    setVisiblePaths(rows.filter((row) => row.kind === 'entry').map((row) => row.fullPath));
  }, [rows, selectionProjectId, selectionScope, projectId, worktree.id, setVisiblePaths]);

  const invalidateTree = () => {
    void qc.invalidateQueries({ queryKey: worktreeFilesTreeQueryKey(projectId, worktree.id) });
    void qc.invalidateQueries({ queryKey: repositoryWorktreesQueryKey(orgId, projectId) });
  };

  const toggleDir = (dirPath: string) => {
    startTransition(() =>
      setDirs((prev) =>
        prev.includes(dirPath) ? prev.filter((p) => p !== dirPath) : [...prev, dirPath],
      ),
    );
    if (!dirs.includes(dirPath)) {
      ensurePrunedChildren({
        qc,
        treeKey,
        projectId,
        dirPath,
        state: lazyState.current,
        worktreeId: worktree.id,
      });
    }
  };

  const handleSelect = (path: string) => {
    const store = useFileSelectionStore.getState();
    if (store.projectId !== projectId || store.scopeWorktreeId !== worktree.id) {
      store.setScope(projectId, worktree.id);
    }
    store.setFilesActive(true);
    store.selectSingle(path);
  };

  const handleOpen = (path: string) => {
    useIdeStore.getState().openFile(projectId, path, worktree.id, worktree.branch);
  };

  const finishCreate = (name: string) => {
    if (!draft || !name.trim()) {
      setDraft(null);
      return;
    }
    const relPath = draft.parentPath ? `${draft.parentPath}/${name.trim()}` : name.trim();
    createProjectFile(projectId, { path: relPath, kind: draft.kind, worktreeId: worktree.id })
      .then(() => {
        if (draft.kind === 'file') {
          useIdeStore.getState().openFile(projectId, relPath, worktree.id, worktree.branch);
        }
        invalidateTree();
      })
      .catch((error: unknown) => {
        toast.add({
          title: 'Create failed',
          description: error instanceof Error ? error.message : undefined,
        });
      });
    setDraft(null);
  };

  const handleDelete = (path: string) => {
    useIdeStore.getState().closeByEntity(projectId, 'file', path, worktree.id);
    deleteProjectFile(projectId, path, worktree.id)
      .then(() => invalidateTree())
      .catch((error: unknown) => {
        toast.add({
          title: 'Delete failed',
          description: error instanceof Error ? error.message : undefined,
        });
      });
  };

  const handleRenameFinish = (path: string, name: string) => {
    setRenamePath(null);
    const trimmed = name.trim();
    if (!trimmed || trimmed === path.split('/').pop()) {
      return;
    }
    if (!isValidFileName(trimmed)) {
      toast.add({ title: 'Invalid file name', description: trimmed });
      return;
    }
    moveMutation.mutate([buildRenameItem(path, trimmed)]);
  };

  const handleMoveInto = (targetDir: string, paths: string[]) => {
    const items = buildMoveItems(paths, targetDir);
    if (items.length === 0 || !canDropInto(paths, targetDir)) {
      return;
    }
    moveMutation.mutate(items);
  };

  const handleRootClick = (event: React.MouseEvent) => {
    if ((event.target as Element | null)?.closest?.('[data-branch-chevron]')) {
      toggleBranch(projectId, branchKey);
    }
  };

  const handleRootDragOver = (event: React.DragEvent) => {
    const drag = moveDrag();
    if (!drag || !sameMoveScope(drag, projectId, worktree.id)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!canDropInto(drag.paths, '')) {
      setRootDrop('invalid');
      event.dataTransfer.dropEffect = 'none';
      return;
    }
    event.dataTransfer.dropEffect = 'move';
    setRootDrop('valid');
  };

  const handleRootDragLeave = (event: React.DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setRootDrop(null);
    }
  };

  const handleRootDrop = (event: React.DragEvent) => {
    setRootDrop(null);
    const drag = moveDrag();
    if (!drag || !sameMoveScope(drag, projectId, worktree.id) || !canDropInto(drag.paths, '')) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setMoveDrag(null);
    const items = buildMoveItems(drag.paths, '');
    if (items.length > 0) {
      moveMutation.mutate(items);
    }
  };

  const rowHandlers = {
    projectId,
    worktreeId: worktree.id,
    expandedDirs,
    selectedPaths: activeSelectedPaths,
    renamePath,
    onToggle: toggleDir,
    onSelect: handleSelect,
    onOpen: handleOpen,
    onStartCreate: (kind: 'file' | 'dir', parentPath: string) => {
      setDraft({ kind, parentPath });
    },
    onStartRename: setRenamePath,
    onRenameFinish: handleRenameFinish,
    onMoveInto: handleMoveInto,
    onDelete: handleDelete,
    onCreateFinish: finishCreate,
  };
  const renderRow = (row: FlatTreeRow) => renderFileTreeRow(row, rowHandlers);

  return (
    <div
      className="opacity-70 group-data-[collapsible=icon]:hidden"
      data-testid={`explorer-worktree-${worktree.id}`}
    >
      <ContextMenu>
        <ContextMenuTrigger className="block">
          <SidebarRow
            depth={depthOffset}
            actions={
              <WorktreeRootMenu
                projectId={projectId}
                orgId={orgId}
                worktree={worktree}
                onRefresh={invalidateTree}
              />
            }
            className={cn(
              rootDrop === 'valid' && 'bg-live/15 ring-1 ring-live ring-inset',
              rootDrop === 'invalid' && 'cursor-not-allowed opacity-60',
            )}
            aria-expanded={expanded}
            title={rootTitle}
            data-path={rootLabel}
            data-drop={rootDrop ?? undefined}
            onDragOver={handleRootDragOver}
            onDragLeave={handleRootDragLeave}
            onDrop={handleRootDrop}
            onClick={handleRootClick}
            onDoubleClick={() => toggleBranch(projectId, branchKey)}
          >
            <BranchFolderLabel
              open={expanded}
              label={rootLabel}
              titleClassName="text-sidebar-foreground/70"
            />
          </SidebarRow>
        </ContextMenuTrigger>
        <ContextMenuContent onClick={(event) => event.stopPropagation()}>
          <WorktreeRootMenuItems
            projectId={projectId}
            orgId={orgId}
            worktree={worktree}
            onRefresh={invalidateTree}
          />
        </ContextMenuContent>
      </ContextMenu>
      {expanded ? (
        <div className="flex min-h-full flex-col gap-0.5">
          {treeQuery.isPending ? (
            <div
              className="flex h-7 items-center gap-1.5 text-muted-foreground"
              style={{ paddingLeft: `${(depthOffset + 1) * SIDEBAR_ROW_INDENT + 22}px` }}
            >
              <Spinner className="size-4" />
              <span className="text-[11px]">Loading tree…</span>
            </div>
          ) : null}
          {draft && draft.parentPath === '' ? (
            <InlineCreateInput kind={draft.kind} onFinish={finishCreate} depth={depthOffset + 1} />
          ) : null}
          <FileTreeWindow
            rows={rows}
            rowHeight={SIDEBAR_ROW_HEIGHT}
            renderRow={renderRow}
            testId={`explorer-rows-${worktree.id}`}
          />
          {!treeQuery.isPending && rows.length === 0 ? (
            <p
              className="flex h-7 items-center text-[11px] text-muted-foreground"
              style={{ paddingLeft: `${(depthOffset + 1) * SIDEBAR_ROW_INDENT + 6}px` }}
            >
              Empty worktree.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

import { WorktreeRootMenu, WorktreeRootMenuItems } from './worktree-root-menu';
