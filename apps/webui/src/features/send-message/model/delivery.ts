export function duplicateDelivery(input: {
  runId: string | undefined;
  seq: number | undefined;
  appliedCeiling: number;
  queued: boolean;
}): boolean {
  const { runId, seq, appliedCeiling, queued } = input;
  if (runId === undefined || seq === undefined) {
    return false;
  }
  return seq <= appliedCeiling || queued;
}
