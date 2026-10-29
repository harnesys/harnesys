import type { GitStatusCounts } from '@harnesys/studio-shared';
export function formatCountsShort(counts: GitStatusCounts): string {
  const parts: string[] = [];
  if (counts.untracked) {
    parts.push(`U${counts.untracked}`);
  }
  if (counts.added) {
    parts.push(`A${counts.added}`);
  }
  if (counts.staged) {
    parts.push(`S${counts.staged}`);
  }
  if (counts.modified) {
    parts.push(`M${counts.modified}`);
  }
  if (counts.deleted) {
    parts.push(`D${counts.deleted}`);
  }
  if (counts.renamed) {
    parts.push(`R${counts.renamed}`);
  }
  if (counts.conflicted) {
    parts.push(`C${counts.conflicted}`);
  }
  return parts.join(' ');
}
export function GitCounts({ counts }: { counts: GitStatusCounts }) {
  const items: React.ReactNode[] = [];
  if (counts.untracked) {
    items.push(
      <span key="u" className="text-red-600 dark:text-red-500">
        U{counts.untracked}
      </span>,
    );
  }
  if (counts.added) {
    items.push(
      <span key="a" className="text-status-ok">
        A{counts.added}
      </span>,
    );
  }
  if (counts.staged) {
    items.push(
      <span key="s" className="text-status-ok">
        S{counts.staged}
      </span>,
    );
  }
  if (counts.modified) {
    items.push(
      <span key="m" className="text-status-info">
        M{counts.modified}
      </span>,
    );
  }
  if (counts.deleted) {
    items.push(
      <span key="d" className="text-muted-foreground">
        D{counts.deleted}
      </span>,
    );
  }
  if (counts.renamed) {
    items.push(
      <span key="r" className="text-status-info">
        R{counts.renamed}
      </span>,
    );
  }
  if (counts.conflicted) {
    items.push(
      <span key="c" className="text-destructive">
        C{counts.conflicted}
      </span>,
    );
  }
  if (items.length === 0) {
    return null;
  }
  return <span className="ml-auto flex items-center gap-1 text-[10px] leading-none">{items}</span>;
}
