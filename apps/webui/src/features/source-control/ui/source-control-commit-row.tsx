import type { GitCommitSummary } from '@harnesys/studio-shared';
import { GitMergeIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { authorInitials, isHeadRef, refLabel, relativeTime } from '../model/source-control';
import type { GraphRow } from '../model/source-control-graph';
import { CommitGraph } from './source-control-graph';

export function CommitRow({
  commit,
  graphRow,
  lanes,
  active,
  onSelect,
}: {
  commit: GitCommitSummary;
  graphRow: GraphRow | undefined;
  lanes: number;
  active: boolean;
  onSelect: () => void;
}) {
  const head = commit.refs.some(isHeadRef);
  const refs = commit.refs.filter((ref) => !isHeadRef(ref));
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex h-14 w-full items-center gap-2 rounded-md px-2 text-left transition-colors',
        active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-muted/60',
      )}
    >
      {graphRow ? <CommitGraph row={graphRow} lanes={lanes} /> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs">{commit.subject}</span>
          {commit.parents.length > 1 ? (
            <span
              className="flex shrink-0 items-center gap-0.5 rounded bg-muted px-1 py-0.5 font-mono text-[9px] text-muted-foreground uppercase"
              title={`Merge parents: ${commit.parents.map((sha) => sha.slice(0, 7)).join(', ')}`}
            >
              <GitMergeIcon className="size-2.5" />
              merge
            </span>
          ) : null}
          {head ? (
            <span className="shrink-0 rounded bg-status-info/15 px-1 py-0.5 font-mono text-[9px] text-status-info uppercase">
              HEAD
            </span>
          ) : null}
          {refs.slice(0, 2).map((ref) => (
            <span
              key={ref}
              className="max-w-24 shrink-0 truncate rounded bg-muted px-1 py-0.5 font-mono text-[9px] text-muted-foreground"
            >
              {refLabel(ref)}
            </span>
          ))}
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-[8px]">
            {authorInitials(commit.author.name)}
          </span>
          <span className="max-w-24 truncate">{commit.author.name}</span>
          <span className="font-mono">{commit.shortSha}</span>
          <span>{relativeTime(commit.date)}</span>
        </span>
      </span>
    </button>
  );
}
