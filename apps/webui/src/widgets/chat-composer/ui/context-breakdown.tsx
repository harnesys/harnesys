import type { RequestPlan } from '@harnesys/studio-shared';
import { ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { formatTokenCount } from '@/entities/session';
import { cn } from '@/shared/lib/utils';
import { type BreakdownRow, buildBreakdownRows } from '../model/context-breakdown';

const BAR_COLORS: Record<string, string> = {
  system: 'bg-chart-1',
  skills: 'bg-chart-2',
  tools: 'bg-chart-3',
  notes: 'bg-chart-4',
  history: 'bg-chart-5',
  free: 'bg-muted-foreground/30',
};

interface ContextBreakdownProps {
  plan: RequestPlan;
  window: number;
}

export function ContextBreakdown({ plan, window: contextWindow }: ContextBreakdownProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const rows = buildBreakdownRows(plan, contextWindow);
  const onToggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  return (
    <div>
      <div className="flex h-1.5 gap-px overflow-hidden rounded-full">
        {rows
          .filter((row) => row.estTokens > 0)
          .map((row) => (
            <div
              key={row.id}
              className={cn('h-full', BAR_COLORS[row.id] ?? 'bg-muted')}
              style={{ width: `${row.pct}%` }}
              title={`${row.label} ${formatTokenCount(row.estTokens)} tok`}
            />
          ))}
      </div>
      <div className="mt-1">
        {rows.map((row) => (
          <BreakdownBranch
            key={row.id}
            row={row}
            depth={0}
            color={BAR_COLORS[row.id] ?? 'bg-muted'}
            expanded={expanded}
            onToggle={onToggle}
          />
        ))}
      </div>
      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
        Estimated from chars/4; provider totals may differ
      </p>
    </div>
  );
}

interface BreakdownBranchProps {
  row: BreakdownRow;
  depth: number;
  color: string;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}

function BreakdownBranch({ row, depth, color, expanded, onToggle }: BreakdownBranchProps) {
  const hasChildren = row.children.length > 0;
  const open = expanded.has(row.id);
  return (
    <div>
      <button
        type="button"
        onClick={hasChildren ? () => onToggle(row.id) : undefined}
        className={cn(
          'flex w-full items-center gap-1.5 rounded py-0.5 pr-1 text-left text-[12px]',
          hasChildren && 'hover:bg-muted/60',
        )}
        style={{ paddingLeft: depth * 12 }}
      >
        {hasChildren ? (
          <ChevronRightIcon
            className={cn(
              'size-3 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90',
            )}
          />
        ) : (
          <span className="size-3 shrink-0" />
        )}
        <span className={cn('size-1.5 shrink-0 rounded-full', color)} />
        <span className="truncate text-muted-foreground">{row.label}</span>
        <span className="ml-auto shrink-0 font-mono">
          {formatTokenCount(row.estTokens)} tok
          <span className="ml-1.5 text-muted-foreground">({row.pct}%)</span>
        </span>
      </button>
      {open
        ? row.children.map((child) => (
            <BreakdownBranch
              key={child.id}
              row={child}
              depth={depth + 1}
              color={color}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))
        : null}
    </div>
  );
}
