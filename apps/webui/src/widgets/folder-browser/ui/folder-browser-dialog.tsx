import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { FolderBrowser } from './folder-browser';

export interface FolderBrowserDialogProps {
  orgId?: string;
  hostId?: string;
  nodeLabel?: string;
  /** Directory the browser opens at. */
  initialPath?: string;
  /** Let the user pick a file as well as a folder. */
  files?: boolean;
  onResolve: (path?: string) => void;
}

export function FolderBrowserDialog({
  orgId,
  hostId,
  nodeLabel,
  initialPath,
  files = false,
  onResolve,
}: FolderBrowserDialogProps) {
  const [current, setCurrent] = useState<string | undefined>(initialPath);
  const [pickedFile, setPickedFile] = useState<string | undefined>(undefined);
  const title = files ? 'Files on' : 'Folders on';
  return (
    <Dialog open>
      <DialogContent className="flex h-[32rem] flex-col gap-4 sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {title} {nodeLabel ?? 'host'}
          </DialogTitle>
        </DialogHeader>
        <FolderBrowser
          orgId={orgId}
          hostId={hostId}
          className="min-h-0 flex-1"
          listClassName="min-h-0 flex-1"
          {...(initialPath !== undefined ? { initialPath } : {})}
          files={files}
          onChange={(path) => {
            setCurrent(path);
            setPickedFile(undefined);
          }}
          {...(files ? { onSelectFile: setPickedFile } : {})}
        />
        {pickedFile ? (
          <p className="shrink-0 truncate font-mono text-xs" title={pickedFile}>
            {pickedFile}
          </p>
        ) : null}
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onResolve()}>
            Cancel
          </Button>
          <Button
            disabled={current === undefined && pickedFile === undefined}
            onClick={() => onResolve(pickedFile ?? current)}
            data-testid="folder-browser-use"
          >
            Select
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
