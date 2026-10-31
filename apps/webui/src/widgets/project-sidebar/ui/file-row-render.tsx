import type { GitFileStatusMap, ProjectFileEntry } from '@harnesys/studio-shared';
import { Spinner } from '@/shared/ui/spinner';
import type { FlatTreeRow } from '../model/file-tree-index';
import { FileRow } from './file-row';
import { InlineCreateInput } from './inline-create-input';

export interface FileTreeRowHandlers {
  projectId: string;
  worktreeId?: string;
  expandedDirs: Set<string>;
  selectedPaths: string[];
  renamePath: string | null;
  iconMode: boolean;
  gitMap?: GitFileStatusMap;
  gitTruncated?: boolean;
  onToggle: (fullPath: string) => void;
  onSelect: (fullPath: string, event?: React.MouseEvent) => void;
  onOpen: (fullPath: string) => void;
  onStartCreate: (kind: 'file' | 'dir', parentPath: string) => void;
  onStartRename: (fullPath: string) => void;
  onRenameFinish: (fullPath: string, name: string) => void;
  onMoveInto: (targetDir: string, paths: string[]) => void;
  onDelete: (fullPath: string) => void;
  onCreateFinish: (name: string) => void;
}

export function renderFileTreeRow(row: FlatTreeRow, h: FileTreeRowHandlers): React.ReactNode {
  if (row.kind === 'loading') {
    return (
      <div
        className="flex items-center gap-1.5 py-0.5 text-muted-foreground text-xs"
        style={{ paddingLeft: `${row.depth * 12 + 8}px` }}
        data-testid={`file-${row.fullPath}-loading`}
      >
        <Spinner className="size-3" />
        <span>Loading…</span>
      </div>
    );
  }
  if (row.kind === 'create') {
    return (
      <InlineCreateInput
        kind={row.createKind ?? 'file'}
        onFinish={h.onCreateFinish}
        depth={row.depth}
      />
    );
  }
  const entry: ProjectFileEntry | undefined = row.entry;
  if (!entry) {
    return null;
  }
  return (
    <FileRow
      entry={entry}
      fullPath={row.fullPath}
      depth={row.depth}
      childCount={row.childCount}
      projectId={h.projectId}
      worktreeId={h.worktreeId}
      expandedDirs={h.expandedDirs}
      selectedPaths={h.selectedPaths}
      renamePath={h.renamePath}
      iconMode={h.iconMode}
      gitMap={h.gitMap}
      gitTruncated={h.gitTruncated}
      onToggle={h.onToggle}
      onSelect={h.onSelect}
      onOpen={h.onOpen}
      onStartCreate={h.onStartCreate}
      onStartRename={h.onStartRename}
      onRenameFinish={h.onRenameFinish}
      onMoveInto={h.onMoveInto}
      onDelete={h.onDelete}
    />
  );
}
