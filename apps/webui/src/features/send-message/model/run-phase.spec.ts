import { describe, expect, test } from 'bun:test';
import type { RunLifecycleStatus } from '@harnesys/contracts';
import type { ThreadActiveRun } from '@harnesys/studio-shared';
import { type RunPhaseSignals, runPhaseOf } from './run-phase.ts';

function phase(input: Partial<RunPhaseSignals>) {
  return runPhaseOf({ clientRun: false, pendingAsk: false, serverRun: null, ...input });
}

function run(status: RunLifecycleStatus): ThreadActiveRun {
  return { runId: '00000000-0000-4000-8000-000000000000', status };
}

describe('runPhaseOf', () => {
  test('is live while the client tracks a run the server snapshot has not caught up with', () => {
    expect(phase({ clientRun: true })).toBe('live');
  });

  test('is live from the server run after a fresh page load', () => {
    expect(phase({ serverRun: run('running') })).toBe('live');
  });

  test('is parked on a pending ask even while the client still tracks the run', () => {
    expect(phase({ clientRun: true, pendingAsk: true })).toBe('parked');
  });

  test('is parked from the server status before the ask reaches the client', () => {
    expect(phase({ serverRun: run('needs_input') })).toBe('parked');
  });

  test('is queued while the run waits for placement', () => {
    expect(phase({ serverRun: run('queued') })).toBe('queued');
    expect(phase({ serverRun: run('waiting') })).toBe('queued');
  });

  test('is idle without a client run or an active server run', () => {
    expect(phase({})).toBe('idle');
  });
});
