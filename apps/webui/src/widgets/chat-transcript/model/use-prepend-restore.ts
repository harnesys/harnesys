import { type MouseEvent, useLayoutEffect, useRef } from 'react';

interface PrependAnchor {
  el: HTMLElement;
  top: number;
  size: number;
}

export function usePrependRestore(windowSize: number) {
  const anchorRef = useRef<PrependAnchor | null>(null);
  useLayoutEffect(() => {
    const pending = anchorRef.current;
    anchorRef.current = null;
    if (!pending?.el.isConnected || pending.size !== windowSize) {
      return;
    }
    const viewport = pending.el.closest('[data-slot="message-scroller-viewport"]');
    if (!(viewport instanceof HTMLElement)) {
      return;
    }
    const delta = pending.el.getBoundingClientRect().top - pending.top;
    if (delta !== 0) {
      viewport.scrollTop += delta;
    }
  }, [windowSize]);
  return (event: MouseEvent<HTMLButtonElement>, nextSize: number) => {
    const anchor = event.currentTarget.closest(
      '[data-slot="message-scroller-item"]',
    )?.nextElementSibling;
    if (anchor instanceof HTMLElement) {
      anchorRef.current = { el: anchor, top: anchor.getBoundingClientRect().top, size: nextSize };
    }
  };
}
