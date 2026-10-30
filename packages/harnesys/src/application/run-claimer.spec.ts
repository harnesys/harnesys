import { describe, expect, test } from 'bun:test';
import type {
  RunCreateInput,
  RunLifecycleStatus,
  RunLifecycleStore,
  RunRecord,
  RunTransitionPatch,
} from '../ports/run-lifecycle-store.ts';
import type { RunTarget, RunTargets } from '../ports/run-targets.ts';
import { createRunClaimer } from './run-claimer.ts';
import type { RunEngine } from './run-engine-types.ts';

const RUN_ID = 'run-1';
const THREAD_ID = 'thread-1';

function runRecord(status: RunLifecycleStatus): RunRecord {
  return {
    runId: RUN_ID,
    threadId: THREAD_ID,
    status,
    attempt: 1,
    leaseEpoch: 1,
    lastSeq: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

class FakeLifecycle implements RunLifecycleStore {
  record: RunRecord = runRecord('queued');
  children: RunRecord[] = [];
  stale: RunRecord[] = [];
  failures: string[] = [];

  async create(input: RunCreateInput): Promise<RunRecord> {
    this.record = { ...runRecord('queued'), runId: input.runId, threadId: input.threadId };
    return this.record;
  }
  async get(runId: string): Promise<RunRecord | null> {
    return this.record.runId === runId ? this.record : null;
  }
  async activeByThread(): Promise<RunRecord | null> {
    return null;
  }
  async childrenByParent(parentRunId: string): Promise<RunRecord[]> {
    return this.children.filter((child) => child.parentRunId === parentRunId);
  }
  async claim(): Promise<RunRecord | null> {
    if (this.record.status !== 'queued') {
      return null;
    }
    this.record = { ...this.record, status: 'running', leaseInstanceId: 'i1' };
    return this.record;
  }
  async transition(
    runId: string,
    _expectedEpoch: number,
    patch: RunTransitionPatch,
  ): Promise<RunRecord> {
    let updated = this.record;
    if (this.record.runId === runId) {
      this.record = { ...this.record, status: patch.to };
      updated = this.record;
    }
    this.children = this.children.map((child) => {
      if (child.runId !== runId) {
        return child;
      }
      updated = { ...child, status: patch.to };
      return updated;
    });
    if (patch.to === 'failed') {
      this.failures.push(runId);
    }
    return updated;
  }
  async renewLease(): Promise<boolean> {
    return false;
  }
  async listClaimable(): Promise<RunRecord[]> {
    return this.record.status === 'queued' ? [this.record] : [];
  }
  async listDueTimers(): Promise<RunRecord[]> {
    return [];
  }
  async listStaleRunning(): Promise<RunRecord[]> {
    return this.stale;
  }
}

function engineOf(calls: string[]): RunEngine {
  return {
    async execute(): Promise<void> {
      calls.push('execute');
    },
    stop(): void {},
    abort(): void {},
  } as never;
}

function targetsThrowing(errors: unknown[]): RunTargets {
  return {
    resolve: () => {
      errors.push('resolve');
      throw new Error('snapshot_version');
    },
  };
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
}

describe('run claimer', () => {
  test('fails the run when target resolution throws', async () => {
    const lifecycle = new FakeLifecycle();
    const errors: unknown[] = [];
    const engineCalls: string[] = [];
    const claimer = createRunClaimer({
      lifecycle,
      targets: targetsThrowing(errors),
      engine: engineOf(engineCalls),
      instanceId: 'i1',
      sweepMs: 3_600_000,
    });
    claimer.kick();
    await settle();
    claimer.halt();
    expect(errors).toEqual(['resolve']);
    expect(lifecycle.failures).toEqual([RUN_ID]);
    expect(lifecycle.record.status).toBe('failed');
    expect(engineCalls).toEqual([]);
  });

  test('fails the run when target is unavailable', async () => {
    const lifecycle = new FakeLifecycle();
    const engineCalls: string[] = [];
    const targets: RunTargets = { resolve: () => Promise.resolve(null) };
    const claimer = createRunClaimer({
      lifecycle,
      targets,
      engine: engineOf(engineCalls),
      instanceId: 'i1',
      sweepMs: 3_600_000,
    });
    claimer.kick();
    await settle();
    claimer.halt();
    expect(lifecycle.failures).toEqual([RUN_ID]);
    expect(engineCalls).toEqual([]);
  });

  test('executes the engine for a claimable run', async () => {
    const lifecycle = new FakeLifecycle();
    const engineCalls: string[] = [];
    const target = { state: {} } as RunTarget;
    const claimer = createRunClaimer({
      lifecycle,
      targets: { resolve: () => Promise.resolve(target) },
      engine: engineOf(engineCalls),
      instanceId: 'i1',
      sweepMs: 3_600_000,
    });
    claimer.kick();
    await settle();
    claimer.halt();
    expect(engineCalls).toEqual(['execute']);
    expect(lifecycle.failures).toEqual([]);
  });

  test('reaping a stale root fails its non-terminal children', async () => {
    const lifecycle = new FakeLifecycle();
    lifecycle.record = {
      ...runRecord('running'),
      leaseExpiresAt: Date.now() - 120_000,
      updatedAt: new Date(Date.now() - 120_000).toISOString(),
    };
    lifecycle.stale = [lifecycle.record];
    lifecycle.children = [
      { ...runRecord('running'), runId: 'child-running', parentRunId: RUN_ID },
      { ...runRecord('completed'), runId: 'child-done', parentRunId: RUN_ID },
    ];
    const claimer = createRunClaimer({
      lifecycle,
      targets: { resolve: () => Promise.resolve(null) },
      engine: engineOf([]),
      instanceId: 'i1',
      sweepMs: 3_600_000,
    });
    claimer.kick();
    await settle();
    claimer.halt();
    expect(lifecycle.failures).toEqual([RUN_ID, 'child-running']);
  });
});
