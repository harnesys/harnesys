export interface UserEventTarget {
  runId: string;
  seq: number;
}

const PENDING_SEQ = 1;

export function resolveUserEventTarget(input: {
  runId?: string;
  seq?: number;
  activeRunId?: string;
}): UserEventTarget | undefined {
  const known = input.runId || undefined;
  if (known && input.seq !== undefined) {
    return { runId: known, seq: input.seq };
  }
  const pending = known ?? input.activeRunId ?? undefined;
  const pendingRunId = pending || undefined;
  if (!pendingRunId) {
    return undefined;
  }
  return { runId: pendingRunId, seq: PENDING_SEQ };
}
