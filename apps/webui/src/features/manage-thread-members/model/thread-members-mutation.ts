import type { ThreadSummary } from '@harnesys/studio-shared';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { updateThreadPolicy } from '@/shared/api';
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
      title: 'Could not update channel',
      description: error instanceof Error ? error.message : 'Request failed',
    });
  }
}

export interface HistoryAnchorInput {
  runId: string;
  threadSeq: number;
}

export function setThreadHistoryAnchor(threadId: string, anchor: HistoryAnchorInput | null): void {
  void mutateThread(() =>
    updateThreadPolicy(
      threadId,
      anchor === null
        ? { historyFromRunId: null, historyFromSeq: null }
        : { historyFromRunId: anchor.runId, historyFromSeq: anchor.threadSeq },
    ),
  );
}
