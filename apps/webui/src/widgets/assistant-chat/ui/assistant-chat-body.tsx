import { type ReactNode, useEffect, useRef } from 'react';
import { HitlPrompt } from '@/features/send-message';
import { openNewThread } from '@/features/switch-thread';
import { cn } from '@/shared/lib/utils';
import { toast } from '@/shared/ui/toast';
import { ChatComposer } from '@/widgets/chat-composer';
import { ThreadPanel } from '@/widgets/chat-transcript';
import { useAssistantChatStore } from '../model/assistant-chat.store';
import { useAssistantChat } from '../model/use-assistant-chat';

export function AssistantChatBody({ open }: { open: boolean }) {
  const { ready, agent, thread } = useAssistantChat();
  useEnsureThread(open);
  let content: ReactNode = (
    <div className="flex flex-1 items-center justify-center px-4 text-center text-muted-foreground text-sm">
      {agent ? 'Starting chat...' : 'No agents yet. Create an agent to start chatting.'}
    </div>
  );
  if (!ready) {
    content = (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Loading...
      </div>
    );
  } else if (agent && thread) {
    content = (
      <>
        <div className="min-h-0 flex-1">
          <ThreadPanel threadId={thread.id} agent={agent} active={open} assistant />
        </div>
        <HitlPrompt threadId={thread.id} />
        <ChatComposer thread={thread} agent={agent} assistant />
      </>
    );
  }
  return (
    <div
      className={cn('flex min-h-0 flex-1 flex-col', !open && 'hidden')}
      data-testid="assistant-chat-body"
    >
      {content}
    </div>
  );
}

function useEnsureThread(open: boolean) {
  const { ready, agent, thread } = useAssistantChat();
  const setThread = useAssistantChatStore((state) => state.setThread);
  const creating = useRef(false);
  useEffect(() => {
    if (!open || !ready || !agent || thread || creating.current) {
      return;
    }
    creating.current = true;
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
      })
      .finally(() => {
        creating.current = false;
      });
  }, [open, ready, agent, thread, setThread]);
}
