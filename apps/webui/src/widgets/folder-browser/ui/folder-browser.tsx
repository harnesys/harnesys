import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowUpIcon, Loader2Icon, PlusIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getActiveOrgId } from '@/shared/api/active-org';
import { browseDirs, createDir } from '@/shared/api/host-fs';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { FolderTypeIcon } from '@/shared/ui/icons';
import { Input } from '@/shared/ui/input';

export interface FolderBrowserProps {
  orgId?: string;
  hostId?: string;
  invalid?: boolean;
  autoFocus?: boolean;
  inputId?: string;
  className?: string;
  listClassName?: string;
  onChange?: (path: string) => void;
}

export function FolderBrowser({
  orgId,
  hostId,
  invalid,
  autoFocus = false,
  inputId,
  className,
  listClassName = 'h-48',
  onChange,
}: FolderBrowserProps) {
  const resolvedOrgId = orgId ?? getActiveOrgId();
  const [dirPath, setDirPath] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const syncedPath = useRef<string | null>(null);

  const listingQuery = useQuery({
    queryKey: ['host-dirs', resolvedOrgId ?? '', hostId ?? null, dirPath],
    queryFn: () =>
      browseDirs(resolvedOrgId ?? '', {
        ...(dirPath ? { path: dirPath } : {}),
        ...(hostId ? { hostId } : {}),
      }),
    enabled: Boolean(resolvedOrgId),
  });
  const listing = listingQuery.data;

  useEffect(() => {
    if (listing && listing.path !== syncedPath.current) {
      syncedPath.current = listing.path;
      setPathInput(listing.path);
      onChange?.(listing.path);
    }
  }, [listing, onChange]);

  useEffect(() => {
    if (listingQuery.error instanceof Error) {
      setActionError(listingQuery.error.message);
    }
  }, [listingQuery.error]);

  const createMutation = useMutation({
    mutationFn: (path: string) =>
      createDir(resolvedOrgId ?? '', { path, ...(hostId ? { hostId } : {}) }),
    onSuccess: (result) => {
      setCreating(false);
      setNewName('');
      setActionError(null);
      setDirPath(result.absolutePath);
      onChange?.(result.absolutePath);
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : 'Folder not created');
    },
  });

  const applyPath = () => {
    const trimmed = pathInput.trim();
    if (trimmed.length === 0) {
      return;
    }
    setActionError(null);
    setDirPath(trimmed);
    onChange?.(trimmed);
  };

  const enter = (path: string) => {
    setActionError(null);
    setDirPath(path);
    onChange?.(path);
  };

  const submitCreate = () => {
    const name = newName.trim();
    const base = (pathInput.trim() || listing?.path || '').replace(/\/+$/, '');
    if (name.length === 0 || name.includes('/') || base.length === 0) {
      return;
    }
    createMutation.mutate(`${base}/${name}`);
  };

  if (!resolvedOrgId) {
    return (
      <p className={cn('text-muted-foreground text-sm', className)}>
        No active organization to browse folders on.
      </p>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          value={pathInput}
          onChange={(event) => setPathInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              applyPath();
            }
          }}
          placeholder="/home/user/work/app"
          autoFocus={autoFocus}
          aria-invalid={invalid || undefined}
          data-testid="folder-browser-path-input"
        />
        <Button type="button" variant="outline" size="sm" onClick={applyPath}>
          Apply
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Go up"
          disabled={!listing?.parent}
          onClick={() => {
            if (listing?.parent) {
              enter(listing.parent);
            }
          }}
        >
          <ArrowUpIcon />
        </Button>
      </div>
      <div
        className={cn('flex flex-col gap-0.5 overflow-y-auto rounded-lg border p-1', listClassName)}
        data-testid="folder-browser-list"
      >
        {listingQuery.isPending ? (
          <div className="flex items-center justify-center gap-2 p-3 text-muted-foreground text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Loading…
          </div>
        ) : null}
        {(listing?.entries ?? []).map((entry) => (
          <Button
            key={entry.path}
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start font-normal"
            onClick={() => enter(entry.path)}
          >
            <span data-icon="inline-start" className="inline-flex shrink-0">
              <FolderTypeIcon size="sm" />
            </span>
            {entry.name}
          </Button>
        ))}
        {listing && listing.entries.length === 0 && !listingQuery.isPending ? (
          <div className="p-3 text-center text-muted-foreground text-sm">No subfolders</div>
        ) : null}
      </div>
      {actionError ? <p className="text-destructive text-sm">{actionError}</p> : null}
      {creating ? (
        <div className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitCreate();
              }
            }}
            placeholder="New folder name"
            autoFocus
            data-testid="folder-browser-new-name"
          />
          <Button
            type="button"
            size="sm"
            disabled={createMutation.isPending || newName.trim().length === 0}
            onClick={submitCreate}
          >
            {createMutation.isPending ? 'Creating…' : 'Create'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setCreating(false);
              setNewName('');
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => {
            setActionError(null);
            setCreating(true);
          }}
          data-testid="folder-browser-create-toggle"
        >
          <PlusIcon data-icon="inline-start" />
          Create folder
        </Button>
      )}
    </div>
  );
}
