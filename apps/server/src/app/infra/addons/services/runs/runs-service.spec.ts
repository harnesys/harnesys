import { describe, expect, test } from 'bun:test';
import { callCtx, FakeRuns, stubThreads, ZeroClock } from '../spec-fakes.ts';
import { RunsHostService } from './runs-service.ts';

describe('runs service', () => {
  test('dispatches through RunDispatchPort and returns the correlation run id', async () => {
    const port = new FakeRuns();
    const svc = new RunsHostService(port, stubThreads(), new ZeroClock());
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
    const svc = new RunsHostService(new FakeRuns(), stubThreads(), new ZeroClock());
    await expect(svc.methods[0]?.handle(callCtx(), { input: 'go' })).rejects.toMatchObject({
      reason: 'invalid_params',
    });
  });

  test('outcome mapping: busy → rate_limited, suppressed → conflict', async () => {
    const busy = new FakeRuns();
    busy.outcome = 'busy';
    const svcBusy = new RunsHostService(busy, stubThreads(), new ZeroClock());
    await expect(
      svcBusy.methods[0]?.handle(callCtx(), { threadId: 't', agentId: 'a', input: 'x' }),
    ).rejects.toMatchObject({ reason: 'rate_limited' });
    const suppressed = new FakeRuns();
    suppressed.outcome = 'suppressed';
    const svcSuppressed = new RunsHostService(suppressed, stubThreads(), new ZeroClock());
    await expect(
      svcSuppressed.methods[0]?.handle(callCtx(), { threadId: 't', agentId: 'a', input: 'x' }),
    ).rejects.toMatchObject({ reason: 'conflict' });
  });

  test('enforces 60 dispatches per minute → quota_exceeded', async () => {
    const svc = new RunsHostService(new FakeRuns(), stubThreads(), new ZeroClock());
    const handle = svc.methods[0]?.handle.bind(null, callCtx());
    for (let i = 0; i < 60; i += 1) {
      await handle?.({ threadId: 't', agentId: 'a', input: 'x' });
    }
    await expect(handle?.({ threadId: 't', agentId: 'a', input: 'x' })).rejects.toMatchObject({
      reason: 'quota_exceeded',
    });
  });

  test('threads.create delegates to CreateThreadUseCase', async () => {
    const useCase = stubThreads('thread-9');
    const svc = new RunsHostService(new FakeRuns(), useCase, new ZeroClock());
    await expect(
      svc.methods[1]?.handle(callCtx(), {
        agentId: '0b8f7d0e-1111-4222-8333-444455556666',
        title: 'New',
      }),
    ).resolves.toEqual({ threadId: 'thread-9' });
    expect(useCase.requests[0]).toMatchObject({ orgId: 'org1', body: { title: 'New' } });
  });
});
