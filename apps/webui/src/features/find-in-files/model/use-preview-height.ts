import { type MouseEvent as ReactMouseEvent, useRef, useState } from 'react';

const DEFAULT_PREVIEW_HEIGHT = 208;
const MIN_PREVIEW_HEIGHT = 80;
const MIN_RESULTS_HEIGHT = 120;

export function usePreviewHeight() {
  const [height, setHeight] = useState(DEFAULT_PREVIEW_HEIGHT);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onResizeStart = (event: ReactMouseEvent) => {
    event.preventDefault();
    const container = containerRef.current;
    if (!container) {
      return;
    }
    setDragging(true);
    const box = container.getBoundingClientRect();
    const onMove = (move: MouseEvent) => {
      const raw = box.bottom - move.clientY;
      const max = Math.max(MIN_PREVIEW_HEIGHT, box.height - MIN_RESULTS_HEIGHT);
      setHeight(Math.min(max, Math.max(MIN_PREVIEW_HEIGHT, raw)));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  return { height, dragging, containerRef, onResizeStart };
}
