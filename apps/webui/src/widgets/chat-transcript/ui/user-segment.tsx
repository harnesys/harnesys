import type { MessageQuote } from '@harnesys/contracts';
import type { SessionEvent } from '@harnesys/studio-shared';
import {
  isIssueHumanText,
  isScheduledHumanText,
  issueTaskAttrs,
  scheduledTaskName,
  visibleScheduledText,
} from '@harnesys/studio-shared';
import { CalendarClockIcon } from 'lucide-react';
import { useState } from 'react';
import { useSessionStore } from '@/entities/session';
import { jumpHandlerOf, QuoteBlock, quoteOfEvent, replyHandlerOf } from '@/features/message-quote';
import { editUserMessage, rerunIssueTask } from '@/features/send-message';
import { useOrgId } from '@/shared/config/location';
import { cn } from '@/shared/lib/utils';
import { toast } from '@/shared/ui/toast';
import { splitDirectiveTags } from '../model/directive-tag';
import type { MessageSide } from '../model/use-user-message-side';
import { useUserMessageSide } from '../model/use-user-message-side';
import { FeedNotice } from './feed-notice';
import { IssueWakeBanner } from './issue-wake-message';
import { MessageActions } from './message-actions';
import { ModeTagBadges } from './mode-tag-badge';
import { originNoticeOf } from './origin-notice';
import { AttachmentPreview, uniqueAttachments } from './user-attachments';
import { AuthorLabel } from './user-author-label';
import { UserMessageBubble } from './user-message-bubble';
import { buildSendInput, UserMessageEditor } from './user-message-edit';
import { UserSegmentActions } from './user-segment-actions';

const ATTACHMENT_JUSTIFY: Record<MessageSide, string> = {
  start: 'justify-start',
  end: 'justify-end',
};
const ROW_ALIGN: Record<MessageSide, string> = {
  start: 'items-start',
  end: 'items-end',
};

function isAnchorSeq(anchorSeq: number | undefined, seq: number | undefined): boolean {
  return anchorSeq !== undefined && anchorSeq === seq;
}

function toggleHandlerOf(
  onToggleAnchor: ((threadSeq: number) => void) | undefined,
  seq: number | undefined,
): (() => void) | undefined {
  return onToggleAnchor && seq !== undefined ? () => onToggleAnchor(seq) : undefined;
}

export function UserSegment({
  event,
  segmentKey,
  threadId,
  runId,
  anchorSeq,
  onToggleAnchor,
  inherited = false,
  readOnly = false,
}: {
  event: SessionEvent & { type: 'user' };
  segmentKey: string;
  threadId?: string;
  runId?: string;
  anchorSeq?: number;
  onToggleAnchor?: (threadSeq: number) => void;
  inherited?: boolean;
  streaming?: boolean;
  readOnly?: boolean;
}) {
  const atts = event.attachments;
  const wake = isScheduleWakeEvent(event);
  const issueWake = !wake && isIssueWakeEvent(event);
  const rawText = event.text ?? '';
  const side = useUserMessageSide(event, threadId);
  const seq = event.threadSeq;
  const anchored = isAnchorSeq(anchorSeq, seq);
  const toggleAnchor = toggleHandlerOf(onToggleAnchor, seq);
  const { text: visibleText, badges } = splitDirectiveTags(rawText);
  const clientEventId = event.clientEventId;
  const sidecarSkills =
    !badges.some((badge) => badge.kind === 'skill') && clientEventId
      ? useSessionStore.getState().sentSkillsFor(clientEventId)
      : undefined;
  const [editing, setEditing] = useState(false);
  const originNotice = originNoticeOf(event, rawText, threadId);
  if (originNotice !== null) {
    return <>{originNotice}</>;
  }
  const sendInput = buildSendInput(atts, sidecarSkills, event.quote);
  const onReply = replyHandlerOf(threadId, quoteOfEvent(event));
  const editable = Boolean(
    !inherited &&
      !readOnly &&
      threadId &&
      !wake &&
      !issueWake &&
      (event.threadSeq !== undefined || clientEventId),
  );
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
  if (wake) {
    return <ScheduleWakeBanner text={rawText} />;
  }
  if (issueWake) {
    return (
      <IssueWakeSegment
        rawText={rawText}
        segmentKey={segmentKey}
        threadId={threadId}
        runId={runId}
        event={event}
        inherited={inherited}
        readOnly={readOnly}
      />
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
          <QuotedReply quote={event.quote} threadId={threadId} />
          {visibleText ? (
            <UserMessageBubble
              text={visibleText}
              threadId={threadId}
              side={side}
              anchored={anchored}
            />
          ) : null}
          {atts?.length ? (
            <div className={cn('flex flex-wrap gap-2', ATTACHMENT_JUSTIFY[side])}>
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
              align={side}
              rawText={rawText}
              bulletText={visibleText}
              threadId={threadId}
              runId={runId}
              anchored={anchored}
              onToggleAnchor={toggleAnchor}
              onReply={onReply}
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
  return (
    <div data-thread-seq={seq} className={cn('group/message flex flex-col gap-2', ROW_ALIGN[side])}>
      {content}
    </div>
  );
}

function QuotedReply({ quote, threadId }: { quote?: MessageQuote; threadId?: string }) {
  if (!quote) {
    return null;
  }
  return (
    <div className="max-w-[80%]">
      <QuoteBlock quote={quote} onJump={jumpHandlerOf(threadId, quote)} />
    </div>
  );
}

function IssueWakeSegment({
  rawText,
  segmentKey,
  threadId,
  runId,
  event,
  inherited,
  readOnly,
}: {
  rawText: string;
  segmentKey: string;
  threadId?: string;
  runId?: string;
  event: SessionEvent & { type: 'user' };
  inherited: boolean;
  readOnly: boolean;
}) {
  const actions =
    !inherited && !readOnly && threadId ? (
      <IssueSegmentActions
        entryId={
          event.clientEventId ??
          (runId && event.seq !== undefined ? `${runId}:${event.seq}` : segmentKey)
        }
        rawText={rawText}
        threadId={threadId}
        issueId={issueTaskAttrs(rawText)?.issueId ?? null}
      />
    ) : null;
  return (
    <div className="group/message flex flex-col items-end gap-2">
      <div className="flex justify-end">
        <IssueWakeBanner text={rawText} />
      </div>
      {actions}
    </div>
  );
}

function IssueSegmentActions({
  entryId,
  rawText,
  threadId,
  issueId,
}: {
  entryId: string;
  rawText: string;
  threadId: string;
  issueId: string | null;
}) {
  const orgId = useOrgId();
  return (
    <MessageActions
      entryId={entryId}
      align="end"
      onCopy={() => {
        void navigator.clipboard.writeText(rawText);
        toast.add({ title: 'Copied.' });
      }}
      onRetry={
        issueId && orgId
          ? () => {
              void rerunIssueTask({ orgId, threadId, issueId }).catch((error) => {
                toast.add({
                  title: 'Could not re-run',
                  description: error instanceof Error ? error.message : 'Re-run failed',
                });
              });
            }
          : undefined
      }
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
