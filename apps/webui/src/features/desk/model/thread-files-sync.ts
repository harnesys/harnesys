import type { ThreadFileRoot } from '@harnesys/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { watchThreadFilesChanged } from '@/shared/api/events';

const COALESCE_MS = 250;

export function threadFilesInvalidations(
  orgId: string,
  threadId: string,
  roots: readonly ThreadFileRoot[],
): Array<readonly string[]> {
  const keys: Array<readonly string[]> = [];
  if (roots.includes('attachments')) {
    keys.push(['thread-attachments', threadId], ['thread-artifacts', threadId]);
  }
  if (roots.includes('sandbox') || roots.includes('tool-outputs')) {
    keys.push(['thread-files', orgId, threadId]);
  }
  return keys;
}

export function syncThreadFiles(orgId: string, queryClient: QueryClient): () => void {
  const pending = new Map<string, Set<ThreadFileRoot>>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    const batches = [...pending.entries()];
    pending.clear();
    for (const [threadId, roots] of batches) {
      for (const queryKey of threadFilesInvalidations(orgId, threadId, [...roots])) {
        void queryClient.invalidateQueries({ queryKey });
      }
    }
  };
  const stopWatch = watchThreadFilesChanged(orgId, (frame) => {
    const current = pending.get(frame.threadId) ?? new Set<ThreadFileRoot>();
    for (const root of frame.roots) {
      current.add(root);
    }
    pending.set(frame.threadId, current);
    if (timer === undefined) {
      timer = setTimeout(flush, COALESCE_MS);
    }
  });
  return () => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    stopWatch();
  };
}
