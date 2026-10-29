import { AlertCircleIcon, RotateCcwIcon, TerminalIcon, Trash2Icon } from 'lucide-react';
import { type FeedRun, type FeedSegment, useLiveTail } from '@/entities/session';
import { useDeskStore, useSelectedAgent, useSelectedThread } from '@/features/desk';
import { useFileLinkComponents } from '@/features/ide';
import { branchThread } from '@/features/switch-thread';
import { studioFocusProjectId, useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { Markdown } from '@/shared/ui/markdown';
import { toast } from '@/shared/ui/toast';
import { useStreamText } from '../model/stream-text';
import { ActivityItems } from './activity-items';
import { ActivityRail } from './activity-rail';
import { BranchPointBadge } from './branch-point-badge';
import { CompactionMessageCard } from './compaction-card';
import { FeedNotice } from './feed-notice';
import { HandoffLine } from './handoff-line';
import { MemoryLine } from './memory-line';
import { MessageActions } from './message-actions';
import { RunAttachments } from './run-attachments';
import { ThinkingLine } from './thinking-line';
import { UserSegment } from './user-segment';

export function FailedMessageView({
  text,
  onRetry,
  onDelete,
}: {
  text: string;
  onRetry?: () => void;
  onDelete?: () => void;
}) {
  return (
    <FeedNotice
      testId="error-message-view"
      tone="danger"
      icon={AlertCircleIcon}
      label="Error"
      actions={
        <>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              title="Retry run"
              className="inline-flex items-center gap-1 rounded-md border border-destructive/35 px-2 py-0.5 text-[11px] text-destructive transition-colors hover:bg-destructive/10"
            >
              <RotateCcwIcon className="size-3" />
              Retry
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              title="Delete error"
              className="inline-flex items-center gap-1 rounded-md border border-destructive/35 px-2 py-0.5 text-[11px] text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2Icon className="size-3" />
              Delete
            </button>
          ) : null}
        </>
      }
    >
      <div className="break-words font-mono text-destructive text-xs leading-relaxed">{text}</div>
    </FeedNotice>
  );
}
export function SystemMessageView({ text }: { text: string }) {
  if (!text) {
    return null;
  }
  return (
    <FeedNotice testId="system-message-view" tone="neutral" icon={TerminalIcon} label="System">
      <p className="whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed">{text}</p>
    </FeedNotice>
  );
}
export function AssistantMessageView({
  run,
  runId,
  streaming = false,
  threadId,
  onOpenSpawn,
  readOnly = false,
  inherited = false,
  branchChildren,
}: {
  run: FeedRun;
  runId: string;
  streaming?: boolean;
  threadId?: string;
  onOpenSpawn?: (spawnId: string) => void;
  readOnly?: boolean;
  inherited?: boolean;
  branchChildren?: { id: string; agentId: string; title: string }[];
}) {
  const segments = run.segments;
  const lastSegment = segments[segments.length - 1];
  const pendingReply =
    streaming &&
    run.terminal === null &&
    !run.hasInFlight &&
    (!lastSegment || lastSegment.kind === 'user');
  const answerText = segments
    .filter((segment) => segment.kind === 'text' || segment.kind === 'compaction')
    .map((segment) => segment.text)
    .join('\n\n');
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col">
        {segments.map((segment, index) => (
          <div key={segment.key} className={segmentSpacing(segments[index - 1], segment)}>
            <TurnSegmentView
              segment={segment}
              live={streaming && index === segments.length - 1 && !pendingReply}
              threadId={threadId}
              runId={runId}
              inherited={inherited}
              streaming={streaming}
              readOnly={readOnly}
              onOpenSpawn={onOpenSpawn}
            />
          </div>
        ))}
        {pendingReply ? (
          <div className={segments.length > 0 ? 'mt-3' : undefined}>
            <ActivityRail live={true}>
              <ThinkingLine text="" live={true} threadId={threadId} />
            </ActivityRail>
          </div>
        ) : null}
      </div>

      {threadId ? <RunAttachments run={run} threadId={threadId} /> : null}

      <div className="flex items-center gap-1">
        {branchChildren && branchChildren.length > 0 ? (
          <BranchPointBadge runId={runId} branches={branchChildren} />
        ) : null}
        {answerText && !readOnly ? (
          <TurnMessageActions runId={runId} answerText={answerText} inherited={inherited} />
        ) : null}
      </div>
    </div>
  );
}

function segmentSpacing(prev: FeedSegment | undefined, curr: FeedSegment): string | undefined {
  if (!prev) {
    return undefined;
  }
  if (prev.kind === 'user' || curr.kind === 'user') {
    return 'mt-5';
  }
  if (prev.kind === 'activity' && curr.kind !== 'activity') {
    return 'mt-4';
  }
  return 'mt-3';
}

function TurnMessageActions({
  runId,
  answerText,
  inherited,
}: {
  runId: string;
  answerText: string;
  inherited: boolean;
}) {
  const agent = useSelectedAgent();
  const thread = useSelectedThread();
  const projectId = studioFocusProjectId(useStudioLocation().focus);
  const { openThread } = useStudioNavigation();
  return (
    <MessageActions
      entryId={runId}
      inherited={inherited}
      speakText={answerText}
      onCopy={() => {
        void navigator.clipboard.writeText(answerText);
        toast.add({ title: 'Copied.' });
      }}
      onBranch={() => {
        if (!agent || !thread || !projectId) {
          return;
        }
        void branchThread(runId, agent.id, thread.id, projectId).then((nextId) => {
          if (nextId) {
            useDeskStore.getState().setFocusedThreadId(nextId);
            openThread(projectId, nextId);
          }
        });
      }}
    />
  );
}

function TurnSegmentView({
  segment,
  live,
  threadId,
  runId,
  inherited = false,
  streaming = false,
  readOnly = false,
  onOpenSpawn,
}: {
  segment: FeedSegment;
  live: boolean;
  threadId?: string;
  runId?: string;
  inherited?: boolean;
  streaming?: boolean;
  readOnly?: boolean;
  onOpenSpawn?: (spawnId: string) => void;
}) {
  if (segment.kind === 'user') {
    return (
      <UserSegment
        event={segment.event}
        segmentKey={segment.key}
        threadId={threadId}
        runId={runId}
        inherited={inherited}
        streaming={streaming}
        readOnly={readOnly}
      />
    );
  }
  if (segment.kind === 'activity') {
    return (
      <ActivityItems
        items={segment.items}
        live={live}
        threadId={threadId}
        onOpenSpawn={onOpenSpawn}
      />
    );
  }
  if (segment.kind === 'compaction') {
    return <CompactionMessageCard text={segment.text} meta={segment.meta} />;
  }
  if (segment.kind === 'handoff') {
    return (
      <ActivityRail>
        <HandoffLine agentId={segment.agentId} />
      </ActivityRail>
    );
  }
  if (segment.kind === 'memory') {
    return (
      <ActivityRail>
        <MemoryLine event={segment.event} />
      </ActivityRail>
    );
  }
  if (segment.kind === 'placement') {
    return <SystemMessageView text={segment.summary} />;
  }
  return <LiveMarkdown text={segment.text} live={live} threadId={threadId} blockId={segment.id} />;
}

function LiveMarkdown({
  text,
  live,
  threadId,
  blockId,
}: {
  text: string;
  live: boolean;
  threadId?: string;
  blockId?: string;
}) {
  const fileLink = useFileLinkComponents();
  const tail = useLiveTail(live ? threadId : undefined);
  const applies =
    live &&
    tail.kind === 'text' &&
    tail.text !== '' &&
    (blockId === undefined || tail.id === blockId);
  const shown = useStreamText(applies ? tail.text : text, applies);
  return <Markdown text={shown} streaming={live} components={fileLink} />;
}
