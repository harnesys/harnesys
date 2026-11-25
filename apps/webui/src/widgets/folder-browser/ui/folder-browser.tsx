import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2Icon, PlusIcon } from 'lucide-react';
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { getActiveOrgId } from '@/shared/api/active-org';
import { browseDirs, createDir } from '@/shared/api/host-fs';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { FileTypeIcon, FolderTypeIcon } from '@/shared/ui/icons';
import { Input } from '@/shared/ui/input';

export interface FolderBrowserHandle {
  startCreate: () => void;
}

export interface FolderBrowserProps {
  orgId?: string;
  hostId?: string;
  invalid?: boolean;
  autoFocus?: boolean;
  inputId?: string;
  className?: string;
  listClassName?: string;
  /** Directory to open at; the home directory when omitted. */
  initialPath?: string;
  /** Confine navigation and typed paths to this directory. */
  rootPath?: string;
  /** Show files next to directories so one can be picked. */
  files?: boolean;
  /** Render the create toggle under the list; turn off when it lives in a dialog footer. */
  showCreateToggle?: boolean;
  /** Fires when a file row is clicked; navigation still fires onChange. */
  onSelectFile?: (path: string) => void;
  onChange?: (path: string) => void;
  ref?: Ref<FolderBrowserHandle>;
}

export function FolderBrowser({
  orgId,
  hostId,
  invalid,
  autoFocus = false,
  inputId,
  className,
  listClassName = 'h-48',
  initialPath,
  rootPath,
  files = false,
  showCreateToggle = true,
  onSelectFile,
  onChange,
  ref,
}: FolderBrowserProps) {
  const resolvedOrgId = orgId ?? getActiveOrgId();
  const queryClient = useQueryClient();
  const [dirPath, setDirPath] = useState<string | null>(initialPath ?? null);
  const [pathInput, setPathInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const syncedPath = useRef<string | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      startCreate: () => {
        setActionError(null);
        setCreating(true);
      },
    }),
    [],
  );

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
  const root = rootPath === undefined ? null : trimTrailingSlashes(rootPath);
  const insideRoot = (candidate: string): boolean => {
    if (root === null) {
      return true;
    }
    const normalized = trimTrailingSlashes(candidate);
    if (normalized.split('/').includes('..')) {
      return false;
    }
    return normalized === root || normalized.startsWith(root === '/' ? '/' : `${root}/`);
  };
  const parentPath = listing?.parent && insideRoot(listing.parent) ? listing.parent : null;

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
    onSuccess: () => {
      setCreating(false);
      setNewName('');
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['host-dirs'] });
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
    if (root !== null && (!trimmed.startsWith('/') || !insideRoot(trimmed))) {
      setActionError(`Keep inside ${root}`);
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
    const base = listing?.path ?? dirPath ?? '';
    if (name.length === 0 || createMutation.isPending) {
      return;
    }
    if (name.includes('/') || name === '.' || name === '..') {
      setActionError('Folder name cannot contain slashes');
      return;
    }
    if (base.length === 0) {
      return;
    }
    if (!insideRoot(`${base}/${name}`)) {
      setActionError(`Keep inside ${root}`);
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
      </div>
      <div
        className={cn('flex flex-col gap-0.5 overflow-y-auto rounded-lg border p-1', listClassName)}
        data-testid="folder-browser-list"
      >
        {parentPath !== null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 font-normal"
            aria-label="Parent folder"
            onClick={() => enter(parentPath)}
          >
            <span data-icon="inline-start" className="inline-flex shrink-0">
              <FolderTypeIcon size="sm" />
            </span>
            <span className="truncate">..</span>
          </Button>
        ) : null}
        {creating ? (
          <div className="flex h-7 items-center gap-2 pr-1 pl-1.5">
            <span className="inline-flex shrink-0">
              <FolderTypeIcon size="sm" />
            </span>
            <Input
              className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-[0.8rem] shadow-none focus-visible:ring-0 dark:bg-transparent"
              value={newName}
              placeholder="New folder name"
              aria-label="New folder name"
              autoFocus
              disabled={createMutation.isPending}
              data-testid="folder-browser-new-name"
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitCreate();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  setCreating(false);
                  setNewName('');
                }
              }}
              onBlur={() => {
                if (newName.trim().length === 0) {
                  setCreating(false);
                }
              }}
            />
          </div>
        ) : null}
        {listingQuery.isPending ? (
          <div className="flex items-center justify-center gap-2 p-3 text-muted-foreground text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Loading…
          </div>
        ) : null}
        {(listing?.entries ?? [])
          .filter((entry) => files || entry.kind !== 'file')
          .map((entry) =>
            entry.kind === 'file' ? (
              <Button
                key={entry.path}
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 font-normal"
                onClick={() => onSelectFile?.(entry.path)}
              >
                <span data-icon="inline-start" className="inline-flex shrink-0">
                  <FileTypeIcon name={entry.name} size="sm" />
                </span>
                <span className="truncate">{entry.name}</span>
              </Button>
            ) : (
              <Button
                key={entry.path}
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 font-normal"
                onClick={() => enter(entry.path)}
              >
                <span data-icon="inline-start" className="inline-flex shrink-0">
                  <FolderTypeIcon size="sm" />
                </span>
                {entry.name}
              </Button>
            ),
          )}
        {listing && listing.entries.length === 0 && !listingQuery.isPending && !creating ? (
          <div className="p-3 text-center text-muted-foreground text-sm">
            {files ? 'Nothing here' : 'No subfolders'}
          </div>
        ) : null}
      </div>
      {actionError ? <p className="text-destructive text-sm">{actionError}</p> : null}
      {showCreateToggle && !creating ? (
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
      ) : null}
    </div>
  );
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '') || '/';
}
