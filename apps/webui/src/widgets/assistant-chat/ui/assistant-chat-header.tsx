import { CheckIcon, GripVerticalIcon, PinIcon, PinOffIcon, PlusIcon } from 'lucide-react';
import { AgentRecordAvatar } from '@/entities/agent';
import { openNewThread } from '@/features/switch-thread';
import { cn } from '@/shared/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { toast } from '@/shared/ui/toast';
import { useAssistantChatStore } from '../model/assistant-chat.store';
import { useAssistantChat } from '../model/use-assistant-chat';

interface AssistantChatHeaderProps {
  onDragStart: (event: React.PointerEvent<HTMLElement>) => void;
  onDragMove: (event: React.PointerEvent<HTMLElement>) => void;
  onDragEnd: (event: React.PointerEvent<HTMLElement>) => void;
  onDragCancel: () => void;
}

export function AssistantChatHeader({
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: AssistantChatHeaderProps) {
  const { agent, agents, threads, thread } = useAssistantChat();
  const setAgent = useAssistantChatStore((state) => state.setAgent);
  const setThread = useAssistantChatStore((state) => state.setThread);
  const pinned = useAssistantChatStore((state) => state.pinned);
  const togglePinned = useAssistantChatStore((state) => state.togglePinned);
  let agentBlock = <span className="px-1 text-muted-foreground text-xs">No agents</span>;
  if (agent) {
    agentBlock = (
      <DropdownMenu>
        <DropdownMenuTrigger
          data-no-drag
          className="flex min-w-0 items-center gap-2 rounded-md px-1 py-2 outline-none"
          title="Switch agent"
          aria-label="Switch agent"
          data-testid="assistant-chat-agent"
        >
          <AgentRecordAvatar agent={agent} size="md" className="size-8" />
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span className="max-w-32 truncate font-medium text-sm">{agent.name}</span>
            <span className="max-w-32 truncate text-[11px] text-muted-foreground">
              {agent.role}
            </span>
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="bottom" className="max-w-64">
          {agents.map((item) => (
            <DropdownMenuItem
              key={item.id}
              className="gap-2"
              onClick={() => {
                setAgent(item.id);
              }}
            >
              <AgentRecordAvatar agent={item} size="sm" />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {item.id === agent.id ? <CheckIcon className="size-3.5" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  return (
    <header
      className="group/header flex h-14 shrink-0 cursor-grab touch-none select-none items-center gap-1.5 border-b bg-muted/40 px-2 transition-colors hover:bg-muted/70 active:cursor-grabbing active:bg-muted"
      data-testid="assistant-chat-header"
      onPointerDown={onDragStart}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragCancel}
    >
      <GripVerticalIcon
        className="size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover/header:text-muted-foreground group-active/header:text-foreground"
        aria-hidden="true"
      />
      {agentBlock}
      <div className="ms-auto flex items-center gap-1">
        {thread ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              data-no-drag
              className="flex min-w-0 items-center gap-1 rounded-md px-2 py-0.5 text-muted-foreground text-xs outline-none hover:bg-muted/60"
              title="Switch thread"
              aria-label="Switch thread"
              data-testid="assistant-chat-thread"
            >
              <span className="truncate">{thread.title}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" className="max-w-64">
              <DropdownMenuItem
                className="gap-2"
                data-testid="assistant-chat-new-thread"
                onClick={() => {
                  if (!agent) {
                    return;
                  }
                  void openNewThread(agent.id, agent.orgId)
                    .then((threadId) => {
                      if (threadId) {
                        setThread(agent.id, threadId);
                      }
                    })
                    .catch((error: unknown) => {
                      toast.add({
                        title: 'Could not start chat',
                        description: error instanceof Error ? error.message : undefined,
                      });
                    });
                }}
              >
                <PlusIcon className="size-3.5" />
                <span className="min-w-0 flex-1 truncate">New chat</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {threads.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  className="gap-2"
                  onClick={() => {
                    if (agent) {
                      setThread(agent.id, item.id);
                    }
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  {item.id === thread.id ? <CheckIcon className="size-3.5" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <button
          type="button"
          data-no-drag
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground',
            pinned && 'bg-muted text-foreground',
          )}
          title={pinned ? 'Unpin assistant' : 'Pin assistant'}
          aria-label={pinned ? 'Unpin assistant' : 'Pin assistant'}
          aria-pressed={pinned}
          data-testid="assistant-chat-pin"
          onClick={() => togglePinned()}
        >
          {pinned ? <PinIcon className="size-4" /> : <PinOffIcon className="size-4" />}
        </button>
      </div>
    </header>
  );
}
