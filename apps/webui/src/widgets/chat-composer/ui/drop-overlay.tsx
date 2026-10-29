import { LinkIcon, PaperclipIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/shared/ui/button';
import type { ComposerDropPrompt } from '../model/drop-prompt';
import { promptLinksReady } from '../model/drop-prompt';

export interface ComposerDropOverlayProps {
  prompt: ComposerDropPrompt;
  onLink(): void;
  onAttach(): void;
  onCancel(): void;
}

export function ComposerDropOverlay({
  prompt,
  onLink,
  onAttach,
  onCancel,
}: ComposerDropOverlayProps) {
  const canLink = promptLinksReady(prompt);
  const canAttach = prompt.files.length > 0 || prompt.entries.length > 0;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-background/80 backdrop-blur-sm"
      data-testid="composer-drop-overlay"
    >
      <div className="flex items-center gap-3 rounded-xl border border-border bg-popover px-3 py-2 text-popover-foreground shadow-md">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-sm">{dropLabel(prompt)}</span>
          {!canLink ? (
            <span className="text-muted-foreground text-xs">Path unavailable</span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" size="sm" variant="secondary" disabled={!canLink} onClick={onLink}>
            <LinkIcon className="size-3" />
            Link
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!canAttach}
            onClick={onAttach}
          >
            <PaperclipIcon className="size-3" />
            Attach
          </Button>
        </div>
      </div>
    </div>
  );
}

function dropLabel(prompt: ComposerDropPrompt): string {
  const total = prompt.targets.length;
  const dirs = prompt.directoryCount;
  const files = total - dirs;
  const parts: string[] = [];
  if (files > 0) {
    parts.push(`${files} file${files === 1 ? '' : 's'}`);
  }
  if (dirs > 0) {
    parts.push(`${dirs} folder${dirs === 1 ? '' : 's'}`);
  }
  const subject = parts.length > 0 ? parts.join(', ') : `${total} item${total === 1 ? '' : 's'}`;
  return `Drop ${subject}`;
}
