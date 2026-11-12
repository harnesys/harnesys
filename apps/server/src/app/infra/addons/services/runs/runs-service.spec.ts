import { describe, expect, test } from 'bun:test';
import { ThreadNotFoundException } from '../../../../domain/thread/thread.error.ts';
import { callCtx, FakeRuns, stubCancelRun, stubThreads, ZeroClock } from '../spec-fakes.ts';
import { stubCompact, stubListThreadRuns } from '../spec-fakes-reads.ts';
import { RunsHostService } from './runs-service.ts';

describe('runs service', () => {
  test('dispatches through RunDispatchPort and returns the correlation run id', async () => {
    const port = new FakeRuns();
    const svc = new RunsHostService(
      port,
      stubThreads(),
      stubCancelRun(),
      new ZeroClock(),
      stubListThreadRuns(),
      stubCompact(),
    );
    await expect(
      svc.methods[0]?.handle(callCtx(), { threadId: 't1', agentId: 'a1', input: 'go' }),
    ).resolves.toEqual({ runId: 'corr-1' });
    expect(port.inputs[0]).toMatchObject({
      orgId: 'org1',
      threadId: 't1',
      agentId: 'a1',
      text: 'go',
    });
  });

  test('missing threadId/agentId → invalid_params', async () => {
    const svc = new RunsHostService(
      new FakeRuns(),
      stubThreads(),
      stubCancelRun(),
      new ZeroClock(),
      stubListThreadRuns(),
      stubCompact(),
    );
    await expect(svc.methods[0]?.handle(callCtx(), { input: 'go' })).rejects.toMatchObject({
      reason: 'invalid_params',
    });
  });

  test('outcome mapping: busy → rate_limited, suppressed → conflict', async () => {
    const busy = new FakeRuns();
    busy.outcome = 'busy';
    const svcBusy = new RunsHostService(
      busy,
      stubThreads(),
      stubCancelRun(),
      new ZeroClock(),
      stubListThreadRuns(),
      stubCompact(),
    );
    await expect(
      svcBusy.methods[0]?.handle(callCtx(), { threadId: 't', agentId: 'a', input: 'x' }),
    ).rejects.toMatchObject({ reason: 'rate_limited' });
    const suppressed = new FakeRuns();
    suppressed.outcome = 'suppressed';
    const svcSuppressed = new RunsHostService(
      suppressed,
      stubThreads(),
      stubCancelRun(),
      new ZeroClock(),
      stubListThreadRuns(),
      stubCompact(),
    );
    await expect(
      svcSuppressed.methods[0]?.handle(callCtx(), { threadId: 't', agentId: 'a', input: 'x' }),
    ).rejects.toMatchObject({ reason: 'conflict' });
  });

  test('enforces 60 dispatches per minute → quota_exceeded', async () => {
    const svc = new RunsHostService(
      new FakeRuns(),
      stubThreads(),
      stubCancelRun(),
      new ZeroClock(),
      stubListThreadRuns(),
      stubCompact(),
    );
    const handle = svc.methods[0]?.handle.bind(null, callCtx());
    for (let i = 0; i < 60; i += 1) {
      await handle?.({ threadId: 't', agentId: 'a', input: 'x' });
    }
    await expect(handle?.({ threadId: 't', agentId: 'a', input: 'x' })).rejects.toMatchObject({
      reason: 'quota_exceeded',
    });
  });

  test('cancel delegates to CancelRunUseCase behind the runs.dispatch permission', async () => {
    const useCase = stubCancelRun();
    const svc = new RunsHostService(
      new FakeRuns(),
      stubThreads(),
      useCase,
      new ZeroClock(),
      stubListThreadRuns(),
      stubCompact(),
    );
    const cancelSpec = svc.methods.find((method) => method.name === 'runs.cancel');
    expect(cancelSpec?.permission).toBe('runs.dispatch');
    await expect(
      cancelSpec?.handle(callCtx(), { threadId: 't1', runId: 'run-1' }),
    ).resolves.toEqual({ ok: true });
    expect(useCase.requests[0]).toMatchObject({ orgId: 'org1', threadId: 't1', runId: 'run-1' });
  });

  test('cancel maps unknown thread/run to not_found', async () => {
    const svc = new RunsHostService(
      new FakeRuns(),
      stubThreads(),
      stubCancelRun(new ThreadNotFoundException('run-x')),
      new ZeroClock(),
      stubListThreadRuns(),
      stubCompact(),
    );
    const cancelSpec = svc.methods.find((method) => method.name === 'runs.cancel');
    await expect(
      cancelSpec?.handle(callCtx(), { threadId: 't1', runId: 'run-x' }),
    ).rejects.toMatchObject({ reason: 'not_found' });
  });

  test('threads.create delegates to CreateThreadUseCase', async () => {
    const useCase = stubThreads('thread-9');
    const svc = new RunsHostService(
      new FakeRuns(),
      useCase,
      stubCancelRun(),
      new ZeroClock(),
      stubListThreadRuns(),
      stubCompact(),
    );
    await expect(
      svc.methods[2]?.handle(callCtx(), {
        agentId: '0b8f7d0e-1111-4222-8333-444455556666',
        title: 'New',
      }),
    ).resolves.toEqual({ threadId: 'thread-9' });
    expect(useCase.requests[0]).toMatchObject({ orgId: 'org1', body: { title: 'New' } });
  });

  test('runs.list delegates and maps createdAt to startedAt behind runs.read', async () => {
    const useCase = stubListThreadRuns([
      { runId: 'run-1', status: 'completed', createdAt: '2026-01-01T00:00:00Z', agentId: 'a1' },
      { runId: 'run-2', status: 'running', createdAt: '2026-01-01T00:01:00Z', agentId: null },
    ]);
    const svc = new RunsHostService(
      new FakeRuns(),
      stubThreads(),
      stubCancelRun(),
      new ZeroClock(),
      useCase,
      stubCompact(),
    );
    const listSpec = svc.methods.find((method) => method.name === 'runs.list');
    expect(listSpec?.permission).toBe('runs.read');
    await expect(listSpec?.handle(callCtx(), { threadId: 't1' })).resolves.toEqual({
      runs: [
        { runId: 'run-1', status: 'completed', startedAt: '2026-01-01T00:00:00Z', agentId: 'a1' },
        { runId: 'run-2', status: 'running', startedAt: '2026-01-01T00:01:00Z', agentId: null },
      ],
    });
    expect(useCase.requests[0]).toMatchObject({ orgId: 'org1', threadId: 't1' });
  });

  test('runs.list maps unknown thread to not_found', async () => {
    const svc = new RunsHostService(
      new FakeRuns(),
      stubThreads(),
      stubCancelRun(),
      new ZeroClock(),
      stubListThreadRuns([], new ThreadNotFoundException('t1')),
      stubCompact(),
    );
    const listSpec = svc.methods.find((method) => method.name === 'runs.list');
    await expect(listSpec?.handle(callCtx(), { threadId: 't1' })).rejects.toMatchObject({
      reason: 'not_found',
    });
  });

  test('threads.compact delegates the result union behind threads.compact', async () => {
    const useCase = stubCompact({
      compacted: true,
      id: 'snap-1',
      coveredFrom: 0,
      coveredUntil: 10,
      tokensBefore: 1000,
      tokensAfter: 200,
    });
    const svc = new RunsHostService(
      new FakeRuns(),
      stubThreads(),
      stubCancelRun(),
      new ZeroClock(),
      stubListThreadRuns(),
      useCase,
    );
    const compactSpec = svc.methods.find((method) => method.name === 'threads.compact');
    expect(compactSpec?.permission).toBe('threads.compact');
    await expect(compactSpec?.handle(callCtx(), { threadId: 't1' })).resolves.toEqual({
      compacted: true,
      id: 'snap-1',
      coveredFrom: 0,
      coveredUntil: 10,
      tokensBefore: 1000,
      tokensAfter: 200,
    });
    expect(useCase.requests[0]).toMatchObject({ orgId: 'org1', threadId: 't1' });
  });

  test('threads.compact enforces 6 per minute → quota_exceeded', async () => {
    const svc = new RunsHostService(
      new FakeRuns(),
      stubThreads(),
      stubCancelRun(),
      new ZeroClock(),
      stubListThreadRuns(),
      stubCompact(),
    );
    const compactSpec = svc.methods.find((method) => method.name === 'threads.compact');
    const handle = compactSpec?.handle.bind(null, callCtx());
    for (let i = 0; i < 6; i += 1) {
      await handle?.({ threadId: 't1' });
    }
    await expect(handle?.({ threadId: 't1' })).rejects.toMatchObject({
      reason: 'quota_exceeded',
    });
  });
});
