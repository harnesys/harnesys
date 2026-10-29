import { issueCode, issueTaskAttrs, visibleIssueText } from '@harnesys/studio-shared';
import { ExternalLinkIcon, SquareKanbanIcon } from 'lucide-react';
import { useIssueDrawerStore } from '@/features/manage-issues/model/issue-drawer.store';
import { FeedNotice } from './feed-notice';

export function IssueWakeBanner({ text }: { text: string }) {
  const attrs = issueTaskAttrs(text);
  const body = visibleIssueText(text);
  const openIssue = useIssueDrawerStore((state) => state.openIssue);
  return (
    <FeedNotice
      tone="live"
      icon={SquareKanbanIcon}
      label="Issue"
      meta={
        <>
          {attrs?.issueId ? (
            <button
              type="button"
              className="inline-flex min-w-0 items-center gap-1 truncate font-mono text-foreground/80 transition-colors hover:text-foreground"
              title="Open issue"
              onClick={() => attrs.issueId && openIssue(attrs.issueId)}
            >
              {issueCode(attrs.issueId)}
              <ExternalLinkIcon className="size-3 shrink-0" />
            </button>
          ) : null}
          {attrs?.status ? (
            <span className="font-mono text-muted-foreground/80 uppercase">{attrs.status}</span>
          ) : null}
          {attrs?.reason ? (
            <span className="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground uppercase">
              {attrs.reason}
            </span>
          ) : null}
        </>
      }
      className="max-w-[min(100%,36rem)] self-end"
    >
      {body ? <p className="whitespace-pre-wrap text-sm">{body}</p> : null}
    </FeedNotice>
  );
}
