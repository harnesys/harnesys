import {
  DownloadIcon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
  Grid2x2Icon,
  MaximizeIcon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SaveIcon,
  Undo2Icon,
} from 'lucide-react';
import { useControls, useTransformComponent } from 'react-zoom-pan-pinch';
import { cn } from '@/shared/lib/utils';
import type { ImageEdits } from '../model/image-edit';
import { editsChanged, flipEdits, rotateEdits } from '../model/image-edit';

export const TOOL_BUTTON = cn(
  'inline-flex size-7 items-center justify-center rounded-md',
  'text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
);

const TOOL_SEPARATOR = 'mx-1 h-4 w-px bg-border';

function ScaleBadge({ onClick }: { onClick: () => void }) {
  return useTransformComponent(({ state }) => (
    <button
      type="button"
      onClick={onClick}
      title="Zoom to fit"
      className="min-w-12 rounded-md px-1.5 py-1 font-mono text-[11px] text-muted-foreground tabular-nums transition-colors hover:bg-accent hover:text-foreground"
    >
      {Math.round(state.scale * 100)}%
    </button>
  ));
}

export interface ViewerToolbarProps {
  url: string;
  name: string;
  edits: ImageEdits;
  checker: boolean;
  saveSupported: boolean;
  saving: boolean;
  saveError: string | null;
  onFit: () => void;
  onEdits: (next: ImageEdits) => void;
  onToggleChecker: () => void;
  onSave: () => void;
}

export function ViewerToolbar({
  url,
  name,
  edits,
  checker,
  saveSupported,
  saving,
  saveError,
  onFit,
  onEdits,
  onToggleChecker,
  onSave,
}: ViewerToolbarProps) {
  const { zoomIn, zoomOut, centerView } = useControls();
  const changed = editsChanged(edits);
  return (
    <div className="absolute right-3 bottom-3 z-10 flex items-center gap-0.5 rounded-lg border bg-background/90 p-0.5 shadow-sm backdrop-blur-sm">
      <button type="button" title="Zoom out" onClick={() => zoomOut()} className={TOOL_BUTTON}>
        <MinusIcon className="size-3.5" />
      </button>
      <ScaleBadge onClick={onFit} />
      <button type="button" title="Zoom in" onClick={() => zoomIn()} className={TOOL_BUTTON}>
        <PlusIcon className="size-3.5" />
      </button>
      <div className={TOOL_SEPARATOR} />
      <button type="button" title="Fit to window" onClick={onFit} className={TOOL_BUTTON}>
        <MaximizeIcon className="size-3.5" />
      </button>
      <button
        type="button"
        title="Actual size"
        onClick={() => centerView(1)}
        className={TOOL_BUTTON}
      >
        <span className="font-mono text-[10px]">1:1</span>
      </button>
      <button
        type="button"
        title="Transparency checkerboard"
        aria-pressed={checker}
        onClick={onToggleChecker}
        className={cn(TOOL_BUTTON, checker && 'bg-accent text-foreground')}
      >
        <Grid2x2Icon className="size-3.5" />
      </button>
      <div className={TOOL_SEPARATOR} />
      <button
        type="button"
        title="Rotate left"
        onClick={() => onEdits(rotateEdits(edits, -1))}
        className={TOOL_BUTTON}
      >
        <RotateCcwIcon className="size-3.5" />
      </button>
      <button
        type="button"
        title="Rotate right"
        onClick={() => onEdits(rotateEdits(edits, 1))}
        className={TOOL_BUTTON}
      >
        <RotateCwIcon className="size-3.5" />
      </button>
      <button
        type="button"
        title="Flip horizontal"
        aria-pressed={edits.flipH}
        onClick={() => onEdits(flipEdits(edits, 'h'))}
        className={cn(TOOL_BUTTON, edits.flipH && 'bg-accent text-foreground')}
      >
        <FlipHorizontalIcon className="size-3.5" />
      </button>
      <button
        type="button"
        title="Flip vertical"
        aria-pressed={edits.flipV}
        onClick={() => onEdits(flipEdits(edits, 'v'))}
        className={cn(TOOL_BUTTON, edits.flipV && 'bg-accent text-foreground')}
      >
        <FlipVerticalIcon className="size-3.5" />
      </button>
      {changed ? (
        <button
          type="button"
          title="Reset edits"
          onClick={() => onEdits({ rotation: 0, flipH: false, flipV: false })}
          className={TOOL_BUTTON}
        >
          <Undo2Icon className="size-3.5" />
        </button>
      ) : null}
      {saveSupported ? (
        <button
          type="button"
          title={saveError ?? 'Save image (Cmd+S)'}
          disabled={saving}
          onClick={onSave}
          className={cn(
            TOOL_BUTTON,
            saveError !== null && 'text-destructive hover:text-destructive',
          )}
        >
          <SaveIcon className={cn('size-3.5', saving && 'animate-pulse')} />
        </button>
      ) : null}
      <a href={url} download={name} title="Download original" className={TOOL_BUTTON}>
        <DownloadIcon className="size-3.5" />
      </a>
    </div>
  );
}
