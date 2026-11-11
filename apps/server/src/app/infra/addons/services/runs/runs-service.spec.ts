import { describe, expect, test } from 'bun:test';
import { ThreadNotFoundException } from '../../../../domain/thread/thread.error.ts';
import { callCtx, FakeRuns, stubCancelRun, stubThreads, ZeroClock } from '../spec-fakes.ts';
import { RunsHostService } from './runs-service.ts';

describe('runs service', () => {
  test('dispatches through RunDispatchPort and returns the correlation run id', async () => {
    const port = new FakeRuns();
    const svc = new RunsHostService(port, stubThreads(), stubCancelRun(), new ZeroClock());
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
    );
    await expect(svc.methods[0]?.handle(callCtx(), { input: 'go' })).rejects.toMatchObject({
      reason: 'invalid_params',
    });
  });

  test('outcome mapping: busy → rate_limited, suppressed → conflict', async () => {
    const busy = new FakeRuns();
    busy.outcome = 'busy';
    const svcBusy = new RunsHostService(busy, stubThreads(), stubCancelRun(), new ZeroClock());
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
    const svc = new RunsHostService(new FakeRuns(), stubThreads(), useCase, new ZeroClock());
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
    );
    const cancelSpec = svc.methods.find((method) => method.name === 'runs.cancel');
    await expect(
      cancelSpec?.handle(callCtx(), { threadId: 't1', runId: 'run-x' }),
    ).rejects.toMatchObject({ reason: 'not_found' });
  });

  test('threads.create delegates to CreateThreadUseCase', async () => {
    const useCase = stubThreads('thread-9');
    const svc = new RunsHostService(new FakeRuns(), useCase, stubCancelRun(), new ZeroClock());
    await expect(
      svc.methods[2]?.handle(callCtx(), {
        agentId: '0b8f7d0e-1111-4222-8333-444455556666',
        title: 'New',
      }),
    ).resolves.toEqual({ threadId: 'thread-9' });
    expect(useCase.requests[0]).toMatchObject({ orgId: 'org1', body: { title: 'New' } });
  });
});
