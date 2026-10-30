import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpIcon } from 'lucide-react';
import { useState } from 'react';
import { browseProjectDirsQuery, createProjectDir, type DirectoryListing } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { FolderTypeIcon } from '@/shared/ui/icons';
import { Input } from '@/shared/ui/input';

interface FolderBrowserDialogProps {
  nodeId?: string;
  nodeLabel?: string;
  orgId?: string;
  onResolve: (path?: string) => void;
}

export function FolderBrowserDialog({
  nodeId,
  nodeLabel,
  orgId,
  onResolve,
}: FolderBrowserDialogProps) {
  const [path, setPath] = useState<string | undefined>(undefined);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useQuery(browseProjectDirsQuery({ path, nodeId, orgId }));
  const create = useMutation({
    mutationFn: (folderName: string) => {
      const base = data?.path;
      if (!base) {
        throw new Error('No current folder');
      }
      return createProjectDir({ path: `${base}/${folderName}`, nodeId, orgId });
    },
    onSuccess: (result) => {
      setNewName('');
      setCreateError(null);
      setPath(result.absolutePath);
      void queryClient.invalidateQueries({ queryKey: ['project-dirs'] });
    },
    onError: (err: unknown) => {
      setCreateError(err instanceof Error ? err.message : String(err));
    },
  });
  const name = newName.trim();
  const canCreate = name.length > 0 && !name.includes('/') && data?.path !== undefined;
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
        <div className="flex shrink-0 items-center gap-2">
          <Input
            value={newName}
            placeholder="New folder name"
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canCreate) {
                event.preventDefault();
                create.mutate(name);
              }
            }}
            data-testid="folder-browser-new-name"
          />
          <Button
            type="button"
            variant="outline"
            disabled={!canCreate || create.isPending}
            onClick={() => create.mutate(name)}
            data-testid="folder-browser-create"
          >
            {create.isPending ? 'Creating…' : 'New folder'}
          </Button>
        </div>
        {createError ? <p className="shrink-0 text-destructive text-sm">{createError}</p> : null}
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
