import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { FolderBrowser } from './folder-browser';

export interface FolderBrowserDialogProps {
  orgId?: string;
  hostId?: string;
  nodeLabel?: string;
  onResolve: (path?: string) => void;
}

export function FolderBrowserDialog({
  orgId,
  hostId,
  nodeLabel,
  onResolve,
}: FolderBrowserDialogProps) {
  const [current, setCurrent] = useState<string | undefined>(undefined);
  return (
    <Dialog open>
      <DialogContent className="flex h-[32rem] flex-col gap-4 sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>Folders on {nodeLabel ?? 'host'}</DialogTitle>
        </DialogHeader>
        <FolderBrowser
          orgId={orgId}
          hostId={hostId}
          className="min-h-0 flex-1"
          listClassName="min-h-0 flex-1"
          onChange={setCurrent}
        />
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onResolve()}>
            Cancel
          </Button>
          <Button
            disabled={current === undefined}
            onClick={() => onResolve(current)}
            data-testid="folder-browser-use"
          >
            Select
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
