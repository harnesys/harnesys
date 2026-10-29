import { PlusIcon } from 'lucide-react';
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
  );
}
