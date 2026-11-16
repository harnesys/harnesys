import type { CSSProperties, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { TransformComponent, TransformWrapper, useControls } from 'react-zoom-pan-pinch';
import { markProjectFileDirty } from '@/features/open-file';
import { writeProjectFileBytes } from '@/shared/api/files';
import { cn } from '@/shared/lib/utils';
import type { ImageEdits, ImageSize } from '../model/image-edit';
import {
  editedBoxOf,
  exportEditedImage,
  IDENTITY_EDITS,
  sameEdits,
  saveMimeForPath,
} from '../model/image-edit';
import { ViewerToolbar } from './image-viewer-toolbar';

type ViewerState =
  | { status: 'loading' }
  | { status: 'ready'; size: ImageSize }
  | { status: 'failed' };

const MIN_SCALE = 0.05;
const MAX_SCALE = 16;
const FIT_GAP = 16;
const CHECKER_STORAGE_KEY = 'harnesys:image-viewer:checkerboard';

const CHECKERBOARD: CSSProperties = {
  backgroundImage: 'repeating-conic-gradient(rgba(128,128,128,0.14) 0% 25%, transparent 0% 50%)',
  backgroundSize: '24px 24px',
};

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

function fitScaleFor(size: ImageSize, rect: DOMRect | null): number {
  if (!rect || rect.width < FIT_GAP * 2 || rect.height < FIT_GAP * 2 || size.width < 1) {
    return 1;
  }
  const sx = (rect.width - FIT_GAP * 2) / size.width;
  const sy = (rect.height - FIT_GAP * 2) / size.height;
  return Math.min(Math.max(Math.min(sx, sy), MIN_SCALE), 1);
}

function ViewerBody({
  url,
  name,
  size,
  edits,
  checker,
  canSave,
  saving,
  saveError,
  areaRef,
  onEdits,
  onToggleChecker,
  onSave,
}: {
  url: string;
  name: string;
  size: ImageSize;
  edits: ImageEdits;
  checker: boolean;
  canSave: boolean;
  saving: boolean;
  saveError: string | null;
  areaRef: RefObject<HTMLDivElement | null>;
  onEdits: (next: ImageEdits) => void;
  onToggleChecker: () => void;
  onSave: () => void;
}) {
  const { centerView } = useControls();
  const box = editedBoxOf(size, edits);
  const fit = (): void => {
    centerView(fitScaleFor(box, areaRef.current?.getBoundingClientRect() ?? null));
  };
  return (
    <>
      <TransformComponent
        wrapperStyle={{ width: '100%', height: '100%', cursor: 'grab' }}
        wrapperClass="select-none active:cursor-grabbing"
      >
        <div style={{ position: 'relative', width: box.width, height: box.height }}>
          <img
            src={url}
            alt={name}
            draggable={false}
            data-testid="image-preview"
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: size.width,
              height: size.height,
              display: 'block',
              pointerEvents: 'none',
              transform: `translate(-50%, -50%) rotate(${edits.rotation}deg) scale(${edits.flipH ? -1 : 1}, ${edits.flipV ? -1 : 1})`,
            }}
          />
        </div>
      </TransformComponent>
      <ViewerToolbar
        url={url}
        name={name}
        edits={edits}
        checker={checker}
        saveSupported={canSave}
        saving={saving}
        saveError={saveError}
        onFit={fit}
        onEdits={onEdits}
        onToggleChecker={onToggleChecker}
        onSave={onSave}
      />
    </>
  );
}

export function ImageViewer({
  url,
  path,
  projectId,
  worktreeId,
}: {
  url: string;
  path: string;
  projectId?: string;
  worktreeId?: string;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ViewerState>({ status: 'loading' });
  const [checker, setChecker] = useState(readCheckerPref);
  const [edits, setEdits] = useState<ImageEdits>(IDENTITY_EDITS);
  const [savedEdits, setSavedEdits] = useState<ImageEdits>(IDENTITY_EDITS);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const canSave = Boolean(projectId) && saveMimeForPath(path) !== null;

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    setEdits(IDENTITY_EDITS);
    setSavedEdits(IDENTITY_EDITS);
    setSaveError(null);
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

  useEffect(() => {
    if (!projectId) {
      return;
    }
    markProjectFileDirty(projectId, path, !sameEdits(edits, savedEdits));
  }, [projectId, path, edits, savedEdits]);

  async function handleSave(): Promise<void> {
    if (state.status !== 'ready' || !projectId || saving) {
      return;
    }
    const mime = saveMimeForPath(path);
    if (!mime) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const bytes = await exportEditedImage(url, edits, mime);
      await writeProjectFileBytes(projectId, { path, bytes, worktreeId });
      setSavedEdits(edits);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save image');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!canSave) {
      return;
    }
    function onKey(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void handleSave();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  });

  const rect = areaRef.current?.getBoundingClientRect() ?? null;
  const initialScale =
    state.status === 'ready' ? fitScaleFor(editedBoxOf(state.size, edits), rect) : 1;
  const fileName = path.slice(path.lastIndexOf('/') + 1);

  function toggleChecker(): void {
    setChecker((previous) => {
      const next = !previous;
      writeCheckerPref(next);
      return next;
    });
  }

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
            name={fileName}
            size={state.size}
            edits={edits}
            checker={checker}
            canSave={canSave}
            saving={saving}
            saveError={saveError}
            areaRef={areaRef}
            onEdits={setEdits}
            onToggleChecker={toggleChecker}
            onSave={handleSave}
          />
        </TransformWrapper>
      ) : null}
    </div>
  );
}
