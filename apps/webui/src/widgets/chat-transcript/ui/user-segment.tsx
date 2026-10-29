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
import { useFileLinkComponents } from '@/features/ide';
import {
  deleteOptimisticUserMessage,
  deleteUserMessage,
  editUserMessage,
  reloadUserMessage,
  resolveUserEventTarget,
  sendMessage,
} from '@/features/send-message';
import { branchThread } from '@/features/switch-thread';
import { loadThreadAttachment } from '@/shared/api';
import { useAuthedBlobUrl } from '@/shared/api/blob-url';
import { studioFocusProjectId, useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { FileChip } from '@/shared/ui/file-chip';
import { Markdown } from '@/shared/ui/markdown';
import { toast } from '@/shared/ui/toast';
import { splitDirectiveTags } from '../model/directive-tag';
import { FeedNotice } from './feed-notice';
import { IssueWakeBanner } from './issue-wake-message';
import { MessageActions } from './message-actions';
import { ModeTagBadges } from './mode-tag-badge';
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
  const fileLink = useFileLinkComponents();
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
      (event.seq !== undefined || clientEventId),
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
  return (
    <div className="flex flex-col items-end gap-2">
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
          {visibleText ? (
            <div className="max-w-[80%] rounded-2xl rounded-br-md bg-secondary px-3.5 py-1.5 text-secondary-foreground shadow-xs">
              <Markdown text={visibleText} components={fileLink} />
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
              seq={event.seq}
              sendInput={sendInput}
              clientEventId={event.clientEventId}
              onEdit={editable ? () => setEditing(true) : undefined}
            />
          ) : null}
        </>
      )}
    </div>
  );

  function saveEdit(text: string): void {
    if (!threadId) {
      return;
    }
    const target = resolveUserEventTarget({
      runId,
      seq: event.seq,
      activeRunId: useSessionStore.getState().activeRuns[threadId]?.runId,
    });
    const input = target
      ? { threadId, runId: target.runId, seq: target.seq, text, ...sendInput }
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
  seq,
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
  seq?: number;
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
        const target = activeTarget();
        if (target) {
          void reloadUserMessage({
            threadId,
            runId: target.runId,
            seq: target.seq,
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
        const target = activeTarget();
        if (target) {
          void deleteUserMessage(threadId, target.runId, target.seq).catch((error) => {
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

  function activeTarget(): { runId: string; seq: number } | undefined {
    return resolveUserEventTarget({
      runId,
      seq,
      activeRunId: useSessionStore.getState().activeRuns[threadId]?.runId,
    });
  }
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
function uniqueAttachments<
  T extends {
    id: string;
    path: string;
  },
>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.path || item.id;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}
function AttachmentPreview({
  threadId,
  item,
}: {
  threadId: string;
  item: {
    id: string;
    kind: string;
    name: string;
    mediaType: string;
    path: string;
  };
}) {
  const { url } = useAuthedBlobUrl(() => loadThreadAttachment(threadId, item.id), item.id);
  if (item.kind === 'audio') {
    return (
      <audio controls src={url ?? undefined} className="h-9 max-w-64">
        <track kind="captions" />
      </audio>
    );
  }
  if (item.kind === 'video') {
    return (
      <video controls src={url ?? undefined} className="max-h-48 max-w-64 rounded-xl">
        <track kind="captions" />
      </video>
    );
  }
  return <FileChip name={item.name} mediaType={item.mediaType ?? ''} href={url ?? undefined} />;
}
