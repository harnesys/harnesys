import type { ThreadActiveRun } from '@harnesys/studio-shared';

export type RunPhase = 'idle' | 'live' | 'queued' | 'parked';

export interface RunPhaseSignals {
  clientRun: boolean;
  pendingAsk: boolean;
  serverRun: ThreadActiveRun | null;
}

export function runPhaseOf(signals: RunPhaseSignals): RunPhase {
  const status = signals.serverRun?.status ?? null;
  if (signals.pendingAsk || status === 'needs_input') {
    return 'parked';
  }
  if (signals.clientRun || status === 'running') {
    return 'live';
  }
  if (status === 'queued' || status === 'waiting') {
    return 'queued';
  }
  return 'idle';
}
