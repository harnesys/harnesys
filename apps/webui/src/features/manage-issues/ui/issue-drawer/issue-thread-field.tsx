import type { IssueRecord } from '@harnesys/studio-shared';
import { PlusIcon, SquareKanbanIcon, UnlinkIcon } from 'lucide-react';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { createThreadRecord, updateThreadIssue } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { toast } from '@/shared/ui/toast';
import { useOpenIssueThread } from '../../model/use-open-issue-thread';

export function IssueThreadField({
  issue,
  assigneeAgentId,
  readOnly,
  onOpened,
}: {
  issue: IssueRecord;
  assigneeAgentId: string;
  readOnly: boolean;
  onOpened: () => void;
}) {
  const threads = useThreadStore(
    useShallow((state) => state.items.filter((thread) => thread.issueId === issue.id)),
  );
  const openIssueThread = useOpenIssueThread();
  const [creating, setCreating] = useState(false);
  const thread = threads.find((item) => item.agentId === assigneeAgentId) ?? threads[0] ?? null;
  const create = (): void => {
    setCreating(true);
    void createThreadRecord({
      agentId: assigneeAgentId,
      kind: 'issue',
      issueId: issue.id,
      title: `Issue: ${issue.title}`.slice(0, 80),
    })
      .then((record) => {
        useThreadStore.getState().upsert(toClientThread(record));
        useSessionStore.getState().replaceEvents(record.id, record.events);
      })
      .catch((error: unknown) => {
        toast.add({
          title: 'Thread creation failed',
          description: error instanceof Error ? error.message : 'Could not create the thread',
          type: 'error',
        });
      })
      .finally(() => setCreating(false));
  };
  const unlink = (): void => {
    if (!thread) {
      return;
    }
    void updateThreadIssue(thread.id, null)
      .then((summary) => {
        useThreadStore.getState().upsert(toClientThread(summary));
      })
      .catch((error: unknown) => {
        toast.add({
          title: 'Unlink failed',
          description: error instanceof Error ? error.message : 'Could not unlink the thread',
          type: 'error',
        });
      });
  };
  if (!thread && (!assigneeAgentId || readOnly)) {
    return null;
  }
  return (
    <div className="space-y-1.5">
      <Label className="font-medium text-muted-foreground text-xs">Agent Thread</Label>
      {thread ? (
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="xs"
            className="min-w-0 flex-1 justify-start gap-1.5 font-normal text-xs"
            title="Open working thread"
            data-testid={`issue-thread-open-${issue.id}`}
            onClick={() => {
              openIssueThread(thread.id, thread.agentId);
              onOpened();
            }}
          >
            <SquareKanbanIcon className="size-3.5 shrink-0 text-status-warn/90" />
            <span className="truncate">Open thread</span>
          </Button>
          {!readOnly ? (
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              title="Unlink thread from issue"
              aria-label="Unlink thread from issue"
              data-testid={`issue-thread-unlink-${issue.id}`}
              onClick={unlink}
            >
              <UnlinkIcon className="size-3.5" />
            </Button>
          ) : null}
        </div>
      ) : (
        <Button
          variant="ghost"
          size="xs"
          className="w-full justify-start gap-1.5 font-normal text-xs"
          disabled={creating}
          data-testid={`issue-thread-create-${issue.id}`}
          onClick={create}
        >
          <PlusIcon className="size-3.5 shrink-0" />
          {creating ? 'Creating…' : 'Create thread'}
        </Button>
      )}
    </div>
  );
}
