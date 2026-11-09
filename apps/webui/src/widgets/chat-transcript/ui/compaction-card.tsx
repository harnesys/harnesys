import { ChevronDownIcon, Layers2Icon, UndoIcon } from 'lucide-react';
import { useState } from 'react';
import type { CompactionSegmentMeta } from '@/entities/session';
import { undoCompact } from '@/features/compact-thread';
import { Markdown } from '@/shared/ui/markdown';
import { toast } from '@/shared/ui/toast';
import { FeedNotice, FeedNoticeMetaSep } from './feed-notice';
export function CompactionPendingCard({ onCancel }: { onCancel?: () => void }) {
  return (
    <FeedNotice
      testId="compaction-pending"
      tone="accent"
      icon={Layers2Icon}
      label="Compacting…"
      pending
      actions={
        onCancel ? (
          <button
            type="button"
            data-testid="compaction-cancel"
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
        ) : undefined
      }
    />
  );
}
export function formatTokenCount(value: number): string {
  if (value >= 1000) {
    const kilo = value / 1000;
    return `${kilo >= 10 ? kilo.toFixed(0) : kilo.toFixed(1)}k`;
  }
  return String(value);
}
export function CompactionMessageCard({
  text,
  meta,
  threadId,
  undoable = false,
}: {
  text: string;
  meta: CompactionSegmentMeta;
  threadId?: string;
  undoable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const summary = meta.summary?.trim() ?? '';
  const showSummary = summary !== '' && expanded;
  const fallbackText = summary === '' && text.trim() !== '' ? text : '';
  const bodyText = showSummary ? summary : fallbackText;
  const reasonLabel = meta.reason === 'manual' ? 'Manual' : 'Auto';
  return (
    <FeedNotice
      testId="compaction-message"
      tone="accent"
      icon={Layers2Icon}
      label="Compaction"
      actions={
        undoable && threadId ? (
          <button
            type="button"
            data-testid="compaction-undo"
            disabled={undoing}
            onClick={async () => {
              setUndoing(true);
              await undoCompact({
                threadId,
                onError: (error) => {
                  toast.add({
                    title: 'Could not restore history',
                    description: error instanceof Error ? error.message : 'Undo compaction failed',
                  });
                },
              });
              setUndoing(false);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <UndoIcon className="size-3" />
            {undoing ? 'Restoring…' : 'Restore history'}
          </button>
        ) : undefined
      }
      meta={
        <>
          <FeedNoticeMetaSep />
          <span>{reasonLabel}</span>
          <FeedNoticeMetaSep />
          <span className="font-mono tabular-nums">
            {formatTokenCount(meta.tokensBefore)} → {formatTokenCount(meta.tokensAfter)}
          </span>
          {summary ? (
            <>
              <FeedNoticeMetaSep />
              <button
                type="button"
                data-testid="compaction-summary-toggle"
                onClick={() => {
                  setExpanded((value) => !value);
                }}
                className="inline-flex items-center gap-0.5 rounded px-1 transition-colors hover:text-foreground"
              >
                {expanded ? 'Hide summary' : 'Show summary'}
                <ChevronDownIcon
                  className={`size-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
              </button>
            </>
          ) : null}
        </>
      }
    >
      {bodyText.trim() ? <Markdown text={bodyText} className="px-0" /> : null}
    </FeedNotice>
  );
}
