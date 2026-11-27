import type { ThreadKind } from '@harnesys/studio-shared';
import {
  FilterIcon,
  GitBranchIcon,
  MessageSquareIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from 'lucide-react';
import { Fragment, type ReactNode, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Agent } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import type { Thread } from '@/entities/thread';
import { useAgentThreads, useThreadWaiting } from '@/features/desk';
import { AGENT_THREAD_KINDS } from '@/features/desk/model/agents-display.store';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatDayTime } from '@/shared/lib/format-clock';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { SidebarRow } from '@/shared/ui/sidebar-row';
import { rowStatusDot, runStatus } from '../model/row-status';
import { useThreadActions } from '../model/thread-actions';
import {
  buildThreadTree,
  countSubtree,
  subtreeHas,
  type ThreadTreeNode,
} from '../model/thread-tree';
import { SidebarEmpty } from './sidebar-empty';
import { ThreadKindIcon } from './thread-kind-icon';

const VISIBLE_ROOT_LIMIT = 3;
export function AgentInlineThreads({
  agent,
  projectId,
  activeThreadId,
  onDone,
  kinds = AGENT_THREAD_KINDS,
  onResetKinds,
}: {
  agent: Agent;
  projectId: string;
  activeThreadId: string | null;
  onDone: () => void;
  kinds?: readonly ThreadKind[];
  onResetKinds?: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const threads = useAgentThreads(agent.id).filter((thread) => kinds.includes(thread.kind));
  const filtered = kinds.length < AGENT_THREAD_KINDS.length;
  const activeRunIds = useSessionStore(useShallow((s) => Object.keys(s.activeRuns)));
  const isActive = (thread: Thread): boolean =>
    activeRunIds.includes(thread.id) || isLiveRunStatus(thread.activeRun?.status);
  const actions = useThreadActions(projectId);
  const roots = buildThreadTree(threads, isActive);
  const total = roots.reduce((sum, node) => sum + countSubtree(node), 0);
  const activeRoot = activeThreadId
    ? (roots.find((node) => subtreeHas(node, activeThreadId)) ?? null)
    : null;
  const visible: ThreadTreeNode[] = [];
  let used = 0;
  for (const node of roots) {
    if (!showAll && used >= VISIBLE_ROOT_LIMIT && node !== activeRoot) {
      continue;
    }
    visible.push(node);
    used += countSubtree(node);
  }
  const hiddenCount = Math.max(0, total - used);
  let emptyHint: ReactNode = (
    <SidebarEmpty
      variant="inline"
      hint="Start a chat with this agent."
      icon={MessageSquareIcon}
      title="No threads yet"
    />
  );
  if (filtered) {
    emptyHint = (
      <div className="flex items-center justify-between gap-1 px-1.5 py-1 group-data-[collapsible=icon]:hidden">
        <SidebarEmpty
          variant="inline"
          className="p-0"
          hint="Nothing matches the current kind filter."
          icon={FilterIcon}
          title="No matching threads"
        />
        {onResetKinds ? (
          <button
            type="button"
            className="shrink-0 rounded-md text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            onClick={onResetKinds}
          >
            Reset
          </button>
        ) : null}
      </div>
    );
  }
  const renderRow = (thread: Thread) => (
    <InlineThreadRow
      thread={thread}
      selected={activeThreadId === thread.id}
      onSelect={() => {
        actions.openThread(thread);
        onDone();
      }}
      onPinToggle={thread.kind === 'chat' ? () => actions.togglePin(thread) : undefined}
      onDelete={thread.kind === 'chat' ? () => actions.removeThread(thread) : undefined}
    />
  );
  return (
    <div
      className={cn(
        'mt-0.5 ml-[12px] flex flex-col gap-0.5 border-border/50 border-l pb-1 pl-1',
        'group-data-[collapsible=icon]:ml-0 group-data-[collapsible=icon]:border-l-0 group-data-[collapsible=icon]:pl-0',
      )}
      data-testid={`agent-threads-inline-${agent.id}`}
    >
      {roots.length === 0 ? (
        emptyHint
      ) : (
        <>
          <InlineNodes nodes={visible} renderRow={renderRow} />
          {hiddenCount > 0 ? (
            <button
              type="button"
              className="rounded-md px-1.5 py-0.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground group-data-[collapsible=icon]:hidden"
              onClick={() => setShowAll(true)}
            >
              Show {hiddenCount} more
            </button>
          ) : null}
          {showAll && roots.length > VISIBLE_ROOT_LIMIT ? (
            <button
              type="button"
              className="rounded-md px-1.5 py-0.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground group-data-[collapsible=icon]:hidden"
              onClick={() => setShowAll(false)}
            >
              Show less
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
function InlineNodes({
  nodes,
  renderRow,
}: {
  nodes: ThreadTreeNode[];
  renderRow: (thread: Thread) => ReactNode;
}) {
  return (
    <>
      {nodes.map((node) => (
        <Fragment key={node.thread.id}>
          {renderRow(node.thread)}
          {node.children.length > 0 ? (
            <div className="ml-3 border-border/50 border-l pl-1.5">
              <InlineNodes nodes={node.children} renderRow={renderRow} />
            </div>
          ) : null}
        </Fragment>
      ))}
    </>
  );
}
function InlineThreadRow({
  thread,
  selected,
  onSelect,
  onPinToggle,
  onDelete,
}: {
  thread: Thread;
  selected: boolean;
  onSelect: () => void;
  onPinToggle?: () => void;
  onDelete?: () => void;
}) {
  const timeZone = useOrgTimeZone();
  const running = useSessionStore((s) => Boolean(s.activeRuns[thread.id]));
  const waiting = useThreadWaiting(thread.id);
  const status = runStatus(running, waiting);
  const hasMenu = Boolean(onPinToggle || onDelete);
  const dot = rowStatusDot(status, thread.unread);
  return (
    <SidebarRow
      variant="card"
      className="pl-2"
      testId={`agent-thread-${thread.id}`}
      selected={selected}
      leading={
        <ThreadKindIcon
          kind={thread.kind}
          className="text-muted-foreground"
          icon={thread.icon}
          color={thread.color}
        />
      }
      actions={
        hasMenu ? (
          <>
            {onPinToggle ? (
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-5"
                aria-label={thread.pinned ? 'Unpin thread' : 'Pin thread'}
                onClick={(event) => {
                  event.stopPropagation();
                  onPinToggle();
                }}
              >
                {thread.pinned ? (
                  <PinOffIcon className="size-3 text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
                ) : (
                  <PinIcon className="size-3 text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
                )}
              </Button>
            ) : null}
            {onDelete ? (
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-5"
                aria-label="Delete thread"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2Icon className="size-3 text-sidebar-foreground/50 group-hover/button:text-destructive" />
              </Button>
            ) : null}
          </>
        ) : null
      }
      onClick={onSelect}
    >
      <span className="flex min-w-0 items-center gap-1">
        {thread.pinned ? (
          <PinIcon className="size-2.5 shrink-0 text-muted-foreground" aria-hidden />
        ) : null}
        {thread.parentThreadId ? (
          <GitBranchIcon className="size-2.5 shrink-0 text-muted-foreground" aria-hidden />
        ) : null}
        <span
          className={cn(
            'block truncate font-medium text-[11px] leading-tight',
            selected || thread.unread ? 'text-sidebar-foreground' : 'text-muted-foreground',
          )}
        >
          {thread.title}
        </span>
      </span>
      <span className="mt-1.5 flex items-center justify-between gap-2">
        <span className="block truncate font-mono text-[10px] text-muted-foreground/60 leading-snug">
          {formatDayTime(thread.updatedAt, timeZone)}
        </span>
        {dot}
      </span>
    </SidebarRow>
  );
}
function isLiveRunStatus(status: string | undefined): boolean {
  return (
    status === 'queued' || status === 'running' || status === 'waiting' || status === 'needs_input'
  );
}
