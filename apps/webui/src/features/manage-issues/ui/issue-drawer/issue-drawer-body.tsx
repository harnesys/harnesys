import type { GetIssueResponse } from '@harnesys/contracts';
import type { BoardStatus, IssueRecord } from '@harnesys/studio-shared';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Agent } from '@/entities/agent';
import { useAgentStore } from '@/entities/agent';
import { useIssueBoardStore, useIssueStore } from '@/entities/issue';
import { Separator } from '@/shared/ui/separator';
import { confirmDeleteIssue } from '../../model/issue-dialogs';
import type { IssueFormDraft } from '../../model/issue-draft';
import { draftDiff } from '../../model/issue-draft';
import type { IssueDrawerTarget } from '../../model/issue-drawer.store';
import { deleteIssue, moveIssueStatus, updateIssuePatch } from '../../model/issues';
import type { IssueDetailState } from '../../model/use-issue-detail';
import { IssueAttachments } from './issue-attachments';
import { IssueComments } from './issue-comments';
import { IssueDependencies } from './issue-dependencies';
import { IssueDescriptionEditor } from './issue-description-editor';
import { DrawerFooter } from './issue-drawer-footer';
import { DrawerHeader } from './issue-drawer-header';
import { IssueMetadataPanel } from './issue-metadata-panel';
import { IssueSubtasks } from './issue-subtasks';
import { IssueVcsPanel } from './issue-vcs-panel';

export interface DrawerBodyProps {
  orgId: string;
  target: IssueDrawerTarget;
  issue: IssueRecord | null;
  detail: IssueDetailState;
  draft: IssueFormDraft;
  setDraft: (draft: IssueFormDraft) => void;
  boardId: string;
  setCreateBoardId: (boardId: string) => void;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
  onOpenIssue: (issueId: string) => void;
}

export function DrawerBody({
  orgId,
  target,
  issue,
  detail,
  draft,
  setDraft,
  boardId,
  setCreateBoardId,
  saving,
  onSave,
  onClose,
  onOpenIssue,
}: DrawerBodyProps) {
  const [copied, setCopied] = useState(false);
  const parent = useIssueStore((state) => {
    const parentId = issue?.parentIssueId;
    return parentId ? state.byId(parentId) : undefined;
  });
  const agents = useAgentStore(
    useShallow((state) => state.items.filter((agent) => agent.orgId === orgId)),
  );
  const boards = useIssueBoardStore((state) => state.boards);
  const archived = useIssueBoardStore((state) =>
    state.boards.some((item) => item.id === boardId && item.status === 'archived'),
  );
  const statuses: BoardStatus[] =
    useIssueBoardStore((state) => state.boardById(issue?.boardId ?? boardId)?.statuses) ?? [];
  const dirty = issue ? Object.keys(draftDiff(issue, draft)).length > 0 : false;

  const onStatusChange = (statusKey: string): void => {
    if (!issue || archived || statusKey === issue.statusKey) {
      setDraft({ ...draft, statusKey });
      return;
    }
    void moveIssueStatus(orgId, issue.id, statusKey).then((ok) => {
      if (ok) {
        setDraft({ ...draft, statusKey });
      }
    });
  };

  const onAssigneeChange = (agentId: string | null): void => {
    if (!issue) {
      setDraft({ ...draft, assigneeAgentId: agentId ?? '' });
      return;
    }
    if (archived) {
      return;
    }
    void updateIssuePatch(orgId, issue.id, { assigneeAgentId: agentId });
  };

  const onBoardChange = (nextBoardId: string): void => {
    if (!issue) {
      setCreateBoardId(nextBoardId);
      return;
    }
    if (archived || nextBoardId === issue.boardId) {
      return;
    }
    void updateIssuePatch(orgId, issue.id, { boardId: nextBoardId });
  };

  return (
    <>
      <DrawerHeader
        draft={draft}
        isCreateMode={target.mode === 'create'}
        issue={issue}
        parent={parent ?? null}
        copied={copied}
        onTitleChange={(title) => setDraft({ ...draft, title })}
        onCopy={() => {
          if (!issue) {
            return;
          }
          void navigator.clipboard.writeText(issue.id).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          });
        }}
        onOpenParent={onOpenIssue}
        onClose={onClose}
      />
      {archived ? (
        <div className="border-b bg-muted/40 px-6 py-1.5 text-muted-foreground text-xs">
          This board is archived — the issue is read-only.
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto border-b p-6 md:border-r md:border-b-0">
          <IssueDescriptionEditor
            value={draft.description}
            readOnly={archived}
            onChange={(description) => setDraft({ ...draft, description })}
          />
          <Separator />
          {target.mode === 'edit' && detail.detail && issue ? (
            <DetailSections
              orgId={orgId}
              issue={issue}
              detail={detail.detail}
              agents={agents}
              statuses={statuses}
              onChanged={detail.reload}
            />
          ) : null}
        </div>
        <IssueMetadataPanel
          orgId={orgId}
          draft={draft}
          issue={issue}
          boardId={boardId}
          agents={agents}
          boards={boards.filter((item) => item.status === 'active')}
          statuses={statuses}
          onDraftChange={setDraft}
          onStatusChange={onStatusChange}
          onAssigneeChange={onAssigneeChange}
          onBoardChange={onBoardChange}
        />
      </div>
      <DrawerFooter
        draft={draft}
        isCreateMode={target.mode === 'create'}
        issue={issue}
        statuses={statuses}
        saving={saving}
        canSave={draft.title.trim().length > 0}
        dirty={dirty}
        onSave={onSave}
        onDelete={() => {
          if (!issue) {
            return;
          }
          void confirmDeleteIssue(issue).then((confirmed) => {
            if (confirmed) {
              void deleteIssue(orgId, issue.id).then(onClose);
            }
          });
        }}
      />
    </>
  );
}

function DetailSections({
  orgId,
  issue,
  detail,
  agents,
  statuses,
  onChanged,
}: {
  orgId: string;
  issue: IssueRecord;
  detail: GetIssueResponse;
  agents: Agent[];
  statuses: BoardStatus[];
  onChanged: () => void;
}) {
  return (
    <>
      <IssueVcsPanel
        orgId={orgId}
        issue={issue}
        detail={detail}
        agents={agents}
        statuses={statuses}
        onChanged={onChanged}
      />
      <Separator />
      <IssueAttachments
        orgId={orgId}
        issueId={issue.id}
        attachments={detail.attachments}
        onChanged={onChanged}
      />
      <Separator />
      <IssueSubtasks orgId={orgId} issue={issue} subtasks={detail.subtasks} onChanged={onChanged} />
      <Separator />
      <IssueDependencies orgId={orgId} issue={issue} detail={detail} onChanged={onChanged} />
      <Separator />
      <IssueComments
        orgId={orgId}
        issueId={issue.id}
        comments={detail.comments}
        agents={agents}
        onChanged={onChanged}
      />
    </>
  );
}
