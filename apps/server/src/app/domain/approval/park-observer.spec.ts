import { describe, expect, test } from 'bun:test';
import { realpathSync } from 'node:fs';
import type { AskBudget, SessionEvent } from 'harnesys';
import { approvalRequestForPark, type ObservedPark, observeParks } from './park-observer.ts';

function askEvent(budget?: AskBudget): SessionEvent {
  return {
    type: 'ask',
    askId: 'budget/run-1/think/1',
    schema: {},
    source: 'budget',
    prompt: 'Step budget of 40 reached',
    ...(budget === undefined ? {} : { budget }),
  } as SessionEvent;
}

const BUDGET = { kind: 'steps' as const, limit: 40, used: 40, defaultExtend: 10 };

describe('park observer', () => {
  test('carries the budget into the approval request', async () => {
    const parks: ObservedPark[] = [];
    observeParks('thread-1', 'run-1', [askEvent(BUDGET)], (park) => {
      parks.push(park);
    });
    await new Promise<void>((resolve) => {
      queueMicrotask(resolve);
    });
    expect(parks).toHaveLength(1);
    const request = approvalRequestForPark(parks[0] as ObservedPark, undefined);
    expect(request.kind).toBe('spend');
    expect(request.context.budget).toEqual(BUDGET);
    expect(request.options).toEqual(['approve', 'close', 'deny']);
  });

  test('a park without a budget keeps the plain options', async () => {
    const parks: ObservedPark[] = [];
    observeParks('thread-1', 'run-1', [askEvent()], (park) => {
      parks.push(park);
    });
    await new Promise<void>((resolve) => {
      queueMicrotask(resolve);
    });
    const request = approvalRequestForPark(parks[0] as ObservedPark, undefined);
    expect(request.context.budget).toBeUndefined();
    expect(request.options).toEqual(['approve', 'close', 'deny']);
  });

  test('a file tool park becomes a typed file_access approval', () => {
    const park: ObservedPark = {
      runId: 'run-1',
      threadId: 'thread-1',
      askId: 'perm/node/0',
      source: 'permission',
      prompt: 'allow fs.write?',
      tool: { name: 'write_file', input: { path: 'no-such/agent-path.ts' }, toolCallId: 'call-9' },
    };
    const request = approvalRequestForPark(
      park,
      { agentId: 'agent-1' },
      { host: 'host-1', cwd: process.cwd(), runtime: 'container' },
    );
    expect(request.kind).toBe('file_access');
    expect(request.options).toEqual(['deny', 'approve_once', 'approve', 'block_path']);
    expect(request.context.file).toEqual({
      host: 'host-1',
      canonicalPath: `${realpathSync(process.cwd())}/no-such/agent-path.ts`,
      requestedPath: 'no-such/agent-path.ts',
      action: 'edit',
      runtime: 'container',
    });
  });
});
