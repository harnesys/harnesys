import { useLayoutEffect, useRef } from 'react';
import { useMessageScroller, useMessageScrollerScrollable } from '@/shared/ui/message-scroller';

export function useStickToEnd(active: boolean, signal: string): void {
  const { scrollToEnd } = useMessageScroller();
  const { end } = useMessageScrollerScrollable();
  const rendered = useRef(signal);
  useLayoutEffect(() => {
    const grew = rendered.current !== signal;
    rendered.current = signal;
    if (grew && active && !end) {
      scrollToEnd({ behavior: 'auto' });
    }
  }, [active, end, signal, scrollToEnd]);
}
