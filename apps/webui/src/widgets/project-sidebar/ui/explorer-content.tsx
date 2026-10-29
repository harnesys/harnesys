import type { ProjectMoveItem } from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProjects } from '@/entities/project';
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
import { openProjectFile } from '@/features/open-file';
import {
  createProjectFile,
  deleteProjectFile,
  listSourceFilesTree,
  sourceFilesTreeQueryKey,
} from '@/shared/api/files';
import { getGitFileStatus, gitFileStatusQueryKey } from '@/shared/api/git';
import { useStudioNavigation } from '@/shared/config/navigation';
import { useSidebar } from '@/shared/ui/sidebar';
import { Spinner } from '@/shared/ui/spinner';
import { toast } from '@/shared/ui/toast';
import { useExplorerDraftStore } from '../model/explorer-draft.store';
import { useExplorerExpandStore } from '../model/explorer-expand.store';
import { useExplorerHiddenStore } from '../model/explorer-hidden.store';
import { createLazyChildrenState, ensurePrunedChildren } from '../model/explorer-lazy-children';
import { useFileSelectionStore } from '../model/file-selection.store';
import { childrenOf, indexFileTree } from '../model/file-tree-index';
import { useFilesCopyPaste } from '../model/use-files-copy-paste';
import { useFilesHotkey } from '../model/use-files-hotkey';
import { FileRow, InlineCreateInput } from './file-row';

const EMPTY_DIRS: string[] = [];

export function ExplorerContent({
  projectId,
  depthOffset = 0,
}: {
  projectId: string;
  depthOffset?: number;
}) {
  const { state, isMobile } = useSidebar();
  const iconMode = state === 'collapsed' && !isMobile;
  const { openFile } = useStudioNavigation();
  const qc = useQueryClient();
  const projects = useProjects().data ?? [];
  const project = projects.find((row) => row.id === projectId);
  const mayHaveGit = project ? project.driver === 'host-bound' || project.hasGit : false;
  const draft = useExplorerDraftStore((store) => store.draft);
  const createDraft = draft?.projectId === projectId ? draft : null;
  const startCreate = useExplorerDraftStore((store) => store.start);
  const cancelCreate = useExplorerDraftStore((store) => store.cancel);
  const dirPaths = useExplorerExpandStore((s) => s.dirs[projectId] ?? EMPTY_DIRS);
  const toggleDirStore = useExplorerExpandStore((s) => s.toggleDir);
  const expandedDirs = useMemo(() => new Set(dirPaths), [dirPaths]);
  const [renamePath, setRenamePath] = useState<string | null>(null);
  const moveMutation = useMoveProjectFiles(projectId);
  const selectedPaths = useFileSelectionStore((s) => s.selectedPaths);
  const selectionProjectId = useFileSelectionStore((s) => s.projectId);
  const selectionScope = useFileSelectionStore((s) => s.scopeWorktreeId);
  const setScope = useFileSelectionStore((s) => s.setScope);
  const setFilesActive = useFileSelectionStore((s) => s.setFilesActive);
  const selectSingle = useFileSelectionStore((s) => s.selectSingle);
  const togglePath = useFileSelectionStore((s) => s.togglePath);
  const selectRange = useFileSelectionStore((s) => s.selectRange);
  const activeSelectedPaths =
    selectionProjectId === projectId && !selectionScope ? selectedPaths : [];
  const showHidden = useExplorerHiddenStore((store) => store.showHidden);
  const treeKey = sourceFilesTreeQueryKey(projectId, showHidden);
  const lazyState = useRef(createLazyChildrenState());
  const treeQuery = useQuery({
    queryKey: treeKey,
    queryFn: () => listSourceFilesTree(projectId, { includeHidden: showHidden }),
    staleTime: 60000,
  });
  const gitFileStatusQuery = useQuery({
    queryKey: gitFileStatusQueryKey(projectId),
    queryFn: () => getGitFileStatus(projectId),
    enabled: Boolean(projectId) && mayHaveGit,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const gitMap = gitFileStatusQuery.data?.map ?? {};
  const gitTruncated = Boolean(gitFileStatusQuery.data?.truncated);
  const invalidateTree = () => {
    void qc.invalidateQueries({ queryKey: sourceFilesTreeQueryKey(projectId) });
    void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(projectId) });
    void qc.invalidateQueries({ queryKey: ['projects', projectId, 'git', 'status'] });
  };
  const createMutation = useMutation({
    mutationFn: (input: { path: string; kind: 'file' | 'dir' }) =>
      createProjectFile(projectId, input),
    onSuccess: invalidateTree,
  });
  const deleteMutation = useMutation({
    mutationFn: (path: string) => deleteProjectFile(projectId, path),
    onSuccess: invalidateTree,
  });
  const treeIndex = useMemo(() => indexFileTree(treeQuery.data ?? []), [treeQuery.data]);
  const entries = childrenOf(treeIndex, '', showHidden);
  const computeVisible = useCallback((): string[] => {
    const out: string[] = [];
    const walk = (parent: string) => {
      for (const ent of childrenOf(treeIndex, parent, showHidden)) {
        out.push(ent.path);
        if (ent.kind === 'dir' && expandedDirs.has(ent.path)) {
          walk(ent.path);
        }
      }
    };
    walk('');
    return out;
  }, [treeIndex, expandedDirs, showHidden]);
  const visibleForStore = computeVisible();
  const setVisiblePaths = useFileSelectionStore((s) => s.setVisiblePaths);
  useEffect(() => {
    if (selectionProjectId === projectId && !selectionScope) {
      setVisiblePaths(visibleForStore);
    }
  }, [visibleForStore, setVisiblePaths, selectionProjectId, selectionScope, projectId]);
  const activateProject = useCallback(() => {
    setScope(projectId, null);
  }, [setScope, projectId]);
  const handleSelect = useCallback(
    (path: string, event?: React.MouseEvent) => {
      activateProject();
      setFilesActive(true);
      const e = event as React.MouseEvent | undefined;
      if (e?.shiftKey) {
        const anchor = useFileSelectionStore.getState().anchorPath;
        if (!anchor) {
          selectSingle(path);
        } else {
          selectRange(path);
        }
        return;
      }
      if (e?.metaKey || e?.ctrlKey) {
        togglePath(path);
        return;
      }
      selectSingle(path);
    },
    [activateProject, selectSingle, togglePath, selectRange, setFilesActive],
  );
  const ensureDirOpen = useCallback(
    (dirPath: string) => {
      if (!dirPath) {
        return;
      }
      if (!expandedDirs.has(dirPath)) {
        toggleDirStore(projectId, dirPath);
      }
      ensurePrunedChildren({
        qc,
        treeKey,
        projectId,
        dirPath,
        state: lazyState.current,
      });
    },
    [expandedDirs, toggleDirStore, projectId, qc, treeKey],
  );
  const toggleDir = (dirPath: string) => {
    const expanding = !expandedDirs.has(dirPath);
    toggleDirStore(projectId, dirPath);
    if (expanding) {
      ensurePrunedChildren({
        qc,
        treeKey,
        projectId,
        dirPath,
        state: lazyState.current,
      });
    }
  };
  useEffect(() => {
    if (!treeQuery.data) {
      return;
    }
    for (const dirPath of dirPaths) {
      ensurePrunedChildren({
        qc,
        treeKey,
        projectId,
        dirPath,
        state: lazyState.current,
      });
    }
  }, [treeQuery.data, dirPaths, qc, treeKey, projectId]);
  const finishCreate = (name: string) => {
    if (!createDraft || !name.trim()) {
      cancelCreate();
      return;
    }
    const relPath = createDraft.parentPath
      ? `${createDraft.parentPath}/${name.trim()}`
      : name.trim();
    createMutation.mutate({ path: relPath, kind: createDraft.kind });
    if (createDraft.kind === 'file') {
      openProjectFile(projectId, relPath);
      useIdeStore.getState().openFile(projectId, relPath);
    }
    if (createDraft.kind === 'dir') {
      ensureDirOpen(createDraft.parentPath);
    }
    cancelCreate();
  };
  const handleDelete = (path: string) => {
    deleteMutation.mutate(path);
    useIdeStore.getState().closeByEntity(projectId, 'file', path);
  };
  const move = (items: ProjectMoveItem[], expandTarget?: string) => {
    if (items.length === 0) {
      return;
    }
    moveMutation.mutate(items, {
      onSuccess: () => {
        if (expandTarget) {
          ensureDirOpen(expandTarget);
        }
      },
    });
  };
  const handleMoveInto = (targetDir: string, paths: string[]) => {
    move(buildMoveItems(paths, targetDir), targetDir);
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
    move([buildRenameItem(path, trimmed)]);
  };
  const handleRootDrop = (event: React.DragEvent) => {
    const drag = moveDrag();
    if (!drag || !sameMoveScope(drag, projectId)) {
      return;
    }
    if ((event.target as Element | null)?.closest?.('[data-path]')) {
      return;
    }
    const items = buildMoveItems(drag.paths, '');
    if (items.length === 0 || !canDropInto(drag.paths, '')) {
      return;
    }
    event.preventDefault();
    setMoveDrag(null);
    move(items);
  };
  const handleRootDragOver = (event: React.DragEvent) => {
    const drag = moveDrag();
    if (!drag || !sameMoveScope(drag, projectId)) {
      return;
    }
    if ((event.target as Element | null)?.closest?.('[data-path]')) {
      return;
    }
    if (!canDropInto(drag.paths, '') || buildMoveItems(drag.paths, '').length === 0) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };
  const handleOpen = (path: string) => {
    activateProject();
    openProjectFile(projectId, path);
    useIdeStore.getState().openFile(projectId, path);
    openFile(projectId, path);
  };
  useFilesHotkey(selectionProjectId === projectId ? projectId : '');
  useFilesCopyPaste(projectId, qc);
  return (
    <div
      role="tree"
      className="flex min-h-full flex-col gap-0.5 group-data-[collapsible=icon]:items-center"
      onDragOver={handleRootDragOver}
      onDrop={handleRootDrop}
      data-testid={`explorer-content-${projectId}`}
    >
      {gitTruncated ? (
        <div className="mx-1 rounded-md bg-status-warn/10 px-2 py-1 text-status-warn text-xs group-data-[collapsible=icon]:hidden">
          Large repo — file decorations off. Expand a folder for status.
        </div>
      ) : null}
      {treeQuery.isPending ? (
        <div className="flex items-center gap-1.5 px-2 py-2 text-muted-foreground group-data-[collapsible=icon]:hidden">
          <Spinner className="size-3" />
          <span className="text-xs">Loading tree…</span>
        </div>
      ) : null}
      {createDraft && createDraft.parentPath === '' ? (
        <InlineCreateInput kind={createDraft.kind} onFinish={finishCreate} depth={depthOffset} />
      ) : null}
      {entries.map((entry) => (
        <FileRow
          key={entry.name}
          entry={entry}
          parentPath=""
          depth={depthOffset}
          projectId={projectId}
          expandedDirs={expandedDirs}
          selectedPaths={activeSelectedPaths}
          createDraft={createDraft}
          renamePath={renamePath}
          iconMode={iconMode}
          gitMap={gitTruncated ? undefined : gitMap}
          gitTruncated={gitTruncated}
          treeIndex={treeIndex}
          showHidden={showHidden}
          onToggle={toggleDir}
          onSelect={handleSelect}
          onOpen={handleOpen}
          onStartCreate={(kind, parentPath) => startCreate(kind, parentPath, projectId)}
          onCreateFinish={finishCreate}
          onStartRename={setRenamePath}
          onRenameFinish={handleRenameFinish}
          onMoveInto={handleMoveInto}
          onDelete={handleDelete}
        />
      ))}
      {!treeQuery.isPending && entries.length === 0 ? (
        <p
          className="px-2 py-2 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden"
          style={{ paddingLeft: `${8 + depthOffset * 12}px` }}
        >
          Empty project.
        </p>
      ) : null}
    </div>
  );
}
