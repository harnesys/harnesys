import type { ThreadSummary } from '@harnesys/studio-shared';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { toast } from '@/shared/ui/toast';

export function applyThreadSummary(summary: ThreadSummary): void {
  const store = useThreadStore.getState();
  const current = store.byId(summary.id);
  const next = toClientThread(summary);
  store.upsert(current ? { ...current, ...next } : next);
}

export async function mutateThread(run: () => Promise<ThreadSummary>): Promise<void> {
  try {
    applyThreadSummary(await run());
  } catch (error) {
    toast.add({
      title: 'Could not update group',
      description: error instanceof Error ? error.message : 'Request failed',
    });
  }
}
