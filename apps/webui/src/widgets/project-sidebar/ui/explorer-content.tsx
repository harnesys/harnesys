import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { startTransition, useEffect, useRef, useState } from 'react';
import { useProjects } from '@/entities/project';
import { useIdeStore } from '@/features/ide';
import {
  buildMoveItems,
  buildRenameItem,
  canDropInto,
  isValidFileName,
  useMoveProjectFiles,
} from '@/features/move-project-files';
import { openProjectFile } from '@/features/open-file';
import {
  createProjectFile,
  deleteProjectFile,
  listSourceFilesTree,
  sourceFilesTreeQueryKey,
  writeProjectFileContent,
} from '@/shared/api/files';
import { getGitFileStatus, gitFileStatusQueryKey } from '@/shared/api/git';
import { useStudioNavigation } from '@/shared/config/navigation';
import { useSidebar } from '@/shared/ui/sidebar';
import { Spinner } from '@/shared/ui/spinner';
import { toast } from '@/shared/ui/toast';
import type { ViewerCreateTemplate } from '../model/explorer-draft.store';
import { useExplorerDraftStore } from '../model/explorer-draft.store';
import { useExplorerExpandStore } from '../model/explorer-expand.store';
import { useExplorerHiddenStore } from '../model/explorer-hidden.store';
import { createLazyChildrenState, ensurePrunedChildren } from '../model/explorer-lazy-children';
import { useFileSelectionStore } from '../model/file-selection.store';
import type { FlatTreeRow } from '../model/file-tree-index';
import { flattenFileTree, indexFileTree } from '../model/file-tree-index';
import { useFilesCopyPaste } from '../model/use-files-copy-paste';
import { useFilesHotkey } from '../model/use-files-hotkey';
import { useRootDragDrop } from '../model/use-root-drag-drop';
import { fetchViewerTemplate } from '../model/viewer-creates';
import { renderFileTreeRow } from './file-row-render';
import { FileTreeWindow } from './file-tree-window';
import { InlineCreateInput } from './inline-create-input';

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
  const expandedDirs = new Set(dirPaths);
  const [renamePath, setRenamePath] = useState<string | null>(null);
  const moveMutation = useMoveProjectFiles(projectId);
  const { handleRootDrop, handleRootDragOver } = useRootDragDrop({
    projectId,
    mutate: moveMutation.mutate,
  });
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
    mutationFn: async (input: {
      path: string;
      kind: 'file' | 'dir';
      template?: ViewerCreateTemplate;
    }) => {
      await createProjectFile(projectId, { path: input.path, kind: input.kind });
      if (input.kind === 'file' && input.template) {
        const content = await fetchViewerTemplate(input.template);
        await writeProjectFileContent(projectId, { path: input.path, content });
      }
      return { path: input.path };
    },
    onSuccess: invalidateTree,
  });
  const deleteMutation = useMutation({
    mutationFn: (path: string) => deleteProjectFile(projectId, path),
    onSuccess: invalidateTree,
  });
  const treeIndex = indexFileTree(treeQuery.data ?? []);
  const rows = flattenFileTree({
    index: treeIndex,
    showHidden,
    expandedDirs,
    depthOffset,
    createDraft,
  });
  const visiblePaths = rows.filter((row) => row.kind === 'entry').map((row) => row.fullPath);
  const setVisiblePaths = useFileSelectionStore((s) => s.setVisiblePaths);
  useEffect(() => {
    if (selectionProjectId === projectId && !selectionScope) {
      setVisiblePaths(visiblePaths);
    }
  }, [visiblePaths, setVisiblePaths, selectionProjectId, selectionScope, projectId]);
  const ensureLazyChildren = (dirPath: string) => {
    ensurePrunedChildren({
      qc,
      treeKey,
      projectId,
      dirPath,
      state: lazyState.current,
    });
  };
  const toggleDir = (dirPath: string) => {
    startTransition(() => toggleDirStore(projectId, dirPath));
    if (!expandedDirs.has(dirPath)) {
      ensureLazyChildren(dirPath);
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
  const ensureDirOpen = (dirPath: string) => {
    if (dirPath && !expandedDirs.has(dirPath)) {
      startTransition(() => toggleDirStore(projectId, dirPath));
    }
    ensureLazyChildren(dirPath);
  };
  const finishCreate = (name: string) => {
    if (!createDraft || !name.trim()) {
      cancelCreate();
      return;
    }
    const relPath = createDraft.parentPath
      ? `${createDraft.parentPath}/${name.trim()}`
      : name.trim();
    if (createDraft.kind === 'file' && createDraft.template) {
      // Template content must land before the viewer opens the file.
      void createMutation
        .mutateAsync({ path: relPath, kind: 'file', template: createDraft.template })
        .then(() => {
          openProjectFile(projectId, relPath);
          useIdeStore.getState().openFile(projectId, relPath);
        })
        .catch((error: unknown) => {
          toast.add({
            title: 'Failed to create file from template',
            description: error instanceof Error ? error.message : undefined,
          });
        });
      cancelCreate();
      return;
    }
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
  const handleMoveInto = (targetDir: string, paths: string[]) => {
    const items = buildMoveItems(paths, targetDir);
    if (items.length === 0 || !canDropInto(paths, targetDir)) {
      return;
    }
    moveMutation.mutate(items);
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
  const activateProject = () => {
    setScope(projectId, null);
  };
  const handleSelect = (path: string, event?: React.MouseEvent) => {
    activateProject();
    setFilesActive(true);
    if (event?.shiftKey) {
      const anchor = useFileSelectionStore.getState().anchorPath;
      if (!anchor) {
        selectSingle(path);
      } else {
        selectRange(path);
      }
      return;
    }
    if (event?.metaKey || event?.ctrlKey) {
      togglePath(path);
      return;
    }
    selectSingle(path);
  };
  const handleOpen = (path: string) => {
    activateProject();
    openProjectFile(projectId, path);
    useIdeStore.getState().openFile(projectId, path);
    openFile(projectId, path);
  };
  useFilesHotkey(selectionProjectId === projectId ? projectId : '');
  useFilesCopyPaste(projectId, qc);
  const rowHandlers = {
    projectId,
    expandedDirs,
    selectedPaths: activeSelectedPaths,
    renamePath,
    iconMode,
    gitMap: gitTruncated ? undefined : gitMap,
    gitTruncated,
    onToggle: toggleDir,
    onSelect: handleSelect,
    onOpen: handleOpen,
    onStartCreate: (kind: 'file' | 'dir', parentPath: string) => {
      startCreate(kind, parentPath, projectId);
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
      role="tree"
      className="flex min-h-full flex-col gap-0.5 group-data-[collapsible=icon]:items-center"
      onDragOver={handleRootDragOver}
      onDrop={handleRootDrop}
      data-testid={`explorer-content-${projectId}`}
    >
      {gitTruncated ? (
        <div className="mx-2 mt-1 rounded-md bg-status-warn/10 px-2 py-1 text-[10px] text-status-warn group-data-[collapsible=icon]:hidden">
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
      <FileTreeWindow
        rows={rows}
        rowHeight={iconMode ? 32 : 24}
        renderRow={renderRow}
        testId={`explorer-rows-${projectId}`}
      />
      {!treeQuery.isPending && rows.length === 0 ? (
        <p
          className="px-2 py-2 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden"
          style={{ paddingLeft: `${8 + depthOffset * 12}px` }}
        >
          Empty source.
        </p>
      ) : null}
    </div>
  );
}
