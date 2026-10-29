import { ChevronDownIcon, Layers2Icon } from 'lucide-react';
import { useState } from 'react';
import type { CompactionSegmentMeta } from '@/entities/session';
import { Markdown } from '@/shared/ui/markdown';
import { FeedNotice, FeedNoticeMetaSep } from './feed-notice';
export function CompactionPendingCard() {
  return (
    <FeedNotice
      testId="compaction-pending"
      tone="accent"
      icon={Layers2Icon}
      label="Compacting…"
      pending
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
}: {
  text: string;
  meta: CompactionSegmentMeta;
}) {
  const [expanded, setExpanded] = useState(false);
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
