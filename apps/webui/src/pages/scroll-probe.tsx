import { useEffect, useState } from 'react';
import { LiveRunScrollGuard } from '@/shared/ui/live-run-scroll-guard';
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/shared/ui/message-scroller';

function line(text: string): string {
  return `line — the quick brown fox jumps over the lazy dog near the river bank (${text})`;
}

export function ScrollProbePage() {
  const [rows, setRows] = useState(30);
  const [revealed, setRevealed] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [lines, setLines] = useState(0);

  useEffect(() => {
    if (!streaming) {
      return;
    }
    if (lines >= 240) {
      setStreaming(false);
      return;
    }
    const timer = window.setTimeout(() => setLines((value) => value + 1), 80);
    return () => window.clearTimeout(timer);
  }, [streaming, lines]);

  return (
    <div className="flex h-screen flex-col">
      <MessageScrollerProvider
        autoScroll={true}
        defaultScrollPosition="end"
        scrollPreviousItemPeek={48}
        scrollEdgeThreshold={24}
      >
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-8">
              {Array.from({ length: rows }, (_, row) => (
                <MessageScrollerItem key={row} messageId={`row-${row}`}>
                  <div>
                    <p className="font-semibold">history turn {row}</p>
                    <p>{line(`r${row}`)}</p>
                    <p>{line(`r${row}`)}</p>
                  </div>
                </MessageScrollerItem>
              ))}
              {revealed ? (
                <MessageScrollerItem messageId="run-reveal" scrollAnchor={true}>
                  <div>
                    <p className="font-bold text-sky-400">USER MESSAGE (revealed turn)</p>
                    {Array.from({ length: lines }, (_, index) => (
                      <p key={index}>{line(`a${index}`)}</p>
                    ))}
                  </div>
                  <LiveRunScrollGuard active={streaming} />
                </MessageScrollerItem>
              ) : null}
            </MessageScrollerContent>
          </MessageScrollerViewport>
        </MessageScroller>
      </MessageScrollerProvider>
      <div className="flex shrink-0 gap-2 border-neutral-800 border-t p-3">
        <button type="button" className="rounded border p-2" onClick={() => setRows(rows + 1)}>
          add row
        </button>
        <button
          type="button"
          className="rounded border p-2"
          onClick={() => {
            setRevealed(true);
            setLines(0);
            setStreaming(true);
          }}
        >
          reveal + stream
        </button>
        <button
          type="button"
          className="rounded border p-2"
          onClick={() => {
            setRevealed(false);
            setStreaming(false);
          }}
        >
          reset
        </button>
      </div>
    </div>
  );
}
