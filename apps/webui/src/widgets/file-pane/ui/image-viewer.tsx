import { DownloadIcon, Grid2x2Icon, MaximizeIcon, MinusIcon, PlusIcon } from 'lucide-react';
import type { CSSProperties, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  TransformComponent,
  TransformWrapper,
  useControls,
  useTransformComponent,
} from 'react-zoom-pan-pinch';
import { cn } from '@/shared/lib/utils';

interface NaturalSize {
  width: number;
  height: number;
}

type ViewerState =
  | { status: 'loading' }
  | { status: 'ready'; size: NaturalSize }
  | { status: 'failed' };

const MIN_SCALE = 0.05;
const MAX_SCALE = 16;
const FIT_GAP = 16;
const CHECKER_STORAGE_KEY = 'harnesys:image-viewer:checkerboard';

function readCheckerPref(): boolean {
  try {
    return localStorage.getItem(CHECKER_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function writeCheckerPref(enabled: boolean): void {
  try {
    localStorage.setItem(CHECKER_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // preference is best-effort
  }
}

const CHECKERBOARD: CSSProperties = {
  backgroundImage: 'repeating-conic-gradient(rgba(128,128,128,0.14) 0% 25%, transparent 0% 50%)',
  backgroundSize: '24px 24px',
};

const TOOL_BUTTON = cn(
  'inline-flex size-7 items-center justify-center rounded-md',
  'text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
);

function fitScaleFor(size: NaturalSize, rect: DOMRect | null): number {
  if (!rect || rect.width < FIT_GAP * 2 || rect.height < FIT_GAP * 2 || size.width < 1) {
    return 1;
  }
  const sx = (rect.width - FIT_GAP * 2) / size.width;
  const sy = (rect.height - FIT_GAP * 2) / size.height;
  return Math.min(Math.max(Math.min(sx, sy), MIN_SCALE), 1);
}

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

function ViewerToolbar({
  url,
  name,
  size,
  areaRef,
  checker,
  onToggleChecker,
}: {
  url: string;
  name: string;
  size: NaturalSize;
  areaRef: RefObject<HTMLDivElement | null>;
  checker: boolean;
  onToggleChecker: () => void;
}) {
  const { zoomIn, zoomOut, centerView } = useControls();
  const fit = (): void => {
    centerView(fitScaleFor(size, areaRef.current?.getBoundingClientRect() ?? null));
  };
  return (
    <div className="absolute right-3 bottom-3 z-10 flex items-center gap-0.5 rounded-lg border bg-background/90 p-0.5 shadow-sm backdrop-blur-sm">
      <button type="button" title="Zoom out" onClick={() => zoomOut()} className={TOOL_BUTTON}>
        <MinusIcon className="size-3.5" />
      </button>
      <ScaleBadge onClick={fit} />
      <button type="button" title="Zoom in" onClick={() => zoomIn()} className={TOOL_BUTTON}>
        <PlusIcon className="size-3.5" />
      </button>
      <div className="mx-1 h-4 w-px bg-border" />
      <button type="button" title="Fit to window" onClick={fit} className={TOOL_BUTTON}>
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
      <div className="mx-1 h-4 w-px bg-border" />
      <a href={url} download={name} title="Download image" className={TOOL_BUTTON}>
        <DownloadIcon className="size-3.5" />
      </a>
    </div>
  );
}

function ViewerBody({
  url,
  name,
  size,
  areaRef,
  checker,
  onToggleChecker,
}: {
  url: string;
  name: string;
  size: NaturalSize;
  areaRef: RefObject<HTMLDivElement | null>;
  checker: boolean;
  onToggleChecker: () => void;
}) {
  return (
    <>
      <TransformComponent
        wrapperStyle={{ width: '100%', height: '100%', cursor: 'grab' }}
        wrapperClass="select-none active:cursor-grabbing"
      >
        <img
          src={url}
          alt={name}
          draggable={false}
          data-testid="image-preview"
          style={{
            width: size.width,
            height: size.height,
            display: 'block',
            pointerEvents: 'none',
          }}
        />
      </TransformComponent>
      <ViewerToolbar
        url={url}
        name={name}
        size={size}
        areaRef={areaRef}
        checker={checker}
        onToggleChecker={onToggleChecker}
      />
    </>
  );
}

export function ImageViewer({ url, name }: { url: string; name: string }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ViewerState>({ status: 'loading' });
  const [checker, setChecker] = useState(readCheckerPref);

  function toggleChecker(): void {
    setChecker((previous) => {
      const next = !previous;
      writeCheckerPref(next);
      return next;
    });
  }

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    const image = new Image();
    image.onload = (): void => {
      if (!alive) {
        return;
      }
      setState({
        status: 'ready',
        size: { width: image.naturalWidth, height: image.naturalHeight },
      });
    };
    image.onerror = (): void => {
      if (alive) {
        setState({ status: 'failed' });
      }
    };
    image.src = url;
    return () => {
      alive = false;
    };
  }, [url]);

  const rect = areaRef.current?.getBoundingClientRect() ?? null;
  const initialScale = state.status === 'ready' ? fitScaleFor(state.size, rect) : 1;

  return (
    <div
      ref={areaRef}
      className={cn('relative h-full w-full overflow-hidden', !checker && 'bg-background')}
      style={checker ? CHECKERBOARD : undefined}
      data-testid="image-viewer"
    >
      {state.status === 'loading' ? (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
          Loading...
        </div>
      ) : null}
      {state.status === 'failed' ? (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
          Could not render image.
        </div>
      ) : null}
      {state.status === 'ready' ? (
        <TransformWrapper
          key={url}
          initialScale={initialScale}
          centerOnInit
          minScale={MIN_SCALE}
          maxScale={MAX_SCALE}
          wheel={{ step: 0.08 }}
          doubleClick={{ mode: 'toggle', step: 0.5 }}
        >
          <ViewerBody
            url={url}
            name={name}
            size={state.size}
            areaRef={areaRef}
            checker={checker}
            onToggleChecker={toggleChecker}
          />
        </TransformWrapper>
      ) : null}
    </div>
  );
}
