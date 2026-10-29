import { useQuery } from '@tanstack/react-query';
import { ArrowUpIcon } from 'lucide-react';
import { useState } from 'react';
import { browseProjectDirsQuery, type DirectoryListing } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { FolderTypeIcon } from '@/shared/ui/icons';

interface FolderBrowserDialogProps {
  nodeId?: string;
  nodeLabel?: string;
  onResolve: (path?: string) => void;
}

export function FolderBrowserDialog({ nodeId, nodeLabel, onResolve }: FolderBrowserDialogProps) {
  const [path, setPath] = useState<string | undefined>(undefined);
  const { data, isPending, isError } = useQuery(browseProjectDirsQuery({ path, nodeId }));
  return (
    <Dialog open>
      <DialogContent className="flex h-[32rem] flex-col gap-4 sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>Folders on {nodeLabel ?? 'host'}</DialogTitle>
        </DialogHeader>
        <p
          className="shrink-0 truncate font-mono text-muted-foreground text-xs"
          data-testid="folder-browser-path"
          title={data?.path}
        >
          {data?.path ?? '…'}
        </p>
        <div className="min-h-0 flex-1">
          {isError ? (
            <p className="text-destructive text-sm">Folder is unavailable.</p>
          ) : (
            <DirList data={data} pending={isPending} onOpen={setPath} />
          )}
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onResolve()}>
            Cancel
          </Button>
          <Button
            disabled={isPending || isError}
            onClick={() => onResolve(data?.path)}
            data-testid="folder-browser-use"
          >
            Use this folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DirList({
  data,
  pending,
  onOpen,
}: {
  data?: DirectoryListing;
  pending: boolean;
  onOpen: (path: string) => void;
}) {
  if (pending) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col overflow-y-auto rounded-md border">
      {data?.parent ? (
        <button
          type="button"
          className="flex shrink-0 items-center gap-2 px-3 py-1.5 text-left text-sm outline-none hover:bg-accent"
          onClick={() => onOpen(data.parent as string)}
          data-testid="folder-browser-up"
        >
          <ArrowUpIcon className="size-4 shrink-0 text-muted-foreground" />
          ..
        </button>
      ) : null}
      {(data?.entries ?? []).map((entry) => (
        <button
          key={entry.path}
          type="button"
          className="flex shrink-0 items-center gap-2 px-3 py-1.5 text-left text-sm outline-none hover:bg-accent"
          onClick={() => onOpen(entry.path)}
        >
          <FolderTypeIcon size="sm" />
          {entry.name}
        </button>
      ))}
      {(data?.entries.length ?? 0) === 0 ? (
        <p className="px-3 py-2 text-muted-foreground text-sm">No subfolders.</p>
      ) : null}
    </div>
  );
}
