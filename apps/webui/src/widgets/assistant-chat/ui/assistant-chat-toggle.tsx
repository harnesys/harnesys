import { SparklesIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { useAssistantChatStore } from '../model/assistant-chat.store';

export function AssistantChatToggle({ className }: { className?: string }) {
  const visible = useAssistantChatStore((state) => state.visible);
  const toggleVisible = useAssistantChatStore((state) => state.toggleVisible);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title="Assistant"
      aria-label="Assistant"
      aria-pressed={visible}
      className={cn('text-muted-foreground', visible && 'bg-muted text-foreground', className)}
      data-testid="assistant-chat-toggle"
      onClick={toggleVisible}
    >
      <SparklesIcon />
    </Button>
  );
}
