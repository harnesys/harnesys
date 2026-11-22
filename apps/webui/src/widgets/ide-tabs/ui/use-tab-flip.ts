import { type RefObject, useLayoutEffect, useRef } from 'react';
import { ideDrag } from '../model/ide-dnd';

const FLIP_TRANSITION = 'transform 160ms cubic-bezier(0.2, 0, 0, 1)';

export function useTabFlip(container: RefObject<HTMLElement | null>, orderKey: string) {
  const snapshot = useRef<Map<string, number> | null>(null);
  const lastOrder = useRef(orderKey);
  useLayoutEffect(() => {
    if (lastOrder.current === orderKey) {
      return;
    }
    lastOrder.current = orderKey;
    const previous = snapshot.current;
    snapshot.current = null;
    const box = container.current;
    if (!previous || !box) {
      return;
    }
    const draggingId = ideDrag()?.tabId;
    for (const element of Array.from(box.children)) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }
      const id = element.dataset.tabId;
      const from = id ? previous.get(id) : undefined;
      if (!id || id === draggingId || from === undefined) {
        continue;
      }
      const delta = from - element.getBoundingClientRect().left;
      if (Math.abs(delta) < 1) {
        continue;
      }
      element.style.transition = 'none';
      element.style.transform = `translateX(${delta}px)`;
      void element.offsetWidth;
      element.style.transition = FLIP_TRANSITION;
      element.style.transform = '';
    }
  });
  return () => {
    const box = container.current;
    if (!box) {
      return;
    }
    const positions = new Map<string, number>();
    for (const element of Array.from(box.children)) {
      if (element instanceof HTMLElement && element.dataset.tabId) {
        positions.set(element.dataset.tabId, element.getBoundingClientRect().left);
      }
    }
    snapshot.current = positions;
  };
}
