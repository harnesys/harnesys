import type { MessageQuote } from '@harnesys/contracts';
import { cn } from '@/shared/lib/utils';

const QUOTE_BLOCK_CLASS =
  'mb-1 flex w-full flex-col gap-0.5 rounded-md border-s-2 border-primary/50 bg-muted/40 px-2 py-1 text-start text-xs text-muted-foreground';

export function QuoteBlock({ quote, onJump }: { quote: MessageQuote; onJump?: () => void }) {
  const body = (
    <>
      <span className="truncate font-medium text-foreground/80">{quote.author}</span>
      <span className="line-clamp-3 whitespace-pre-wrap break-words">{quote.text}</span>
    </>
  );
  if (!onJump) {
    return (
      <div data-slot="quote-block" className={QUOTE_BLOCK_CLASS}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      data-slot="quote-block"
      onClick={onJump}
      aria-label="Jump to quoted message"
      title="Jump to quoted message"
      className={cn(QUOTE_BLOCK_CLASS, 'transition-colors hover:bg-muted/70')}
    >
      {body}
    </button>
  );
}
