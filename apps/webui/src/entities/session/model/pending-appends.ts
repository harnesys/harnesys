import type { SessionEvent } from '@harnesys/studio-shared';

let pendingByThread = new Map<string, SessionEvent[]>();
const pendingKeys = new Set<string>();
export function enqueuePending(threadId: string, event: SessionEvent): void {
  const buf = pendingByThread.get(threadId);
  if (buf) {
    buf.push(event);
  } else {
    pendingByThread.set(threadId, [event]);
  }
  const key = pendingKeyOf(threadId, event);
  if (key !== undefined) {
    pendingKeys.add(key);
  }
}
export function hasPendingAppend(
  threadId: string,
  runId: string | undefined,
  seq: number | undefined,
): boolean {
  if (runId === undefined || seq === undefined) {
    return false;
  }
  return pendingKeys.has(`${threadId}:${runId}:${seq}`);
}
function pendingKeyOf(threadId: string, event: SessionEvent): string | undefined {
  if (event.runId === undefined || event.seq === undefined) {
    return undefined;
  }
  return `${threadId}:${event.runId}:${event.seq}`;
}
export function takePending(): Map<string, SessionEvent[]> {
  if (pendingByThread.size === 0) {
    return pendingByThread;
  }
  const out = pendingByThread;
  pendingByThread = new Map();
  pendingKeys.clear();
  return out;
}
export function hasPending(): boolean {
  return pendingByThread.size > 0;
}
export function dropPendingThreads(threadIds: string[]): void {
  for (const id of threadIds) {
    pendingByThread.delete(id);
    const prefix = `${id}:`;
    for (const key of pendingKeys) {
      if (key.startsWith(prefix)) {
        pendingKeys.delete(key);
      }
    }
  }
}
let epochTimer: ReturnType<typeof setTimeout> | undefined;
export function scheduleEpochFlush(flush: () => void, ms: number): void {
  if (epochTimer !== undefined) {
    return;
  }
  epochTimer = setTimeout(() => {
    epochTimer = undefined;
    flush();
  }, ms);
}
export function cancelEpochFlush(): void {
  if (epochTimer === undefined) {
    return;
  }
  clearTimeout(epochTimer);
  epochTimer = undefined;
}
