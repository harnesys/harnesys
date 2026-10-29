import { BrainIcon } from 'lucide-react';
import { estimateTokens, formatDuration, formatTokenCount, useLiveTail } from '@/entities/session';
import { useChatPreferences } from '@/shared/lib/chat-preferences';
import { ExpandableScroll } from '@/shared/ui/expandable-scroll';
import { isAutoOpen } from '../model/feed-detail-open';
import { ActivityLine } from './activity-line';
export function ThinkingLine({
  text,
  live,
  durationMs,
  threadId,
}: {
  text: string;
  live: boolean;
  durationMs?: number;
  threadId?: string;
}) {
  const feedDetail = useChatPreferences((state) => state.feedDetail);
  const tail = useLiveTail(live ? threadId : undefined);
  const display = live && tail.kind === 'reasoning' && tail.text ? tail.text : text;
  const livePreview = live && tail.kind === 'reasoning' ? reasoningTailPreview(tail.text) : null;
  const tokensLabel =
    !live && display.trim() ? `~${formatTokenCount(estimateTokens(display))} tok` : null;
  const durationLabel =
    !live && durationMs !== undefined && durationMs > 0 ? formatDuration(durationMs) : null;
  const hint = [tokensLabel, durationLabel].filter(Boolean).join(' · ') || null;
  return (
    <ActivityLine
      icon={BrainIcon}
      label="Thought"
      hint={hint}
      active={live}
      defaultOpen={isAutoOpen(feedDetail, live)}
      hasContent={Boolean(display)}
      collapsedTail={
        livePreview ? (
          <span className="min-w-0 flex-1 truncate text-right font-mono text-[11px] text-muted-foreground/70">
            {livePreview}
          </span>
        ) : null
      }
    >
      <ExpandableScroll
        follow={live}
        previewClassName="max-h-28"
        fullClassName="max-h-[min(70vh,24rem)]"
      >
        <div className="whitespace-pre-wrap text-[13px] text-muted-foreground/90 leading-5">
          {display}
        </div>
      </ExpandableScroll>
    </ActivityLine>
  );
}
const LIVE_PREVIEW_CHARS = 120;
function reasoningTailPreview(text: string): string {
  const lastLineStart = text.lastIndexOf('\n') + 1;
  const lastLine = text.slice(lastLineStart).trimStart();
  if (lastLine.length <= LIVE_PREVIEW_CHARS) {
    return lastLine;
  }
  return lastLine.slice(-LIVE_PREVIEW_CHARS);
}
