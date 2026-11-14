import { useState } from 'react';
import type { Agent } from '@/entities/agent';
import type { Thread } from '@/entities/thread';
import { Button } from '@/shared/ui/button';
import { ChatComposer } from '@/widgets/chat-composer';

export function JournalComposer({ thread, agent }: { thread: Thread; agent: Agent }) {
  const [revealed, setRevealed] = useState(false);
  if (revealed) {
    return <ChatComposer thread={thread} agent={agent} />;
  }
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-3" data-testid="journal-continue">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setRevealed(true)}
      >
        Continue
      </Button>
    </div>
  );
}
