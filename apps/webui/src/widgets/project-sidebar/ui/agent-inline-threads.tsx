import type { ThreadKind } from '@harnesys/studio-shared';
import { GitBranchIcon, PinIcon, PinOffIcon, Trash2Icon } from 'lucide-react';
import { Fragment, type ReactNode, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Agent } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import type { Thread } from '@/entities/thread';
import { useAgentThreads, useThreadWaiting } from '@/features/desk';
import { AGENT_THREAD_KINDS } from '@/features/desk/model/agents-display.store';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatClock, formatShortDate } from '@/shared/lib/format-clock';
import { dayKeyInTimeZone } from '@/shared/lib/time-zone';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { useSidebar } from '@/shared/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { useThreadActions } from '../model/thread-actions';
import {
  buildThreadTree,
  countSubtree,
  subtreeHas,
  type ThreadTreeNode,
} from '../model/thread-tree';
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
    <p className="px-1.5 py-1 text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
      No threads yet.
    </p>
  );
  if (filtered) {
    emptyHint = (
      <div className="flex items-center justify-between gap-1 px-1.5 py-1 group-data-[collapsible=icon]:hidden">
        <p className="text-[11px] text-muted-foreground">No threads match filter.</p>
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
        'mt-0.5 ml-[15px] flex flex-col gap-0.5 border-border/50 border-l pb-1 pl-1',
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
  const { state, isMobile } = useSidebar();
  const timeZone = useOrgTimeZone();
  const iconMode = state === 'collapsed' && !isMobile;
  const running = useSessionStore((s) => Boolean(s.activeRuns[thread.id]));
  const waiting = useThreadWaiting(thread.id);
  const status = runStatus(running, waiting);
  const hasMenu = Boolean(onPinToggle || onDelete);
  const statusHint = [status, thread.unread ? 'unread' : null].filter(Boolean).join(' · ');
  const right = rowRight(status, thread, iconMode, timeZone);
  return (
    <div
      className={cn(
        'group/ithread relative flex items-center rounded-md transition-colors hover:bg-sidebar-accent/70',
        selected && 'bg-sidebar-accent/70 text-sidebar-accent-foreground',
        'group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center',
      )}
      data-testid={`agent-thread-${thread.id}`}
      data-selected={selected ? 'true' : 'false'}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md pr-2 pl-2 text-left group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
              onClick={onSelect}
            />
          }
        >
          <span className="inline-flex size-3 shrink-0 items-center justify-center text-muted-foreground group-data-[collapsible=icon]:size-4 group-data-[collapsible=icon]:text-sidebar-foreground/80">
            <ThreadKindIcon
              kind={thread.kind}
              className="size-3 group-data-[collapsible=icon]:size-4"
            />
          </span>
          {thread.pinned ? (
            <PinIcon className="size-2.5 shrink-0 text-muted-foreground" aria-hidden />
          ) : null}
          {thread.parentThreadId ? (
            <GitBranchIcon className="size-2.5 shrink-0 text-muted-foreground" aria-hidden />
          ) : null}
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-xs leading-none group-data-[collapsible=icon]:hidden',
              thread.unread && 'font-medium',
            )}
          >
            {thread.title}
          </span>
          {right}
        </TooltipTrigger>
        <TooltipContent side="right" hidden={!iconMode}>
          {thread.title}
          {statusHint ? ` · ${statusHint}` : ''}
        </TooltipContent>
      </Tooltip>
      {hasMenu ? (
        <div className="absolute top-0.5 right-1 z-10 flex gap-0.5 opacity-0 transition-opacity group-hover/ithread:opacity-100 group-data-[collapsible=icon]:hidden">
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
        </div>
      ) : null}
    </div>
  );
}
function runStatus(running: boolean, waiting: boolean): 'running' | 'waiting' | null {
  if (running) {
    return 'running';
  }
  if (waiting) {
    return 'waiting';
  }
  return null;
}
function isLiveRunStatus(status: string | undefined): boolean {
  return (
    status === 'queued' || status === 'running' || status === 'waiting' || status === 'needs_input'
  );
}
type RunStatus = ReturnType<typeof runStatus>;
function rowRight(
  status: RunStatus,
  thread: Thread,
  iconMode: boolean,
  timeZone: string,
): ReactNode {
  if (status) {
    return (
      <span
        title={status}
        className={cn(
          'relative inline-flex size-1.5 shrink-0 rounded-full',
          status === 'running' && 'animate-pulse',
          status === 'running' ? 'bg-live' : 'bg-live/60',
        )}
      >
        <span className="sr-only">{status}</span>
      </span>
    );
  }
  if (thread.unread) {
    return (
      <span title="unread" className="relative inline-flex size-1.5 shrink-0 rounded-full bg-live">
        <span className="sr-only">unread</span>
      </span>
    );
  }
  if (iconMode) {
    return null;
  }
  return (
    <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70 leading-none transition-opacity group-hover/ithread:opacity-0">
      {threadTime(thread.updatedAt, timeZone)}
    </span>
  );
}
function threadTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  if (dayKeyInTimeZone(timeZone, date) === dayKeyInTimeZone(timeZone, new Date())) {
    return formatClock(iso, timeZone);
  }
  return formatShortDate(iso, timeZone);
}
