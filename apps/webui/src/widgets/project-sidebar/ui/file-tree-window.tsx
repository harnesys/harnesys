import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import type { FlatTreeRow } from '../model/file-tree-index';

const OVERSCAN_ROWS = 12;

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let current = el?.parentElement ?? null;
  while (current) {
    const overflowY = getComputedStyle(current).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

export function FileTreeWindow({
  rows,
  rowHeight,
  renderRow,
  testId,
}: {
  rows: FlatTreeRow[];
  rowHeight: number;
  renderRow: (row: FlatTreeRow) => ReactNode;
  testId?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: 0 });
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const parent = findScrollParent(el);
    let raf = 0;
    const update = () => {
      raf = 0;
      const wrap = el.getBoundingClientRect();
      const total = rows.length * rowHeight;
      if (!parent) {
        setRange({ start: 0, end: rows.length });
        return;
      }
      const view = parent.getBoundingClientRect();
      const top = Math.max(0, view.top - wrap.top - OVERSCAN_ROWS * rowHeight);
      const bottom = Math.min(total, view.bottom - wrap.top + OVERSCAN_ROWS * rowHeight);
      const start = Math.max(0, Math.floor(top / rowHeight));
      const end = Math.min(rows.length, Math.ceil(bottom / rowHeight));
      setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    const schedule = () => {
      if (!raf) {
        raf = requestAnimationFrame(update);
      }
    };
    update();
    parent?.addEventListener('scroll', schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    if (parent) {
      observer.observe(parent);
    }
    window.addEventListener('resize', schedule);
    return () => {
      if (raf) {
        cancelAnimationFrame(raf);
      }
      parent?.removeEventListener('scroll', schedule);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [rows.length, rowHeight]);
  const start = Math.max(0, Math.min(range.start, rows.length));
  const end = Math.max(start, Math.min(range.end, rows.length));
  const slice = rows.slice(start, end);
  return (
    <div
      ref={wrapRef}
      className="relative"
      style={{ height: rows.length * rowHeight }}
      data-testid={testId}
    >
      {slice.map((row, i) => (
        <div
          key={row.kind === 'entry' ? row.fullPath : `${row.kind}:${row.fullPath}`}
          className="absolute inset-x-0 top-0"
          style={{ transform: `translateY(${(start + i) * rowHeight}px)`, height: rowHeight }}
        >
          {renderRow(row)}
        </div>
      ))}
    </div>
  );
}
