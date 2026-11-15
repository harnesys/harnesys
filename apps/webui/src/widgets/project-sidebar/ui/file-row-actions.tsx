import type { GitFileStatus, ProjectFileEntry } from '@harnesys/studio-shared';
import {
  ClipboardIcon,
  CopyIcon,
  DownloadIcon,
  FileIcon,
  FolderIcon,
  PenLineIcon,
  ScanSearchIcon,
  SquareTerminalIcon,
  TrashIcon,
} from 'lucide-react';
import type { useOpenNewTerminal } from '@/features/ide';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/shared/ui/dropdown-menu';
import { IconRef } from '@/shared/ui/icon';
import { useExplorerDraftStore } from '../model/explorer-draft.store';
import type { useEntryActions } from '../model/use-entry-actions';
import { useViewerCreates } from '../model/viewer-creates';

type OpenNewTerminal = ReturnType<typeof useOpenNewTerminal>;
type EntryActions = ReturnType<typeof useEntryActions>;

export interface FileRowMenuProps {
  projectId: string;
  worktreeId?: string;
  entry: ProjectFileEntry;
  fullPath: string;
  isDir: boolean;
  openNewTerminal: OpenNewTerminal;
  entryActions: EntryActions;
  onOpen: (fullPath: string) => void;
  onStartCreate: (kind: 'file' | 'dir', parentPath: string) => void;
  onStartRename: (fullPath: string) => void;
  onDelete: (fullPath: string) => void;
}

export function FileRowMenuItems({
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
}: FileRowMenuProps) {
  const start = useExplorerDraftStore((state) => state.start);
  const viewerCreates = useViewerCreates();
  const templateItems = viewerCreates.map((template) => (
    <DropdownMenuItem
      key={template.viewerId}
      onClick={() => start('file', fullPath, projectId, template)}
    >
      {template.icon === undefined ? (
        <FileIcon className="size-3.5" />
      ) : (
        <IconRef icon={template.icon} className="size-3.5" />
      )}
      {template.label}
    </DropdownMenuItem>
  ));
  return (
    <>
      <DropdownMenuGroup>
        {!isDir ? (
          <DropdownMenuItem onClick={() => onOpen(fullPath)}>
            <FileIcon className="size-3.5" />
            Open
          </DropdownMenuItem>
        ) : null}
        {isDir ? (
          <>
            <DropdownMenuItem onClick={() => onStartCreate('file', fullPath)}>
              <FileIcon className="size-3.5" />
              New file
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStartCreate('dir', fullPath)}>
              <FolderIcon className="size-3.5" />
              New folder
            </DropdownMenuItem>
            {templateItems.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                {templateItems}
              </>
            ) : null}
            {!worktreeId ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  data-testid="folder-open-terminal"
                  onClick={() => {
                    void openNewTerminal(projectId, fullPath).catch(() => undefined);
                  }}
                >
                  <SquareTerminalIcon className="size-3.5" />
                  Terminal
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem onClick={() => onStartRename(fullPath)}>
          <PenLineIcon className="size-3.5" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            void navigator.clipboard.writeText(fullPath).catch(() => undefined);
          }}
        >
          <ClipboardIcon className="size-3.5" />
          Copy path
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => entryActions.duplicate(fullPath)}>
          <CopyIcon className="size-3.5" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => entryActions.reveal(fullPath)}>
          <ScanSearchIcon className="size-3.5" />
          Reveal in Finder
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => entryActions.download(fullPath, entry.name, isDir)}>
          <DownloadIcon className="size-3.5" />
          Download
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={() => onDelete(fullPath)}>
        <TrashIcon className="size-3.5" />
        Delete
      </DropdownMenuItem>
    </>
  );
}

export type { GitFileStatus };
