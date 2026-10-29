import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react';
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from '@/shared/config/constants';
export function useSidebarWidth() {
  const [width, setWidth] = useState(readStoredWidth);
  const [dragging, setDragging] = useState(false);
  const anchorX = useRef(0);
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(width));
    } catch {}
  }, [width]);
  const onResizeStart = (event: ReactMouseEvent) => {
    event.preventDefault();
    setDragging(true);
    anchorX.current = event.clientX;
    const onMove = (move: MouseEvent) => {
      setWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, move.clientX)));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  return { width, dragging, onResizeStart };
}
function readStoredWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (!raw) {
      return SIDEBAR_DEFAULT_WIDTH;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return SIDEBAR_DEFAULT_WIDTH;
    }
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value));
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}
