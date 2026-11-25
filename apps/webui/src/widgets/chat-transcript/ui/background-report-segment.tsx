import { WorkflowIcon } from 'lucide-react';
import { ThreadMarkdown } from '../model/thread-markdown';

const BODY_SPLIT = '\n\n';

export function BackgroundReportSegment({ text, threadId }: { text: string; threadId?: string }) {
  const splitAt = text.indexOf(BODY_SPLIT);
  const head = splitAt === -1 ? text : text.slice(0, splitAt);
  const body = splitAt === -1 ? '' : text.slice(splitAt + BODY_SPLIT.length).trim();
  return (
    <div className="flex flex-col items-start" data-testid="background-report">
      <div className="max-w-[85%] rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2.5 shadow-xs">
        <div className="flex items-start gap-2">
          <WorkflowIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 text-sm">
            <div className="text-muted-foreground text-xs">
              <ThreadMarkdown text={head} threadId={threadId} />
            </div>
            {body ? (
              <div className="mt-1.5 text-foreground">
                <ThreadMarkdown text={body} threadId={threadId} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
