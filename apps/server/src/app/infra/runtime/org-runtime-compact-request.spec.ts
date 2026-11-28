import { expect, test } from 'bun:test';
import type {
  CompactionOutcome,
  CompactionRequest,
  RunCreateInput,
  RunLifecycleStatus,
  RunRecord,
} from 'harnesys';
import { COMPACTION_NOT_CONFIGURED_CODE } from 'harnesys';
import { CompactionNotConfiguredException } from '../../domain/thread/thread.error.ts';
import { toThreadRecord } from '../../domain/thread/thread.ts';
import { type CompactRequestDeps, requestThreadCompact } from './org-runtime-compact-request.ts';
import type { CompactionChannel } from './org-runtime-compaction-channel.ts';

const THREAD_ID = 'thread-1';

const COMPLETED: CompactionOutcome = {
  compacted: true,
  id: 'k1',
  coveredFrom: 0,
  coveredUntil: 4,
  tokensBefore: 100,
  tokensAfter: 20,
};

function threadRecord() {
  return toThreadRecord({
    id: THREAD_ID,
    orgId: 'org-1',
    title: 't',
    kind: 'chat',
    parentThreadId: null,
    forkAt: null,
    inheritedEventCount: 0,
    metadata: {},
    runProfileId: null,
    runDirectory: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastReadAt: new Date().toISOString(),
  });
}

function runRecordOf(runId: string, status: RunLifecycleStatus): RunRecord {
  return {
    runId,
    threadId: THREAD_ID,
    status,
    attempt: 1,
    leaseEpoch: 1,
    lastSeq: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

interface FakeChannel {
  channel: CompactionChannel;
  enqueued: CompactionRequest[];
  withdrawn: string[];
  calls: string[];
  setOutcome: (outcome: CompactionOutcome) => void;
  setPending: (pending: boolean) => void;
}

function fakeChannel(calls: string[]): FakeChannel {
  const enqueued: CompactionRequest[] = [];
  const withdrawn: string[] = [];
  let outcome: CompactionOutcome = COMPLETED;
  let pending = false;
  const channel: CompactionChannel = {
    request: () => Promise.resolve(null),
    settle: () => Promise.resolve(),
    enqueue: (request) => {
      enqueued.push(request);
      calls.push('enqueue');
      return Promise.resolve();
    },
    awaitOutcome: () => {
      calls.push('await');
      return Promise.resolve(outcome);
    },
    withdraw: (requestId) => {
      withdrawn.push(requestId);
      return Promise.resolve();
    },
    hasPending: () => pending,
  };
  return {
    channel,
    enqueued,
    withdrawn,
    calls,
    setOutcome: (next) => {
      outcome = next;
    },
    setPending: (next) => {
      pending = next;
    },
  };
}

interface Harness {
  deps: CompactRequestDeps;
  fake: FakeChannel;
  created: Array<{ run: RunCreateInput; events: unknown[] }>;
  kicks: number;
  accepted: string[];
}

function harness(active: RunRecord | null): Harness {
  const calls: string[] = [];
  const fake = fakeChannel(calls);
  const created: Array<{ run: RunCreateInput; events: unknown[] }> = [];
  const accepted: string[] = [];
  const state = { kicks: 0 };
  const deps: CompactRequestDeps = {
    channel: fake.channel,
    lifecycle: {
      activeByThread: () => Promise.resolve(active),
      create: (run, events = []) => {
        created.push({ run, events });
        return Promise.resolve(runRecordOf(run.runId, 'queued'));
      },
    },
    threadAgentIds: () => ['agent-1'],
    findThreadRecord: (threadId) => (threadId === THREAD_ID ? threadRecord() : undefined),
    agentNameOf: () => 'Agent One',
    kick: () => {
      state.kicks += 1;
      calls.push('kick');
    },
  };
  return {
    deps,
    fake,
    created,
    accepted,
    get kicks() {
      return state.kicks;
    },
  };
}

test('active run: enqueues against the active run and reports it before awaiting', async () => {
  const h = harness(runRecordOf('run-active', 'running'));
  const result = await requestThreadCompact(
    h.deps,
    THREAD_ID,
    new AbortController().signal,
    (runId) => h.accepted.push(runId),
  );
  expect(result).toEqual(COMPLETED);
  expect(h.fake.enqueued).toHaveLength(1);
  expect(h.fake.enqueued[0]?.targetRunId).toBe('run-active');
  expect(h.accepted).toEqual(['run-active']);
  expect(h.created).toHaveLength(0);
  expect(h.kicks).toBe(1);
  expect(h.fake.calls.indexOf('enqueue')).toBeLessThan(h.fake.calls.indexOf('await'));
});

test('idle thread: creates a compact-only run without events and targets it', async () => {
  const h = harness(null);
  const result = await requestThreadCompact(
    h.deps,
    THREAD_ID,
    new AbortController().signal,
    (runId) => h.accepted.push(runId),
  );
  expect(result).toEqual(COMPLETED);
  expect(h.created).toHaveLength(1);
  expect(h.created[0]?.run.purpose).toBe('compact');
  expect(h.created[0]?.run.agentId).toBe('agent-1');
  expect(h.created[0]?.events).toEqual([]);
  const runId = h.created[0]?.run.runId ?? '';
  expect(h.fake.enqueued[0]?.targetRunId).toBe(runId);
  expect(h.accepted).toEqual([runId]);
});

test('paused run and pending request short-circuit without a run', async () => {
  for (const status of ['needs_input', 'waiting'] as const) {
    const h = harness(runRecordOf('run-paused', status));
    const result = await requestThreadCompact(h.deps, THREAD_ID, new AbortController().signal);
    expect(result).toEqual({ compacted: false, reason: 'run-paused' });
    expect(h.fake.enqueued).toHaveLength(0);
    expect(h.created).toHaveLength(0);
  }
  const h = harness(null);
  h.fake.setPending(true);
  const result = await requestThreadCompact(h.deps, THREAD_ID, new AbortController().signal);
  expect(result).toEqual({ compacted: false, reason: 'compaction-in-progress' });
  expect(h.fake.enqueued).toHaveLength(0);
});

test('outcome mapping: skip reason passes, errors throw, not-configured maps, cancel withdraws', async () => {
  const skipped = harness(runRecordOf('run-active', 'running'));
  skipped.fake.setOutcome({ compacted: false, reason: 'empty-history' });
  expect(await requestThreadCompact(skipped.deps, THREAD_ID, new AbortController().signal)).toEqual(
    { compacted: false, reason: 'empty-history' },
  );

  const failed = harness(runRecordOf('run-active', 'running'));
  failed.fake.setOutcome({ compacted: false, error: 'model exploded' });
  await expect(
    requestThreadCompact(failed.deps, THREAD_ID, new AbortController().signal),
  ).rejects.toThrow('model exploded');

  const unconfigured = harness(runRecordOf('run-active', 'running'));
  unconfigured.fake.setOutcome({
    compacted: false,
    error: 'compaction is not configured',
    code: COMPACTION_NOT_CONFIGURED_CODE,
  });
  await expect(
    requestThreadCompact(unconfigured.deps, THREAD_ID, new AbortController().signal),
  ).rejects.toBeInstanceOf(CompactionNotConfiguredException);

  const cancelled = harness(runRecordOf('run-active', 'running'));
  cancelled.fake.setOutcome({ compacted: false, reason: 'cancelled' });
  expect(
    await requestThreadCompact(cancelled.deps, THREAD_ID, new AbortController().signal),
  ).toEqual({ compacted: false, reason: 'cancelled' });
  const cancelledRequestId = cancelled.fake.enqueued[0]?.requestId ?? '';
  expect(cancelled.fake.withdrawn).toEqual([cancelledRequestId]);
});
