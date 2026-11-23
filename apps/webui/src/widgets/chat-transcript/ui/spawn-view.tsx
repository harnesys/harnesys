import type { SessionEvent } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { agentColorClass, useAgentStore } from '@/entities/agent';
import {
  createSpawnFold,
  type SpawnStatus,
  spawnProcess,
  spawnSnapshot,
  spawnTaskText,
  splitRuns,
} from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import type { IdeTab } from '@/features/ide';
import { useOpenSpawnTab } from '@/features/ide';
import { getRunSubtree } from '@/shared/api';
import { cn } from '@/shared/lib/utils';
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/shared/ui/message-scroller';
import { RunAttributionBadge } from '@/shared/ui/run-attribution-badge';
import { StatusDot } from '@/shared/ui/status-dot';
import { ThreadDock } from '@/widgets/thread-dock';
import { agentFallbackName } from '../model/agent-label';
import { useSyncedThread } from '../model/thread-sync';
import { RunTurn } from './run-turn';

const DOT_TONE: Record<SpawnStatus, 'live' | 'idle' | 'danger'> = {
  running: 'live',
  done: 'idle',
  failed: 'danger',
};
const STATUS_LABEL: Record<SpawnStatus, string> = {
  running: 'running',
  done: 'done',
  failed: 'failed',
};
const TASK_COLLAPSE_AT = 500;
const EMPTY_EVENTS: SessionEvent[] = [];

function spawnsOf(events: SessionEvent[]) {
  const fold = createSpawnFold();
  for (const event of events) {
    spawnProcess(fold, event, undefined);
  }
  return spawnSnapshot(fold);
}

export function SpawnView({
  tab,
  threadId,
  spawnId,
}: {
  tab: IdeTab;
  threadId: string;
  spawnId: string;
}) {
  const subtreeQuery = useQuery({
    queryKey: ['run-subtree', threadId, spawnId],
    queryFn: () => getRunSubtree(threadId, spawnId),
  });
  useSyncedThread(threadId, tab.projectId);
  const openSpawnTab = useOpenSpawnTab();
  const events = subtreeQuery.data?.events ?? EMPTY_EVENTS;
  const spawns = spawnsOf(events);
  const spawn = spawns.find((item) => item.spawnId === spawnId);
  const agent = useAgentStore((state) => (spawn ? state.byId(spawn.agentId) : undefined));
  const activeRun = useThreadStore((state) => state.byId(threadId)?.activeRun ?? null);
  const spawnedEvent = events.find(
    (
      ev,
    ): ev is SessionEvent & {
      type: 'agent.spawned';
    } => ev.type === 'agent.spawned' && ev.spawnId === spawnId,
  );
  const spawnedTask = spawnedEvent ? spawnTaskText(spawnedEvent.taskInput) : undefined;
  const [taskExpanded, setTaskExpanded] = useState(false);
  const taskCollapsed =
    spawnedTask !== undefined && Array.from(spawnedTask).length > TASK_COLLAPSE_AT && !taskExpanded;
  const running = spawn?.status === 'running';
  if (!spawn) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-muted-foreground text-sm"
        data-testid="ide-spawn-loading"
      >
        {subtreeQuery.isPending ? 'Loading…' : 'Spawn not found'}
      </div>
    );
  }
  const onOpenSpawn = (sid: string) => {
    const target = spawns.find((item) => item.spawnId === sid);
    openSpawnTab(tab.projectId, target?.agentId ?? '', threadId, sid);
  };
  const runs = splitRuns(events);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-spawn">
      {spawnedTask ? (
        <div className="shrink-0 border-border/60 border-b px-3 py-2" data-testid="ide-spawn-task">
          <div className="mx-auto w-full max-w-3xl">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Task</div>
            <div className="whitespace-pre-wrap text-[12px] text-foreground leading-5">
              {taskCollapsed
                ? Array.from(spawnedTask).slice(0, TASK_COLLAPSE_AT).join('')
                : spawnedTask}
            </div>
            {Array.from(spawnedTask).length > TASK_COLLAPSE_AT ? (
              <button
                type="button"
                onClick={() => setTaskExpanded((open) => !open)}
                className="mt-1 cursor-pointer text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {taskExpanded ? 'Show less' : 'Show full task'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-3xl gap-7 px-4 py-8 text-[length:var(--chat-font-size)]">
              {runs.map((run, index) => (
                <MessageScrollerItem key={run.key} messageId={run.key}>
                  <RunTurn
                    run={run}
                    runId={run.runId ?? spawnId}
                    streaming={Boolean(running) && index === runs.length - 1}
                    threadId={threadId}
                    onOpenSpawn={onOpenSpawn}
                    readOnly
                  />
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
        </MessageScroller>
      </MessageScrollerProvider>
      <ThreadDock
        identity={{
          icon: <StatusDot tone={DOT_TONE[spawn.status]} className="size-2" />,
          title: (
            <span className="inline-flex items-center gap-1.5" title={spawn.agentId}>
              <span
                aria-hidden
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  agentColorClass(agent?.color ?? null),
                )}
              />
              {agent?.name ?? agentFallbackName(spawn.agentId)}
            </span>
          ),
          meta: (
            <>
              <span className="truncate">{STATUS_LABEL[spawn.status]}</span>
              {running ? <RunAttributionBadge run={activeRun} /> : null}
            </>
          ),
        }}
      />
    </div>
  );
}
