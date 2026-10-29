import type { IssueCommentRecord } from '@harnesys/studio-shared';
import { BotIcon, SendIcon, UserRoundIcon } from 'lucide-react';
import { useState } from 'react';
import type { Agent } from '@/entities/agent';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatDateTime } from '@/shared/lib/format-clock';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';
import { addIssueCommentAction } from '../../model/issue-detail-actions';

export function IssueComments({
  orgId,
  issueId,
  comments,
  agents,
  onChanged,
}: {
  orgId: string;
  issueId: string;
  comments: IssueCommentRecord[];
  agents: Agent[];
  onChanged: () => void;
}) {
  const timeZone = useOrgTimeZone();
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);

  const send = async (): Promise<void> => {
    const body = draft.trim();
    if (!body) {
      return;
    }
    setPending(true);
    const ok = await addIssueCommentAction(orgId, issueId, body);
    setPending(false);
    if (ok) {
      setDraft('');
      onChanged();
    }
  };

  return (
    <div className="space-y-3">
      <h4 className="flex items-center gap-1.5 font-semibold text-foreground text-sm">
        <BotIcon className="size-4 text-muted-foreground" />
        Comments
      </h4>
      <div className="max-h-[300px] space-y-3 overflow-y-auto pr-1">
        {comments.length === 0 ? (
          <p className="py-2 text-muted-foreground text-xs italic">
            No comments yet. Start the conversation!
          </p>
        ) : (
          comments.map((comment) => {
            const agent = comment.authorAgentId
              ? (agents.find((item) => item.id === comment.authorAgentId) ?? null)
              : null;
            const isAgent = comment.authorType === 'agent';
            return (
              <div key={comment.id} className="flex items-start gap-2.5 border-b pb-2.5 text-xs">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
                  {isAgent ? <BotIcon className="size-3" /> : <UserRoundIcon className="size-3" />}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'flex items-center gap-1 font-semibold',
                        isAgent && 'text-primary',
                      )}
                    >
                      {agent?.name ?? (isAgent ? 'Agent' : 'You')}
                      {isAgent ? (
                        <span className="rounded border border-primary/20 bg-primary/5 px-1 text-[9px]">
                          AI
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDateTime(comment.createdAt, timeZone)}
                    </span>
                  </div>
                  <p className="break-words text-muted-foreground leading-relaxed">
                    {comment.body}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form
        className="flex gap-2 pt-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Input
          placeholder="Write a comment..."
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="flex-1"
        />
        <Button type="submit" size="icon" disabled={!draft.trim() || pending}>
          {pending ? <Spinner className="size-4" /> : <SendIcon className="size-4" />}
        </Button>
      </form>
    </div>
  );
}
