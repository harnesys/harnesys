import { AlertCircleIcon, ChevronDownIcon, Layers2Icon, UndoIcon } from 'lucide-react';
import { useState } from 'react';
import type { CompactionSegmentMeta, CompactionStatus } from '@/entities/session';
import { undoCompact, useCompactingStore } from '@/features/compact-thread';
import { Markdown } from '@/shared/ui/markdown';
import { toast } from '@/shared/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { FeedNotice, FeedNoticeMetaSep } from './feed-notice';

const STATUS_LABEL: Record<CompactionStatus, string> = {
  running: 'Compacting…',
  completed: 'Compaction',
  failed: 'Compaction failed',
  cancelled: 'Compaction cancelled',
  interrupted: 'Compaction interrupted',
};

function CancelCompactButton({ onCancel }: { onCancel: () => void }) {
  return (
    <button
      type="button"
      data-testid="compaction-cancel"
      onClick={onCancel}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      Cancel
    </button>
  );
}

export function CompactionPendingCard({ onCancel }: { onCancel?: () => void }) {
  return (
    <FeedNotice
      testId="compaction-pending"
      tone="accent"
      icon={Layers2Icon}
      label="Compacting…"
      pending
      actions={onCancel ? <CancelCompactButton onCancel={onCancel} /> : undefined}
    />
  );
}

function CompactionStatusCard({
  status,
  meta,
  threadId,
}: {
  status: Exclude<CompactionStatus, 'completed'>;
  meta: CompactionSegmentMeta;
  threadId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const locallyCompacting = useCompactingStore((state) =>
    threadId ? Boolean(state.byThread[threadId]) : false,
  );
  const failed = status === 'failed';
  const running = status === 'running';
  let tone: 'danger' | 'accent' | 'neutral' = 'neutral';
  if (failed) {
    tone = 'danger';
  } else if (running) {
    tone = 'accent';
  }
  const messageMeta = meta.message ? (
    <>
      <FeedNoticeMetaSep />
      <button
        type="button"
        data-testid={`compaction-message-toggle-${status}`}
        title={expanded ? 'Hide details' : 'Show details'}
        onClick={() => {
          setExpanded((value) => !value);
        }}
        className="inline-flex min-w-0 cursor-pointer items-center gap-1 rounded px-1 transition-colors hover:text-foreground"
      >
        <span className="min-w-0 truncate">{expanded ? 'Hide details' : meta.message}</span>
        <ChevronDownIcon
          className={`size-3 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
    </>
  ) : undefined;
  const reasonMeta = (
    <>
      <FeedNoticeMetaSep />
      <span>{meta.reason === 'manual' ? 'Manual' : 'Auto'}</span>
    </>
  );
  return (
    <FeedNotice
      testId={`compaction-${status}`}
      tone={tone}
      icon={failed ? AlertCircleIcon : Layers2Icon}
      label={STATUS_LABEL[status]}
      pending={running}
      meta={running ? reasonMeta : messageMeta}
      actions={
        running && locallyCompacting && threadId ? (
          <CancelCompactButton onCancel={() => useCompactingStore.getState().abort(threadId)} />
        ) : undefined
      }
    >
      {expanded && meta.message ? <div className="min-w-0 break-all">{meta.message}</div> : null}
    </FeedNotice>
  );
}

export function formatTokenCount(value: number): string {
  if (value >= 1000) {
    const kilo = value / 1000;
    return `${kilo >= 10 ? kilo.toFixed(0) : kilo.toFixed(1)}k`;
  }
  return String(value);
}

function UndoCompactButton({ threadId }: { threadId: string }) {
  const [undoing, setUndoing] = useState(false);
  const label = undoing ? 'Restoring…' : 'Restore history';
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            data-testid="compaction-undo"
            aria-label={label}
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
            className="inline-flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          />
        }
      >
        <UndoIcon className="size-3" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
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
  const status = meta.status ?? 'completed';
  if (status !== 'completed') {
    return <CompactionStatusCard status={status} meta={meta} threadId={threadId} />;
  }
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
      actions={undoable && threadId ? <UndoCompactButton threadId={threadId} /> : undefined}
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
