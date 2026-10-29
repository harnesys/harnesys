import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowUpIcon, Loader2Icon, PlusIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { browseDirs, createDir } from '@/shared/api/host-fs';
import { Button } from '@/shared/ui/button';
import { FolderTypeIcon } from '@/shared/ui/icons';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';

interface DirectoryPickerProps {
  orgId: string;
  hostId?: string;
  value: string;
  onChange: (path: string) => void;
  invalid?: boolean;
}

export function DirectoryPicker({ orgId, hostId, value, onChange, invalid }: DirectoryPickerProps) {
  const [dirPath, setDirPath] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const listingQuery = useQuery({
    queryKey: ['host-dirs', orgId, hostId ?? null, dirPath],
    queryFn: () =>
      browseDirs(orgId, {
        ...(dirPath ? { path: dirPath } : {}),
        ...(hostId ? { hostId } : {}),
      }),
    enabled: orgId.length > 0,
  });
  const listing = listingQuery.data;

  useEffect(() => {
    if (listing) {
      setPathInput(listing.path);
      if (listing.path !== value) {
        onChange(listing.path);
      }
    }
  }, [listing, value, onChange]);

  useEffect(() => {
    if (listingQuery.error instanceof Error) {
      toast.add({ title: 'Cannot open directory', description: listingQuery.error.message });
    }
  }, [listingQuery.error]);

  const createMutation = useMutation({
    mutationFn: (path: string) => createDir(orgId, { path, ...(hostId ? { hostId } : {}) }),
    onSuccess: (result) => {
      setCreating(false);
      setNewName('');
      setDirPath(result.absolutePath);
      onChange(result.absolutePath);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Folder not created';
      toast.add({ title: 'Cannot create folder', description: msg });
    },
  });

  const applyPath = () => {
    const trimmed = pathInput.trim();
    if (trimmed.length === 0) {
      return;
    }
    setDirPath(trimmed);
    onChange(trimmed);
  };

  const enter = (path: string) => {
    setDirPath(path);
  };

  const submitCreate = () => {
    const name = newName.trim();
    const base = (pathInput.trim() || listing?.path || '').replace(/\/+$/, '');
    if (name.length === 0 || base.length === 0) {
      return;
    }
    createMutation.mutate(`${base}/${name}`);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          id="add-source-folder-path"
          value={pathInput}
          onChange={(event) => setPathInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              applyPath();
            }
          }}
          placeholder="/home/user/work/app"
          autoFocus
          aria-invalid={invalid || undefined}
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
      <div className="flex h-48 flex-col gap-0.5 overflow-y-auto rounded-lg border p-1">
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
          />
          <Button
            type="button"
            size="sm"
            disabled={createMutation.isPending || newName.trim().length === 0}
            onClick={submitCreate}
          >
            Create
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
          onClick={() => setCreating(true)}
        >
          <PlusIcon data-icon="inline-start" />
          Create folder
        </Button>
      )}
    </div>
  );
}
