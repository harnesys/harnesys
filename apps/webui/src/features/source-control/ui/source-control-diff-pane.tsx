import { Trash2Icon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { badgeColor, type FileEntry, statusLabel } from '../model/source-control';
import { SourceControlDiffView } from './source-control-diff-view';

interface SourceControlDiffPaneProps {
  projectId: string;
  entry: FileEntry | null;
  staged: boolean;
  onStage: (paths: string[]) => void;
  onUnstage: (paths: string[]) => void;
  onDiscard: (entries: FileEntry[]) => void;
}

export function SourceControlDiffPane({
  projectId,
  entry,
  staged,
  onStage,
  onUnstage,
  onDiscard,
}: SourceControlDiffPaneProps) {
  const [sideBySide, setSideBySide] = useState(true);
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      {entry ? (
        <div className="flex h-8 shrink-0 items-center gap-2 border-b px-3">
          <span className="min-w-0 truncate font-mono text-xs" title={entry.path}>
            {entry.path}
          </span>
          <span
            className={cn(
              'shrink-0 rounded px-1 py-0.5 font-mono text-[9px] uppercase',
              badgeColor(entry.status),
            )}
          >
            {statusLabel(entry.status)}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {staged ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onUnstage([entry.path])}
              >
                Unstage file
              </Button>
            ) : (
              <Button type="button" variant="ghost" size="xs" onClick={() => onStage([entry.path])}>
                Stage file
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-destructive hover:text-destructive"
              onClick={() => onDiscard([entry])}
            >
              <Trash2Icon />
              Discard…
            </Button>
            <div className="ml-1 flex overflow-hidden rounded-md border">
              <ToggleButton active={sideBySide} onClick={() => setSideBySide(true)}>
                Split
              </ToggleButton>
              <ToggleButton active={!sideBySide} onClick={() => setSideBySide(false)}>
                Unified
              </ToggleButton>
            </div>
          </div>
        </div>
      ) : null}
      <SourceControlDiffView
        projectId={projectId}
        path={entry?.path ?? null}
        sideBySide={sideBySide}
      />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-6 px-2 text-[10px] transition-colors',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60',
      )}
    >
      {children}
    </button>
  );
}
