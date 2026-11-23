import { AlertTriangleIcon, Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import type { DiscardRequest } from '../model/source-control';

interface SourceControlDiscardOverlayProps {
  request: DiscardRequest;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (deleteUntracked: boolean) => void;
}

export function SourceControlDiscardOverlay({
  request,
  pending,
  onCancel,
  onConfirm,
}: SourceControlDiscardOverlayProps) {
  const [deleteUntracked, setDeleteUntracked] = useState(request.defaultDeleteUntracked);
  const mandatory = request.deletable && request.untrackedPaths.length === request.paths.length;
  const willDelete = mandatory || deleteUntracked;
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 p-4 backdrop-blur-xs">
      <div className="flex w-full max-w-md flex-col gap-3 rounded-xl border bg-popover p-4 shadow-lg">
        <div className="flex items-start gap-2">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="flex flex-col gap-1">
            <h3 className="font-medium text-sm">
              Discard {request.paths.length === 1 ? '1 file' : `${request.paths.length} files`}?
            </h3>
            <p className="text-muted-foreground text-xs">
              Uncommitted changes will be lost. This cannot be undone.
            </p>
          </div>
        </div>
        <div className="max-h-40 overflow-y-auto rounded-md border bg-muted/30 p-2">
          <ul className="flex flex-col gap-0.5">
            {request.paths.map((path) => (
              <li key={path} className="truncate font-mono text-[11px] text-muted-foreground">
                {path}
              </li>
            ))}
          </ul>
        </div>
        <label
          htmlFor="source-control-discard-untracked"
          className="flex items-start gap-2 text-xs"
        >
          <Checkbox
            id="source-control-discard-untracked"
            checked={willDelete}
            disabled={!request.deletable || mandatory}
            onCheckedChange={(value) => setDeleteUntracked(value === true)}
            aria-label="Also delete untracked files from disk"
          />
          <span className="leading-tight">
            Also delete untracked files from disk
            {mandatory ? (
              <span className="block text-[10px] text-muted-foreground">
                Untracked files cannot be restored, so they are removed from disk.
              </span>
            ) : null}
            {!request.deletable ? (
              <span className="block text-[10px] text-muted-foreground">
                No untracked or added files in this selection
              </span>
            ) : null}
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => onConfirm(willDelete)}
            disabled={pending}
          >
            {pending ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
            Discard changes
          </Button>
        </div>
      </div>
    </div>
  );
}
