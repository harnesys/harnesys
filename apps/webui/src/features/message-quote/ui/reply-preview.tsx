import type { MessageQuote } from '@harnesys/contracts';
import { ReplyIcon, XIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';

export function ReplyPreview({ quote, onClear }: { quote: MessageQuote; onClear: () => void }) {
  return (
    <div
      data-slot="reply-preview"
      className="flex items-start gap-2 rounded-md border-primary/60 border-s-2 bg-muted/40 px-2 py-1.5 text-xs"
    >
      <ReplyIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground/80">{quote.author}</div>
        <div className="line-clamp-2 whitespace-pre-wrap break-words text-muted-foreground">
          {quote.text}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground hover:bg-transparent hover:text-foreground"
        onClick={onClear}
        aria-label="Cancel reply"
      >
        <XIcon />
      </Button>
    </div>
  );
}
