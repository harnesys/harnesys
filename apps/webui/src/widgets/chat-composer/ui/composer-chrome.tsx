import { LoaderCircleIcon } from 'lucide-react';
import type { ClipboardEvent } from 'react';
import { Button } from '@/shared/ui/button';
import { Kbd } from '@/shared/ui/kbd';
import { filesFromClipboard } from '../model/composer-send';
import { fileFromPastedText } from '../model/paste-as-file';

export function ComposerStreamHint({ label }: { label: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 px-1 font-mono text-[11px] text-muted-foreground">
      <LoaderCircleIcon className="size-3 animate-spin text-live" />
      <span>{label}</span>
    </div>
  );
}

export function WorktreeBindingBanner({
  branch,
  onUnbind,
}: {
  branch: string;
  onUnbind: () => void;
}) {
  return (
    <div
      className="mb-1.5 flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs"
      data-testid="composer-worktree-binding"
    >
      <span className="truncate font-mono">worktree {branch}</span>
      <Button type="button" size="sm" variant="ghost" className="h-6 px-2" onClick={onUnbind}>
        Unbind
      </Button>
    </div>
  );
}

export function ComposerShortcutsHint() {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 px-1 font-mono text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd>
        <span>newline</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <Kbd>/</Kbd>
        <span>commands</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <Kbd>#</Kbd>
        <span>attachments</span>
      </span>
    </div>
  );
}

export function consumeComposerPaste(
  event: ClipboardEvent,
  pendingNames: string[],
  addFiles: (files: File[]) => void,
): void {
  const files = filesFromClipboard(event.clipboardData);
  const pasted = fileFromPastedText(event.clipboardData.getData('text/plain'), pendingNames);
  if (files.length === 0 && !pasted) {
    return;
  }
  event.preventDefault();
  addFiles(pasted ? [...files, pasted] : files);
}

export function composerPasteIsHandled(data: DataTransfer, pendingNames: string[]): boolean {
  return (
    filesFromClipboard(data).length > 0 ||
    Boolean(fileFromPastedText(data.getData('text/plain'), pendingNames))
  );
}

export function streamStatusLabel(state: string | null): string | null {
  switch (state) {
    case 'connecting':
      return 'Connecting…';
    case 'queued':
      return 'Queued…';
    case 'live':
      return 'Agent is working…';
    case 'paused':
      return 'Waiting for input…';
    case 'reconnecting':
      return 'Reconnecting…';
    case 'offline':
      return 'Connection lost';
    default:
      return 'Agent is thinking…';
  }
}
