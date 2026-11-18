import type { ReactNode } from 'react';

export interface FindRange {
  start: number;
  end: number;
}

export function FindMatchText({ text, ranges }: { text: string; ranges: FindRange[] }) {
  if (ranges.length === 0) {
    return <>{text}</>;
  }
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const range of [...ranges].sort((left, right) => left.start - right.start)) {
    if (range.start < cursor || range.start >= text.length) {
      continue;
    }
    const end = Math.min(range.end, text.length);
    if (end <= range.start) {
      continue;
    }
    if (range.start > cursor) {
      parts.push(text.slice(cursor, range.start));
    }
    parts.push(
      <mark
        key={`match-${range.start}`}
        className="rounded-[2px] bg-live/20 text-foreground"
        data-testid="find-match-highlight"
      >
        {text.slice(range.start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return <>{parts}</>;
}
