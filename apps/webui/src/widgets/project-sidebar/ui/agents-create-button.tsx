import { PlusIcon, UsersIcon } from 'lucide-react';
import { openCreateGroupThreadDialog } from '@/features/create-group-thread';
import { openMarketplace } from '@/features/preset-marketplace';
import { Button } from '@/shared/ui/button';

export function useCreateAgentFlow(onCreated?: () => void): () => void {
  return () => {
    void openMarketplace({ kind: 'agent', onCreated });
  };
}

export function AgentsSectionCreateButton({ onCreated }: { onCreated?: () => void }) {
  const createAgent = useCreateAgentFlow(onCreated);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        title="New group thread"
        aria-label="New group thread"
        data-testid="group-create"
        onClick={() => void openCreateGroupThreadDialog()}
      >
        <UsersIcon className="size-3.5 text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
        <span className="sr-only">New group thread</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        title="New agent"
        aria-label="New agent"
        data-testid="agents-create"
        onClick={createAgent}
      >
        <PlusIcon className="size-3.5 text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
        <span className="sr-only">New agent</span>
      </Button>
    </>
  );
}
