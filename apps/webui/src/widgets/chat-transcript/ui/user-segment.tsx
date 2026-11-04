import type { SessionEvent } from '@harnesys/studio-shared';
import {
  isIssueHumanText,
  isScheduledHumanText,
  scheduledTaskName,
  visibleScheduledText,
} from '@harnesys/studio-shared';
import { CalendarClockIcon } from 'lucide-react';
import { useState } from 'react';
import { saveAgentBullet } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { useDeskStore, useSelectedAgent, useSelectedThread } from '@/features/desk';
import {
  deleteOptimisticUserMessage,
  deleteUserMessage,
  editUserMessage,
  reloadUserMessage,
  sendMessage,
} from '@/features/send-message';
import { branchThread } from '@/features/switch-thread';
import { studioFocusProjectId, useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { toast } from '@/shared/ui/toast';
import { splitDirectiveTags } from '../model/directive-tag';
import { ThreadMarkdown } from '../model/thread-markdown';
import { FeedNotice } from './feed-notice';
import { IssueWakeBanner } from './issue-wake-message';
import { MessageActions } from './message-actions';
import { ModeTagBadges } from './mode-tag-badge';
import { AttachmentPreview, uniqueAttachments } from './user-attachments';
import { AuthorLabel } from './user-author-label';
import { buildSendInput, type SendInput, UserMessageEditor } from './user-message-edit';

export function UserSegment({
  event,
  segmentKey,
  threadId,
  runId,
  inherited = false,
  readOnly = false,
}: {
  event: SessionEvent & { type: 'user' };
  segmentKey: string;
  threadId?: string;
  runId?: string;
  inherited?: boolean;
  streaming?: boolean;
  readOnly?: boolean;
}) {
  const atts = event.attachments;
  const wake = isScheduleWakeEvent(event);
  const issueWake = !wake && isIssueWakeEvent(event);
  const rawText = event.text ?? '';
  const { text: visibleText, badges } = splitDirectiveTags(rawText);
  const clientEventId = event.clientEventId;
  const sidecarSkills =
    !badges.some((badge) => badge.kind === 'skill') && clientEventId
      ? useSessionStore.getState().sentSkillsFor(clientEventId)
      : undefined;
  const [editing, setEditing] = useState(false);
  const sendInput = buildSendInput(atts, sidecarSkills);
  const editable = Boolean(
    !inherited &&
      !readOnly &&
      threadId &&
      !wake &&
      !issueWake &&
      (event.threadSeq !== undefined || clientEventId),
  );
  if (wake) {
    return <ScheduleWakeBanner text={rawText} />;
  }
  if (issueWake) {
    return (
      <div className="flex justify-end">
        <IssueWakeBanner text={rawText} />
      </div>
    );
  }
  const content = (
    <>
      <ModeTagBadges badges={badges} sidecarSkills={sidecarSkills} />
      {editing ? (
        <UserMessageEditor
          initialText={visibleText}
          onCancel={() => setEditing(false)}
          onSave={(text) => {
            setEditing(false);
            saveEdit(text);
          }}
        />
      ) : (
        <>
          <AuthorLabel event={event} threadId={threadId} />
          {visibleText ? (
            <div className="max-w-[80%] rounded-2xl rounded-br-md bg-secondary px-3.5 py-1.5 text-secondary-foreground shadow-xs">
              <ThreadMarkdown text={visibleText} threadId={threadId} />
            </div>
          ) : null}
          {atts?.length ? (
            <div className="flex max-w-[80%] flex-wrap justify-end gap-2">
              {uniqueAttachments(atts).map((item) => (
                <AttachmentPreview key={item.id} threadId={threadId ?? ''} item={item} />
              ))}
            </div>
          ) : null}
          {!inherited && !readOnly && threadId ? (
            <UserSegmentActions
              entryId={
                event.clientEventId ??
                (runId && event.seq !== undefined ? `${runId}:${event.seq}` : segmentKey)
              }
              align="end"
              rawText={rawText}
              bulletText={visibleText}
              threadId={threadId}
              runId={runId}
              threadSeq={event.threadSeq}
              sendInput={sendInput}
              clientEventId={event.clientEventId}
              onEdit={editable ? () => setEditing(true) : undefined}
            />
          ) : null}
        </>
      )}
    </>
  );
  return <div className="flex flex-col items-end gap-2">{content}</div>;

  function saveEdit(text: string): void {
    if (!threadId) {
      return;
    }
    const threadSeq = event.threadSeq;
    const input =
      threadSeq !== undefined
        ? { threadId, threadSeq, text, ...sendInput }
        : { threadId, text, clientEventId, ...sendInput };
    void editUserMessage(input).catch((error: unknown) => {
      toast.add({
        title: 'Could not edit',
        description: error instanceof Error ? error.message : 'Edit failed',
      });
    });
  }
}

function UserSegmentActions({
  entryId,
  align,
  rawText,
  bulletText,
  threadId,
  runId,
  threadSeq,
  sendInput,
  clientEventId,
  onEdit,
}: {
  entryId: string;
  align: 'start' | 'end';
  rawText: string;
  bulletText: string;
  threadId: string;
  runId?: string;
  threadSeq?: number;
  sendInput: SendInput;
  clientEventId?: string;
  onEdit?: () => void;
}) {
  const agent = useSelectedAgent();
  const thread = useSelectedThread();
  const projectId = studioFocusProjectId(useStudioLocation().focus);
  const { openThread } = useStudioNavigation();
  return (
    <MessageActions
      entryId={entryId}
      align={align}
      onEdit={onEdit}
      onCopy={() => {
        void navigator.clipboard.writeText(rawText);
        toast.add({ title: 'Copied.' });
      }}
      onSaveAsBullet={
        agent && bulletText.trim().length > 0
          ? () => {
              saveAgentBullet(agent, bulletText);
              toast.add({ title: 'Saved as bullet.' });
            }
          : undefined
      }
      onRetry={() => {
        if (threadSeq !== undefined) {
          void reloadUserMessage({
            threadId,
            threadSeq,
            text: rawText,
            ...sendInput,
          }).catch((error) => {
            toast.add({
              title: 'Could not reload',
              description: error instanceof Error ? error.message : 'Reload failed',
            });
          });
          return;
        }
        if (clientEventId) {
          deleteOptimisticUserMessage(threadId, clientEventId);
          void sendMessage({ threadId, content: rawText, ...sendInput });
        }
      }}
      onBranch={
        !runId
          ? undefined
          : () => {
              if (!agent || !thread || !projectId) {
                return;
              }
              void branchThread(runId, agent.id, thread.id, projectId).then((nextId) => {
                if (nextId) {
                  useDeskStore.getState().setFocusedThreadId(nextId);
                  openThread(projectId, nextId);
                }
              });
            }
      }
      onDelete={() => {
        if (threadSeq !== undefined) {
          void deleteUserMessage(threadId, threadSeq).catch((error) => {
            toast.add({
              title: 'Could not delete',
              description: error instanceof Error ? error.message : 'Delete failed',
            });
          });
          return;
        }
        if (clientEventId) {
          deleteOptimisticUserMessage(threadId, clientEventId);
        }
      }}
    />
  );
}

function isScheduleWakeEvent(
  event: SessionEvent & {
    type: 'user';
  },
): boolean {
  return (
    event.origin === 'schedule' || (event.text !== undefined && isScheduledHumanText(event.text))
  );
}
function isIssueWakeEvent(
  event: SessionEvent & {
    type: 'user';
  },
): boolean {
  return event.origin === 'issue' || (event.text !== undefined && isIssueHumanText(event.text));
}
function ScheduleWakeBanner({ text }: { text: string }) {
  const title = scheduledTaskName(text) ?? 'Schedule';
  const body = visibleScheduledText(text);
  return (
    <FeedNotice
      tone="live"
      icon={CalendarClockIcon}
      label="Schedule"
      meta={<span className="truncate">{title}</span>}
      className="max-w-[min(100%,36rem)] self-end"
    >
      {body ? <p className="whitespace-pre-wrap text-sm">{body}</p> : null}
    </FeedNotice>
  );
}
