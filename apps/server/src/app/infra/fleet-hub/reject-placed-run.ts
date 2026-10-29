import type { SessionEvent } from 'harnesys';
import type { PlaceRunInput } from './work-executor.compose.ts';

export function rejectPlacedRun(input: PlaceRunInput, message: string): void {
  const seq = (input.envelope.relayLastSeq ?? 0) + 1;
  const event = {
    type: 'run.failed',
    message,
    seq,
    runId: input.envelope.runId,
  } as SessionEvent;
  const events = [event];
  try {
    input.persistEvents?.(events);
  } catch {
    // spool best-effort
  }
  try {
    input.sendFrame(
      JSON.stringify({
        kind: 'RUN_EVENT',
        runId: input.envelope.runId,
        leaseEpoch: input.envelope.leaseEpoch,
        fromSeq: input.envelope.relayLastSeq ?? 0,
        events,
      }),
    );
  } catch {
    // dialer reconnect handles transport
  }
}
