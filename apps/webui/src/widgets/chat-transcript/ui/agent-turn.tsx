import { AlertCircleIcon, RotateCcwIcon, TerminalIcon, Trash2Icon } from 'lucide-react';
import type { Agent } from '@/entities/agent';
import { AgentAvatar, AgentRecordAvatar, initialsFromName, useAgentStore } from '@/entities/agent';
import type { FeedRun, FeedSegment } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { quoteOfRunAnswer, replyHandlerOf } from '@/features/message-quote';
import { useThreadHistoryAnchor } from '../model/use-thread-history-anchor';
import { ActivityItems } from './activity-items';
import { ActivityRail } from './activity-rail';
import { TurnMessageActions } from './agent-turn-actions';
import { BranchPointBadge } from './branch-point-badge';
import { CompactionMessageCard } from './compaction-card';
import { FeedNotice } from './feed-notice';
import { HandoffLine } from './handoff-line';
import { LiveMarkdown } from './live-markdown';
import { MemoryLine } from './memory-line';
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
      <div className="wrap-break-word font-mono text-destructive text-xs leading-relaxed">
        {text}
      </div>
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
  undoable = false,
}: {
  run: FeedRun;
  runId: string;
  streaming?: boolean;
  threadId?: string;
  onOpenSpawn?: (spawnId: string, agentId: string) => void;
  readOnly?: boolean;
  inherited?: boolean;
  branchChildren?: { id: string; agentId: string; title: string }[];
  undoable?: boolean;
}) {
  const segments = run.segments;
  const group = useThreadStore((state) =>
    threadId ? state.byId(threadId)?.kind === 'group' : false,
  );
  const { anchorSeq, toggle } = useThreadHistoryAnchor(threadId);
  const anchorId = run.runId;
  const onToggleAnchor = anchorId ? (threadSeq: number) => toggle(anchorId, threadSeq) : undefined;
  const runAgentId = agentIdOfRun(run);
  const runAgentName = agentNameOfRun(run);
  const agent = useAgentStore((state) => (runAgentId ? state.byId(runAgentId) : undefined));
  const firstAssistantIndex = segments.findIndex((segment) => segment.kind !== 'user');
  const lastSegment = segments[segments.length - 1];
  const lastIsEmptyActivity = lastSegment?.kind === 'activity' && lastSegment.items.length === 0;
  const pendingReply =
    streaming &&
    run.terminal === null &&
    !run.hasInFlight &&
    (!lastSegment || lastSegment.kind === 'user' || lastIsEmptyActivity);
  const pendingInline = pendingReply && lastIsEmptyActivity;
  const answerText = segments
    .filter((segment) => segment.kind === 'text' || segment.kind === 'compaction')
    .map((segment) => segment.text)
    .join('\n\n');
  const blocks = segmentBlocks(segments);
  const lastAssistantKey = lastAssistantBlockKey(blocks);
  const onReply = replyHandlerOf(
    threadId,
    quoteOfRunAnswer(run.lastThreadSeq, runAgentName, answerText),
  );
  const footer = (
    <>
      <RunAttachments
        run={run}
        threadId={threadId}
        live={streaming && run.terminal === null}
        className="mt-3"
      />
      <div className="mt-3 flex items-center gap-1">
        {branchChildren && branchChildren.length > 0 ? (
          <BranchPointBadge runId={runId} branches={branchChildren} />
        ) : null}
        {answerText && !readOnly ? (
          <TurnMessageActions
            runId={runId}
            answerText={answerText}
            inherited={inherited}
            onReply={onReply}
          />
        ) : null}
      </div>
    </>
  );
  return (
    <div className="flex flex-col">
      {blocks.map((block) => (
        <div
          key={block.key}
          data-thread-seq={blockThreadSeq(block, lastAssistantKey, run)}
          className={block.kind === 'assistant' ? 'group/message flex flex-col' : undefined}
        >
          {block.items.map((item) => {
            const { segment, index } = item;
            const isLast = index === segments.length - 1;
            const segmentNode = (
              <div className={segmentSpacing(segments[index - 1], segment)}>
                <TurnSegmentView
                  segment={segment}
                  live={streaming && isLast && (!pendingReply || pendingInline)}
                  pending={
                    streaming && isLast && segment.kind === 'activity' && segment.items.length === 0
                  }
                  threadId={threadId}
                  runId={runId}
                  anchorSeq={anchorSeq}
                  onToggleAnchor={onToggleAnchor}
                  inherited={inherited}
                  streaming={streaming}
                  readOnly={readOnly}
                  onOpenSpawn={onOpenSpawn}
                  undoable={undoable}
                />
              </div>
            );
            if (!group || segment.kind === 'user') {
              return <div key={segment.key}>{segmentNode}</div>;
            }
            return (
              <div key={segment.key} className="min-w-0">
                {index === firstAssistantIndex ? (
                  <AgentTurnHeading agent={agent} name={runAgentName} />
                ) : null}
                {segmentNode}
              </div>
            );
          })}
          {block.key === lastAssistantKey ? footer : null}
        </div>
      ))}
      {lastAssistantKey === undefined ? <div className="flex flex-col">{footer}</div> : null}
      {pendingReply && !pendingInline ? (
        <div className={lastSegment?.kind === 'user' ? 'mt-5 min-w-0' : 'min-w-0'}>
          {group ? <AgentTurnHeading agent={agent} name={runAgentName} /> : null}
          <ActivityRail live={true}>
            <ThinkingLine text="" live={true} threadId={threadId} />
          </ActivityRail>
        </div>
      ) : null}
    </div>
  );
}

interface SegmentBlock {
  key: string;
  kind: 'user' | 'assistant';
  items: { segment: FeedSegment; index: number }[];
}

function segmentBlocks(segments: FeedSegment[]): SegmentBlock[] {
  const blocks: SegmentBlock[] = [];
  segments.forEach((segment, index) => {
    const kind = segment.kind === 'user' ? 'user' : 'assistant';
    const last = blocks[blocks.length - 1];
    if (kind === 'assistant' && last?.kind === 'assistant') {
      last.items.push({ segment, index });
      return;
    }
    blocks.push({ key: segment.key, kind, items: [{ segment, index }] });
  });
  return blocks;
}

function lastAssistantBlockKey(blocks: SegmentBlock[]): string | undefined {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block && block.kind === 'assistant') {
      return block.key;
    }
  }
  return undefined;
}

function blockThreadSeq(
  block: SegmentBlock,
  lastAssistantKey: string | undefined,
  run: FeedRun,
): number | undefined {
  if (block.kind !== 'assistant' || block.key !== lastAssistantKey) {
    return undefined;
  }
  return run.lastThreadSeq ?? undefined;
}

function agentIdOfRun(run: FeedRun): string | undefined {
  for (const event of run.events) {
    if (event.agentId) {
      return event.agentId;
    }
  }
  return undefined;
}

function agentNameOfRun(run: FeedRun): string | undefined {
  for (const event of run.events) {
    if (event.agentName) {
      return event.agentName;
    }
  }
  return undefined;
}

function AgentTurnHeading({ agent, name }: { agent: Agent | undefined; name: string | undefined }) {
  return (
    <div className="mb-1 flex items-center gap-1.5">
      <AgentTurnAvatar agent={agent} name={name} />
      {name ? (
        <span className="truncate font-medium text-muted-foreground text-xs">{name}</span>
      ) : null}
    </div>
  );
}

function AgentTurnAvatar({ agent, name }: { agent: Agent | undefined; name: string | undefined }) {
  if (agent) {
    return <AgentRecordAvatar agent={agent} size="sm" title={agent.name} />;
  }
  if (!name) {
    return null;
  }
  return <AgentAvatar initials={initialsFromName(name)} color={null} title={name} size="sm" />;
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

function TurnSegmentView({
  segment,
  live,
  pending = false,
  threadId,
  runId,
  anchorSeq,
  onToggleAnchor,
  inherited = false,
  streaming = false,
  readOnly = false,
  onOpenSpawn,
  undoable = false,
}: {
  segment: FeedSegment;
  live: boolean;
  pending?: boolean;
  threadId?: string;
  runId?: string;
  anchorSeq?: number;
  onToggleAnchor?: (threadSeq: number) => void;
  inherited?: boolean;
  streaming?: boolean;
  readOnly?: boolean;
  onOpenSpawn?: (spawnId: string, agentId: string) => void;
  undoable?: boolean;
}) {
  if (segment.kind === 'user') {
    return (
      <UserSegment
        event={segment.event}
        segmentKey={segment.key}
        threadId={threadId}
        runId={runId}
        anchorSeq={anchorSeq}
        onToggleAnchor={onToggleAnchor}
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
        pending={pending}
        threadId={threadId}
        onOpenSpawn={onOpenSpawn}
      />
    );
  }
  if (segment.kind === 'compaction') {
    return (
      <CompactionMessageCard
        text={segment.text}
        meta={segment.meta}
        threadId={threadId}
        undoable={undoable}
      />
    );
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
