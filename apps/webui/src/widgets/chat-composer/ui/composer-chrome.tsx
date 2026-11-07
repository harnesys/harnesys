import { LoaderCircleIcon } from 'lucide-react';
import type { ClipboardEvent } from 'react';
import type { PendingHitl } from '@/features/send-message/model/pending-hitl';
import type { RunPhase } from '@/features/send-message/model/run-phase';
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

interface ComposerPlaceholderArgs {
  hitl: PendingHitl | null;
  streaming: boolean;
  parked: boolean;
  agentName: string | null;
  isGroup: boolean;
}

export function composerPlaceholder({
  hitl,
  streaming,
  parked,
  agentName,
  isGroup,
}: ComposerPlaceholderArgs): string {
  if (hitl) {
    return hitl.source === 'ask_user'
      ? 'Answer the prompt above…'
      : 'Allow or deny the tool above…';
  }
  if (parked) {
    return 'Waiting for your answer…';
  }
  if (streaming) {
    return 'Agent is running — your message will be queued…';
  }
  if (isGroup) {
    return 'Message the group or @mention a member…';
  }
  return agentName ? `Message ${agentName}…` : 'Select an agent to start a thread';
}

export function streamStatusLabel(phase: RunPhase): string | null {
  switch (phase) {
    case 'live':
      return 'Agent is working…';
    case 'queued':
      return 'Queued…';
    default:
      return null;
  }
}
