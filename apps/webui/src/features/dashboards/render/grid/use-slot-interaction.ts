import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  clampRect,
  type GridEntry,
  type GridRect,
  positiveRect,
  resolveCollisions,
  snap,
} from './grid-math';

export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export type GridGesture = 'move' | ResizeDirection;

export interface GridSession {
  id: string;
  gesture: GridGesture;
  origin: GridRect;
  base: GridEntry[];
  grabX: number;
  grabY: number;
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  moved: boolean;
  layout: GridEntry[];
}

export interface SlotCommit {
  id: string;
  rect: GridRect;
}

export type BeginInteraction = (
  event: ReactPointerEvent<HTMLElement>,
  entry: GridEntry,
  gesture: GridGesture,
) => void;

interface InteractionOptions {
  canvasRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  entries: GridEntry[];
  width: number;
  /** Canvas width divided by the authored width: pointer deltas scale back by it. */
  scale: number;
  editable: boolean;
  dragHandleSelector?: string;
  onCommit?: (next: SlotCommit[]) => void;
}

interface InteractionResult {
  session: GridSession | null;
  begin: BeginInteraction;
}

const DRAG_THRESHOLD = 3;
const AUTOSCROLL_EDGE = 48;
const AUTOSCROLL_SPEED = 16;
const INTERACTIVE = 'button, a, input, select, textarea, [data-grid-nodrag]';

interface RectTarget {
  px: number;
  py: number;
  width: number;
}

function desiredRect(
  session: GridSession,
  target: RectTarget,
  limits: { minW: number; minH: number },
): GridRect {
  const { px, py, width } = target;
  const { minW, minH } = limits;
  const { origin } = session;
  if (session.gesture === 'move') {
    return positiveRect({
      x: snap(px - session.grabX),
      y: snap(py - session.grabY),
      w: origin.w,
      h: origin.h,
    });
  }

  let { x, y, w, h } = origin;
  const direction = session.gesture;
  const right = snap(px);
  const bottom = snap(py);
  if (direction.includes('e')) {
    w = Math.max(right - x, minW);
  }
  if (direction.includes('s')) {
    h = Math.max(bottom - y, minH);
  }
  if (direction.includes('w')) {
    const edge = origin.x + origin.w;
    x = Math.min(Math.max(snap(px), 0), edge - minW);
    w = edge - x;
  }
  if (direction.includes('n')) {
    const edge = origin.y + origin.h;
    y = Math.min(Math.max(snap(py), 0), edge - minH);
    h = edge - y;
  }
  const boundedW = x + w > width ? width - x : w;
  return {
    x,
    y,
    w: Math.max(boundedW, minW),
    h,
  };
}

export function useSlotInteraction(options: InteractionOptions): InteractionResult {
  const { canvasRef, scrollRef } = options;
  const [session, setSession] = useState<GridSession | null>(null);
  const sessionRef = useRef<GridSession | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  function computeLayout(current: GridSession, clientX: number, clientY: number): GridEntry[] {
    const canvas = canvasRef.current;
    if (!canvas) {
      return current.layout;
    }
    const latest = optionsRef.current;
    const rect = canvas.getBoundingClientRect();
    const entry = current.base.find((candidate) => candidate.id === current.id);
    const minW = entry?.minW ?? 8;
    const minH = entry?.minH ?? 8;
    const scale = latest.scale > 0 ? latest.scale : 1;
    const layoutWidth = latest.width / scale;
    const desired = desiredRect(
      current,
      {
        px: (clientX - rect.left) / scale,
        py: clientY - rect.top,
        width: layoutWidth,
      },
      { minW, minH },
    );
    const bounded = clampRect(desired, minW, minH, layoutWidth);
    return resolveCollisions(current.base, current.id, bounded, minH);
  }

  const computeRef = useRef(computeLayout);
  computeRef.current = computeLayout;

  const begin: BeginInteraction = (event, entry, gesture) => {
    if (!options.editable || event.button !== 0) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (gesture === 'move' && target.closest('[data-grid-resize]')) {
      return;
    }
    if (target.closest(INTERACTIVE)) {
      return;
    }
    if (
      gesture === 'move' &&
      options.dragHandleSelector &&
      !target.closest(options.dragHandleSelector)
    ) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const scale = options.scale > 0 ? options.scale : 1;
    event.preventDefault();
    event.stopPropagation();
    const next: GridSession = {
      id: entry.id,
      gesture,
      origin: entry.rect,
      base: options.entries,
      grabX: (event.clientX - rect.left) / scale - entry.rect.x,
      grabY: event.clientY - rect.top - entry.rect.y,
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      moved: false,
      layout: options.entries,
    };
    sessionRef.current = next;
    setSession(next);
  };

  const active = session !== null;

  useEffect(() => {
    if (!active) {
      return;
    }
    const handleMove = (event: PointerEvent): void => {
      const current = sessionRef.current;
      if (!current) {
        return;
      }
      event.preventDefault();
      const moved =
        current.moved ||
        Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > DRAG_THRESHOLD;
      const next: GridSession = {
        ...current,
        clientX: event.clientX,
        clientY: event.clientY,
        moved,
        layout: computeRef.current(current, event.clientX, event.clientY),
      };
      sessionRef.current = next;
      setSession(next);
    };
    const finish = (event: PointerEvent): void => {
      const current = sessionRef.current;
      sessionRef.current = null;
      setSession(null);
      if (!current) {
        return;
      }
      const layout = computeRef.current(current, event.clientX, event.clientY);
      if (current.moved) {
        optionsRef.current.onCommit?.(layout.map((entry) => ({ id: entry.id, rect: entry.rect })));
      }
    };
    const cancel = (): void => {
      sessionRef.current = null;
      setSession(null);
    };
    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [active]);

  useEffect(() => {
    if (!active) {
      return;
    }
    let frame = 0;
    const tick = (): void => {
      frame = requestAnimationFrame(tick);
      const current = sessionRef.current;
      const scroller = scrollRef.current;
      if (!current || !scroller) {
        return;
      }
      const rect = scroller.getBoundingClientRect();
      const top = current.clientY - rect.top;
      const bottom = rect.bottom - current.clientY;
      let delta = 0;
      if (top < AUTOSCROLL_EDGE) {
        delta = -Math.ceil(AUTOSCROLL_SPEED * (1 - Math.max(top, 0) / AUTOSCROLL_EDGE));
      } else if (bottom < AUTOSCROLL_EDGE) {
        delta = Math.ceil(AUTOSCROLL_SPEED * (1 - Math.max(bottom, 0) / AUTOSCROLL_EDGE));
      }
      if (delta === 0) {
        return;
      }
      const before = scroller.scrollTop;
      scroller.scrollTop = before + delta;
      if (scroller.scrollTop === before) {
        return;
      }
      const next: GridSession = {
        ...current,
        layout: computeRef.current(current, current.clientX, current.clientY),
      };
      sessionRef.current = next;
      setSession(next);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, scrollRef]);

  return { session, begin };
}
