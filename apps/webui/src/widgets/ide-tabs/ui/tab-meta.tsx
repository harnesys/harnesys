import { useQuery } from '@tanstack/react-query';
import {
  CalendarClockIcon,
  EarthIcon,
  FileDiffIcon,
  FileIcon,
  MessageSquareIcon,
  PaperclipIcon,
  SquareTerminalIcon,
  WorkflowIcon,
} from 'lucide-react';
import { AgentRecordAvatar, useAgentStore } from '@/entities/agent';
import { useIssueBoardStore } from '@/entities/issue';
import { useThreadStore } from '@/entities/thread';
import type { IdeTab } from '@/features/ide';
import { resolveBoardIcon } from '@/features/manage-issues';
import { listTerminals, terminalsQueryKey } from '@/shared/api';
import { entityColorTintClass } from '@/shared/lib/entity-colors';
import { cn } from '@/shared/lib/utils';
import { FileTypeIcon } from '@/shared/ui/icons';

function fileBaseName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}
export function TabIcon({ tab }: { tab: IdeTab }) {
  if (tab.kind === 'file' && tab.path) {
    return <FileTypeIcon name={tab.path} size="xs" className="opacity-70" />;
  }
  if (tab.kind === 'thread' && tab.threadId) {
    return <ThreadTabIcon threadId={tab.threadId} />;
  }
  if (tab.kind === 'spawn') {
    return <WorkflowIcon className="size-3.5 shrink-0 opacity-70" />;
  }
  if (tab.kind === 'diff') {
    return <FileDiffIcon className="size-3.5 shrink-0 opacity-70" />;
  }
  if (tab.kind === 'schedule') {
    return <CalendarClockIcon className="size-3.5 shrink-0 opacity-70" />;
  }
  if (tab.kind === 'webhook') {
    return <EarthIcon className="size-3.5 shrink-0 opacity-70" />;
  }
  if (tab.kind === 'board') {
    return <BoardTabIcon boardId={tab.boardId ?? ''} />;
  }
  if (tab.kind === 'terminal') {
    return <SquareTerminalIcon className="size-3.5 shrink-0 opacity-70" />;
  }
  if (tab.kind === 'attachment') {
    return <PaperclipIcon className="size-3.5 shrink-0 opacity-70" />;
  }
  if (tab.kind === 'thread-file' && tab.path) {
    return <FileTypeIcon name={tab.path} size="xs" />;
  }
  return <FileIcon className="size-3.5 shrink-0 opacity-70" />;
}
function BoardTabIcon({ boardId }: { boardId: string }) {
  const board = useIssueBoardStore((state) => (boardId ? state.boardById(boardId) : undefined));
  const Icon = resolveBoardIcon(board?.icon ?? 'square-kanban');
  return (
    <span
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded-[4px]',
        entityColorTintClass(board?.color ?? null),
      )}
    >
      <Icon className="size-3" />
    </span>
  );
}
function ThreadTabIcon({ threadId }: { threadId: string }) {
  const thread = useThreadStore((state) => state.items.find((item) => item.id === threadId));
  const agent = useAgentStore((state) =>
    thread ? state.items.find((item) => item.id === thread.agentId) : undefined,
  );
  const kind = thread?.kind ?? 'chat';
  if (kind === 'schedule') {
    return <CalendarClockIcon className="size-3.5 shrink-0 opacity-70" />;
  }
  if (kind === 'webhook') {
    return <EarthIcon className="size-3.5 shrink-0 opacity-70" />;
  }
  if (agent) {
    return <AgentRecordAvatar agent={agent} title={agent.name} />;
  }
  return <MessageSquareIcon className="size-3.5 shrink-0 opacity-70" />;
}
export function useTabLabel(tab: IdeTab): string {
  const title = useThreadStore((state) =>
    (tab.kind === 'thread' || tab.kind === 'schedule' || tab.kind === 'webhook') && tab.threadId
      ? (state.items.find((item) => item.id === tab.threadId)?.title ?? null)
      : null,
  );
  const boardName = useIssueBoardStore((state) =>
    tab.kind === 'board' && tab.boardId ? (state.boardById(tab.boardId)?.name ?? null) : null,
  );
  const agent = useAgentStore((state) =>
    tab.kind === 'spawn' && tab.agentId ? (state.byId(tab.agentId) ?? undefined) : undefined,
  );
  const terminalsQuery = useQuery({
    queryKey: terminalsQueryKey(tab.projectId),
    queryFn: () => listTerminals(tab.projectId),
    enabled: tab.kind === 'terminal' && Boolean(tab.terminalSessionId),
    staleTime: 5000,
  });
  if (tab.kind === 'file' && tab.path) {
    const base = fileBaseName(tab.path);
    return tab.worktreeBranch ? `${base} · ${tab.worktreeBranch}` : base;
  }
  if (tab.kind === 'diff' && tab.path) {
    return fileBaseName(tab.path);
  }
  if (tab.kind === 'attachment' && tab.path) {
    return fileBaseName(tab.path);
  }
  if (tab.kind === 'thread-file' && tab.path) {
    return fileBaseName(tab.path);
  }
  if (tab.kind === 'thread' || tab.kind === 'schedule' || tab.kind === 'webhook') {
    return title || (tab.kind === 'thread' ? 'Thread' : tab.kind);
  }
  if (tab.kind === 'board' && tab.boardId) {
    return boardName ?? 'Board';
  }
  if (tab.kind === 'spawn') {
    return agent?.name ?? 'Spawn';
  }
  if (tab.kind === 'terminal') {
    const session = terminalsQuery.data?.find((item) => item.id === tab.terminalSessionId);
    return session?.title ?? 'Terminal';
  }
  return tab.kind;
}
