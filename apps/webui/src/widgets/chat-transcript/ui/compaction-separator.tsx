import { Layers2Icon } from 'lucide-react';
import { type CompactionCoverage, formatTokenCount } from '@/entities/session';
import { MessageScrollerItem } from '@/shared/ui/message-scroller';
export function CompactionSeparator({
  tokensBefore,
  tokensAfter,
}: {
  tokensBefore: number;
  tokensAfter: number;
}) {
  return (
    <div
      data-testid="compaction-separator"
      className="flex items-center gap-2 text-[11px] text-muted-foreground leading-none"
    >
      <span className="h-px flex-1 bg-border" />
      <Layers2Icon className="size-3.5 shrink-0" />
      <span>Summarized context</span>
      <span className="font-mono tabular-nums">
        {formatTokenCount(tokensBefore)} → {formatTokenCount(tokensAfter)}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
export function CompactionDividerItem({ coverage }: { coverage: CompactionCoverage }) {
  if (coverage.tokensBefore === null || coverage.tokensAfter === null) {
    return null;
  }
  return (
    <MessageScrollerItem messageId="compaction-separator">
      <CompactionSeparator
        tokensBefore={coverage.tokensBefore}
        tokensAfter={coverage.tokensAfter}
      />
    </MessageScrollerItem>
  );
}
