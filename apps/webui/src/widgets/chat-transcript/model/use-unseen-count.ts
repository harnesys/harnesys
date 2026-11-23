import type { SessionEvent } from '@harnesys/studio-shared';
import { useEffect, useRef, useState } from 'react';

function maxThreadSeq(events: readonly SessionEvent[]): number {
  let max = 0;
  for (const event of events) {
    const seq = event.threadSeq;
    if (seq !== undefined && seq > max) {
      max = seq;
    }
  }
  return max;
}

export function useUnseenCount(events: readonly SessionEvent[], atEnd: boolean): number {
  const baseRef = useRef(maxThreadSeq(events));
  const [unseen, setUnseen] = useState(0);
  useEffect(() => {
    const max = maxThreadSeq(events);
    if (atEnd) {
      baseRef.current = max;
      setUnseen(0);
      return;
    }
    const base = baseRef.current;
    let count = 0;
    for (const event of events) {
      if (event.threadSeq !== undefined && event.threadSeq > base) {
        count += 1;
      }
    }
    setUnseen(count);
  }, [atEnd, events]);
  return unseen;
}
