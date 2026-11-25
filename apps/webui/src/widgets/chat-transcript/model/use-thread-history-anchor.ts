import { useThreadStore } from '@/entities/thread';
import { type HistoryAnchorInput, setThreadHistoryAnchor } from '@/features/manage-thread-members';

export interface ThreadHistoryAnchor {
  anchorRunId: string | undefined;
  anchorSeq: number | undefined;
  toggle: (runId: string, threadSeq: number) => void;
}

export function useThreadHistoryAnchor(threadId?: string): ThreadHistoryAnchor {
  const policy = useThreadStore((state) => (threadId ? state.byId(threadId)?.policy : undefined));
  const anchorRunId = policy?.historyFromRunId;
  const anchorSeq = policy?.historyFromSeq;
  const toggle = (runId: string, threadSeq: number) => {
    if (!threadId) {
      return;
    }
    const samePoint = anchorRunId === runId && anchorSeq === threadSeq;
    const next: HistoryAnchorInput | null = samePoint ? null : { runId, threadSeq };
    setThreadHistoryAnchor(threadId, next);
  };
  return { anchorRunId, anchorSeq, toggle };
}
