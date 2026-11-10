import { describe, expect, test } from 'bun:test';
import type { AcceptedRunResponse } from '@harnesys/contracts';
import { RunConflictException } from '../../domain/thread/thread.error.ts';
import { NullLogger } from './addons.fakes.ts';
import { ThreadRunDispatchService } from './run-dispatch.service.ts';

function accepted(): AcceptedRunResponse {
  return {
    status: 'queued',
    runId: '00000000-0000-4000-8000-000000000001',
    threadId: '00000000-0000-4000-8000-000000000002',
  };
}

function build(queue: Array<AcceptedRunResponse | Error>) {
  let index = 0;
  const sendThreadRun = {
    execute: async () => {
      const next = queue[index];
      index += 1;
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
  const service = new ThreadRunDispatchService(sendThreadRun as never, new NullLogger());
  return service;
}

const INPUT = {
  orgId: 'org1',
  threadId: 'th1',
  agentId: 'ag1',
  text: 'hello',
  runKey: 'k1',
} as const;

describe('ThreadRunDispatchService', () => {
  test('maps acceptance to fired, returns the accepted run id, reuses runKey as correlationId', async () => {
    const service = build([accepted()]);
    expect(await service.dispatch(INPUT)).toEqual({
      outcome: 'fired',
      runId: '00000000-0000-4000-8000-000000000001',
    });
  });

  test('maps run conflict to busy', async () => {
    const service = build([new RunConflictException('run in flight')]);
    expect(await service.dispatch(INPUT)).toEqual({ outcome: 'busy', runId: null });
  });

  test('maps other failures to failed', async () => {
    const service = build([new Error('boom')]);
    expect(await service.dispatch(INPUT)).toEqual({ outcome: 'failed', runId: null });
  });
});
