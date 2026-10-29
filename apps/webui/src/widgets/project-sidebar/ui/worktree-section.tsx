import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
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
import { FolderTypeIcon } from '@/shared/ui/icons';
import { Spinner } from '@/shared/ui/spinner';
import { toast } from '@/shared/ui/toast';
import { useExplorerExpandStore } from '../model/explorer-expand.store';
import { useExplorerHiddenStore } from '../model/explorer-hidden.store';
import { useFileSelectionStore } from '../model/file-selection.store';
import { childrenOf, indexFileTree } from '../model/file-tree-index';
import { worktreeBranchKey } from './branch-keys';
import { FileRow, InlineCreateInput } from './file-row';

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
  const treeIndex = indexFileTree(treeQuery.data ?? []);
  const rootLabel = worktree.branch;
  const rootTitle = `${sourceName}.worktrees/${worktree.branch}`;
  const [rootDrop, setRootDrop] = useState<'valid' | 'invalid' | null>(null);

  useEffect(() => {
    if (selectionProjectId !== projectId || selectionScope !== worktree.id) {
      return;
    }
    const out: string[] = [];
    const walk = (parent: string) => {
      for (const entry of childrenOf(treeIndex, parent, showHidden)) {
        out.push(entry.path);
        if (entry.kind === 'dir' && dirs.includes(entry.path)) {
          walk(entry.path);
        }
      }
    };
    walk('');
    setVisiblePaths(out);
  }, [
    treeIndex,
    dirs,
    showHidden,
    selectionProjectId,
    selectionScope,
    projectId,
    worktree.id,
    setVisiblePaths,
  ]);

  const invalidateTree = () => {
    void qc.invalidateQueries({ queryKey: worktreeFilesTreeQueryKey(projectId, worktree.id) });
    void qc.invalidateQueries({ queryKey: repositoryWorktreesQueryKey(orgId, projectId) });
  };

  const toggleDir = (dirPath: string) => {
    setDirs((prev) =>
      prev.includes(dirPath) ? prev.filter((p) => p !== dirPath) : [...prev, dirPath],
    );
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

  return (
    <div
      className="opacity-70 group-data-[collapsible=icon]:hidden"
      data-testid={`explorer-worktree-${worktree.id}`}
    >
      <div
        role="treeitem"
        tabIndex={0}
        aria-expanded={expanded}
        className={cn(
          'group/ws relative flex items-center rounded-md hover:bg-sidebar-accent/70',
          rootDrop === 'valid' && 'bg-live/15 ring-1 ring-live ring-inset',
          rootDrop === 'invalid' && 'cursor-not-allowed opacity-60',
        )}
        data-path={rootLabel}
        data-drop={rootDrop ?? undefined}
        onDragOver={handleRootDragOver}
        onDragLeave={handleRootDragLeave}
        onDrop={handleRootDrop}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') {
            return;
          }
          event.preventDefault();
          toggleBranch(projectId, branchKey);
        }}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left"
          style={{ paddingLeft: `${8 + depthOffset * 12}px` }}
          onClick={() => toggleBranch(projectId, branchKey)}
          title={rootTitle}
        >
          <span className="flex size-[18px] shrink-0 items-center justify-center">
            <FolderTypeIcon open={expanded} size="md" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sidebar-foreground/70 text-xs">
            {rootLabel}
          </span>
        </button>
        <span className="absolute top-1/2 right-1 -translate-y-1/2">
          <WorktreeRootMenu
            projectId={projectId}
            orgId={orgId}
            worktree={worktree}
            onRefresh={invalidateTree}
          />
        </span>
      </div>
      {expanded ? (
        <div className="flex min-h-full flex-col gap-0.5">
          {treeQuery.isPending ? (
            <div className="flex items-center gap-1.5 px-2 py-2 text-muted-foreground">
              <Spinner className="size-3" />
              <span className="text-xs">Loading tree…</span>
            </div>
          ) : null}
          {draft && draft.parentPath === '' ? (
            <InlineCreateInput kind={draft.kind} onFinish={finishCreate} depth={depthOffset + 1} />
          ) : null}
          {childrenOf(treeIndex, '', showHidden).map((entry) => (
            <FileRow
              key={entry.name}
              entry={entry}
              parentPath=""
              depth={depthOffset + 1}
              projectId={projectId}
              worktreeId={worktree.id}
              expandedDirs={new Set(dirs)}
              selectedPaths={activeSelectedPaths}
              createDraft={draft ? { ...draft, projectId } : null}
              renamePath={renamePath}
              iconMode={false}
              gitMap={undefined}
              gitTruncated={false}
              treeIndex={treeIndex}
              showHidden={showHidden}
              onToggle={toggleDir}
              onSelect={handleSelect}
              onOpen={handleOpen}
              onStartCreate={(kind, parentPath) => setDraft({ kind, parentPath })}
              onCreateFinish={finishCreate}
              onStartRename={setRenamePath}
              onRenameFinish={handleRenameFinish}
              onMoveInto={handleMoveInto}
              onDelete={handleDelete}
            />
          ))}
          {!treeQuery.isPending && childrenOf(treeIndex, '', showHidden).length === 0 ? (
            <p
              className="px-2 py-2 text-muted-foreground text-xs"
              style={{ paddingLeft: `${8 + (depthOffset + 1) * 12}px` }}
            >
              Empty worktree.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

import { WorktreeRootMenu } from './worktree-root-menu';
