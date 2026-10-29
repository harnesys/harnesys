import type { GitFileStatus, ProjectFileEntry } from '@harnesys/studio-shared';
import {
  ClipboardIcon,
  CopyIcon,
  DownloadIcon,
  FileIcon,
  FolderIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PenLineIcon,
  ScanSearchIcon,
  SquareTerminalIcon,
  TrashIcon,
} from 'lucide-react';
import type { useOpenNewTerminal } from '@/features/ide';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import type { useEntryActions } from '../model/use-entry-actions';

type OpenNewTerminal = ReturnType<typeof useOpenNewTerminal>;
type EntryActions = ReturnType<typeof useEntryActions>;

export function FileRowActions({
  projectId,
  worktreeId,
  entry,
  fullPath,
  isDir,
  infoLabel,
  openNewTerminal,
  entryActions,
  onOpen,
  onStartCreate,
  onStartRename,
  onDelete,
}: {
  projectId: string;
  worktreeId?: string;
  entry: ProjectFileEntry;
  fullPath: string;
  isDir: boolean;
  infoLabel: string;
  openNewTerminal: OpenNewTerminal;
  entryActions: EntryActions;
  onOpen: (fullPath: string) => void;
  onStartCreate: (kind: 'file' | 'dir', parentPath: string) => void;
  onStartRename: (fullPath: string) => void;
  onDelete: (fullPath: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-hover/file:opacity-100 data-open:opacity-100 group-data-[collapsible=icon]:hidden"
          />
        }
        onClick={(event) => event.stopPropagation()}
      >
        <MoreHorizontalIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
        <span className="sr-only">File actions</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
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
              {!worktreeId ? (
                <DropdownMenuItem
                  data-testid="folder-open-terminal"
                  onClick={() => {
                    void openNewTerminal(projectId, fullPath).catch(() => undefined);
                  }}
                >
                  <SquareTerminalIcon className="size-3.5" />
                  Terminal
                </DropdownMenuItem>
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
          <DropdownMenuItem disabled>
            <InfoIcon className="size-3.5" />
            Info
            <span className="ml-auto text-[11px] text-muted-foreground">{infoLabel}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => onDelete(fullPath)}>
          <TrashIcon className="size-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type { GitFileStatus };
