import { PlusIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { FolderBrowser, type FolderBrowserHandle } from './folder-browser';

export interface FolderBrowserDialogProps {
  orgId?: string;
  hostId?: string;
  nodeLabel?: string;
  /** Directory the browser opens at. */
  initialPath?: string;
  /** Confine navigation and typed paths to this directory. */
  rootPath?: string;
  /** Let the user pick a file as well as a folder. */
  files?: boolean;
  onResolve: (path?: string) => void;
}

export function FolderBrowserDialog({
  orgId,
  hostId,
  nodeLabel,
  initialPath,
  rootPath,
  files = false,
  onResolve,
}: FolderBrowserDialogProps) {
  const [current, setCurrent] = useState<string | undefined>(initialPath);
  const [pickedFile, setPickedFile] = useState<string | undefined>(undefined);
  const browserRef = useRef<FolderBrowserHandle>(null);
  const title = files ? 'Files on' : 'Folders on';
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onResolve();
        }
      }}
    >
      <DialogContent
        layoutKey="folder-browser"
        className="flex h-[32rem] flex-col gap-4 sm:max-w-md"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {title} {nodeLabel ?? 'host'}
          </DialogTitle>
        </DialogHeader>
        <FolderBrowser
          ref={browserRef}
          orgId={orgId}
          hostId={hostId}
          className="min-h-0 flex-1"
          listClassName="min-h-0 flex-1"
          {...(initialPath !== undefined ? { initialPath } : {})}
          {...(rootPath !== undefined ? { rootPath } : {})}
          files={files}
          showCreateToggle={false}
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
        <DialogFooter className="shrink-0 sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => browserRef.current?.startCreate()}
            data-testid="folder-browser-create-toggle"
          >
            <PlusIcon data-icon="inline-start" />
            Create folder
          </Button>
          <div className="flex gap-2">
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
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
