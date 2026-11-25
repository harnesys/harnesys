import { ChevronRightIcon, ChevronUpIcon, SquareIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { agentColorClass, useAgentStore } from '@/entities/agent';
import { formatDuration, type SpawnInfo, useFeedSpawns } from '@/entities/session';
import { useOpenSpawnTab } from '@/features/ide';
import { cancelRun } from '@/shared/api';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { InputGroupAddon } from '@/shared/ui/input-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { StatusDot } from '@/shared/ui/status-dot';
import { toast } from '@/shared/ui/toast';

function BackgroundAgentRow({
  spawn,
  now,
  stopping,
  onStop,
  onOpen,
}: {
  spawn: SpawnInfo;
  now: number;
  stopping: boolean;
  onStop: (spawnId: string) => void;
  onOpen: (spawn: SpawnInfo) => void;
}) {
  const agent = useAgentStore((state) => state.byId(spawn.agentId));
  const name = spawn.agentName ?? agent?.name ?? spawn.agentId.slice(0, 8);
  const startedAt = spawn.spawnedAt ?? spawn.lastSeenAt;
  const detail = spawn.lastActivity || `${spawn.steps} steps`;
  return (
    <div className="flex items-center gap-0.5 rounded-md pr-1 hover:bg-accent/60">
      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left"
        title="Open subagent thread"
        onClick={() => onOpen(spawn)}
      >
        <span
          aria-hidden
          className={cn('size-2 shrink-0 rounded-full', agentColorClass(agent?.color ?? null))}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium text-xs">{name}</span>
            {startedAt !== undefined ? (
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {formatDuration(Math.max(0, now - startedAt))}
              </span>
            ) : null}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">{detail}</span>
        </span>
      </button>
      <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/50" />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={stopping}
        className="shrink-0 text-muted-foreground hover:text-destructive"
        title="Stop background agent"
        aria-label={`Stop ${name}`}
        data-testid="background-agents-stop"
        onClick={() => onStop(spawn.spawnId)}
      >
        <SquareIcon />
      </Button>
    </div>
  );
}

export function BackgroundAgentsStrip({
  threadId,
  projectId,
  parentAgentId,
}: {
  threadId: string | null;
  projectId: string;
  parentAgentId: string;
}) {
  const [stoppedIds, setStoppedIds] = useState<string[]>([]);
  const running = useFeedSpawns(threadId).filter(
    (spawn) => spawn.status === 'running' && !stoppedIds.includes(spawn.spawnId),
  );
  const agents = useAgentStore((state) => state.items);
  const openSpawnTab = useOpenSpawnTab();
  const [now, setNow] = useState(() => Date.now());
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  useEffect(() => {
    if (running.length === 0) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running.length]);
  if (!threadId || running.length === 0) {
    return null;
  }
  const activeThreadId = threadId;
  const nameOf = (spawn: SpawnInfo): string =>
    spawn.agentName ??
    agents.find((agent) => agent.id === spawn.agentId)?.name ??
    spawn.agentId.slice(0, 8);
  const names = running.map(nameOf);
  const stop = (spawnId: string): void => {
    setStoppingId(spawnId);
    cancelRun(activeThreadId, spawnId)
      .then(() => setStoppedIds((ids) => [...ids, spawnId]))
      .catch((error) => {
        toast.add({
          title: 'Stop failed',
          description: error instanceof Error ? error.message : 'Could not stop the subagent',
          type: 'error',
        });
      })
      .finally(() => setStoppingId(null));
  };
  const open = (spawn: SpawnInfo): void => {
    openSpawnTab(projectId, parentAgentId, activeThreadId, spawn.spawnId, spawn.agentId);
  };
  return (
    <InputGroupAddon
      align="block-start"
      className="w-full border-border/50 border-b px-1.5 pt-1.5 pb-1 text-xs"
      data-testid="background-agents-strip"
    >
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-0.5 text-left hover:bg-accent/60"
            />
          }
        >
          <StatusDot tone="live" className="size-1.5" />
          <span className="shrink-0 font-medium text-foreground">
            {running.length} background {running.length === 1 ? 'agent' : 'agents'}
          </span>
          <span className="min-w-0 truncate text-muted-foreground">{names.join(', ')}</span>
          <ChevronUpIcon className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-80 p-1">
          <div className="px-2 py-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
            Running in background
          </div>
          {running.map((spawn) => (
            <BackgroundAgentRow
              key={spawn.spawnId}
              spawn={spawn}
              now={now}
              stopping={stoppingId === spawn.spawnId}
              onStop={stop}
              onOpen={open}
            />
          ))}
        </PopoverContent>
      </Popover>
    </InputGroupAddon>
  );
}
