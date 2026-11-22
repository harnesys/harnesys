import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { useRef, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DIALOG_LAYOUT_STORAGE_KEY } from '@/shared/config/constants';
import { cn } from '@/shared/lib/utils';
import type { ResizeDirection } from './resize-handles';

export interface DialogRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const MIN_WIDTH = 300;
const MIN_HEIGHT = 180;
const VIEWPORT_MARGIN = 8;

interface DialogLayoutStore {
  layouts: Record<string, DialogRect>;
  save: (key: string, rect: DialogRect) => void;
}

const useDialogLayoutStore = create<DialogLayoutStore>()(
  persist(
    (set) => ({
      layouts: {},
      save: (key, rect) => set((state) => ({ layouts: { ...state.layouts, [key]: rect } })),
    }),
    { name: DIALOG_LAYOUT_STORAGE_KEY },
  ),
);

interface DragStart {
  x: number;
  y: number;
  left: number;
  top: number;
}

interface ResizeStart {
  direction: ResizeDirection;
  x: number;
  y: number;
  rect: DialogRect;
}

export interface DialogLayoutControls {
  ref: RefObject<HTMLDivElement | null>;
  style: CSSProperties | undefined;
  className: string;
  dragging: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
  onResizeStart: (event: ReactPointerEvent<HTMLElement>, direction: ResizeDirection) => void;
  onResizeMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onResizeEnd: (event: ReactPointerEvent<HTMLElement>) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function clampToViewport(rect: DialogRect): DialogRect {
  const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
  const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - VIEWPORT_MARGIN * 2);
  const width = clamp(rect.width, MIN_WIDTH, maxWidth);
  const height = clamp(rect.height, MIN_HEIGHT, maxHeight);
  const left = clamp(rect.left, VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
  const top = clamp(rect.top, VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);
  return { left, top, width, height };
}

export function useDialogLayout(layoutKey?: string): DialogLayoutControls {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragStart | null>(null);
  const resizeRef = useRef<ResizeStart | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rect, setRect] = useState<DialogRect | null>(() => {
    if (!layoutKey) {
      return null;
    }
    const stored = useDialogLayoutStore.getState().layouts[layoutKey];
    return stored ? clampToViewport(stored) : null;
  });

  function measure(): DialogRect | null {
    const box = ref.current?.getBoundingClientRect();
    if (!box) {
      return null;
    }
    return { left: box.left, top: box.top, width: box.width, height: box.height };
  }

  function persist(next: DialogRect) {
    if (layoutKey) {
      useDialogLayoutStore.getState().save(layoutKey, next);
    }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement;
    if (!target.closest('[data-slot="dialog-header"]')) {
      return;
    }
    if (target.closest('button, a, input, select, textarea, [data-no-drag]')) {
      return;
    }
    const current = rect ?? measure();
    if (!current) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, left: current.left, top: current.top };
    setRect(current);
    setDragging(true);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    const width = rect?.width ?? ref.current?.offsetWidth ?? 0;
    const height = rect?.height ?? ref.current?.offsetHeight ?? 0;
    setRect({
      left: clamp(
        drag.left + (event.clientX - drag.x),
        VIEWPORT_MARGIN,
        window.innerWidth - width - VIEWPORT_MARGIN,
      ),
      top: clamp(
        drag.top + (event.clientY - drag.y),
        VIEWPORT_MARGIN,
        window.innerHeight - height - VIEWPORT_MARGIN,
      ),
      width,
      height,
    });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) {
      return;
    }
    dragRef.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
    const final = measure() ?? rect;
    if (final) {
      persist(final);
    }
  }

  function onPointerCancel() {
    dragRef.current = null;
    resizeRef.current = null;
    setDragging(false);
  }

  function onResizeStart(event: ReactPointerEvent<HTMLElement>, direction: ResizeDirection) {
    const current = rect ?? measure();
    if (!current) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = { direction, x: event.clientX, y: event.clientY, rect: current };
    setRect(current);
    setDragging(true);
  }

  function onResizeMove(event: ReactPointerEvent<HTMLElement>) {
    const start = resizeRef.current;
    if (!start) {
      return;
    }
    const { direction, rect: base } = start;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const right = base.left + base.width;
    const bottom = base.top + base.height;
    let { left, top, width, height } = base;
    if (direction.includes('e')) {
      width = clamp(base.width + dx, MIN_WIDTH, window.innerWidth - base.left - VIEWPORT_MARGIN);
    }
    if (direction.includes('s')) {
      height = clamp(base.height + dy, MIN_HEIGHT, window.innerHeight - base.top - VIEWPORT_MARGIN);
    }
    if (direction.includes('w')) {
      left = clamp(base.left + dx, VIEWPORT_MARGIN, right - MIN_WIDTH);
      width = right - left;
    }
    if (direction.includes('n')) {
      top = clamp(base.top + dy, VIEWPORT_MARGIN, bottom - MIN_HEIGHT);
      height = bottom - top;
    }
    setRect({ left, top, width, height });
  }

  function onResizeEnd(event: ReactPointerEvent<HTMLElement>) {
    if (!resizeRef.current) {
      return;
    }
    resizeRef.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
    const final = measure() ?? rect;
    if (final) {
      persist(final);
    }
  }

  const style: CSSProperties | undefined = rect
    ? {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
        maxHeight: `calc(100vh - ${VIEWPORT_MARGIN * 2}px)`,
      }
    : undefined;

  return {
    ref,
    style,
    className: cn(
      !rect && 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
      dragging && 'select-none',
    ),
    dragging,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onResizeStart,
    onResizeMove,
    onResizeEnd,
  };
}
