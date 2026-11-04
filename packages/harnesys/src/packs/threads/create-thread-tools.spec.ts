import { describe, expect, test } from 'bun:test';
import type { CapabilityScope } from '../../domain/pack.ts';
import type { ThreadsPort } from '../../ports/threads.ts';
import { createThreadTools } from './create-thread-tools.ts';

const scope: CapabilityScope = {
  orgId: 'org-1',
  agentId: 'agent-1',
  sourceIds: [],
  threadId: 'thread-1',
};

const ctx = { cwd: '/tmp', paths: { allow: [] }, agentId: 'agent-1' };

class FakeThreads implements ThreadsPort {
  calls: Array<{ method: string; scope: CapabilityScope }> = [];

  list(input: CapabilityScope) {
    this.calls.push({ method: 'list', scope: input });
    return Promise.resolve([
      {
        id: 'thread-1',
        title: 'current',
        kind: 'chat',
        agentId: 'agent-1',
        agentName: 'coder',
        hasSchedule: false,
      },
    ]);
  }

  history(input: CapabilityScope) {
    this.calls.push({ method: 'history', scope: input });
    return Promise.resolve({ messages: [], hasMore: false, oldestSeq: null });
  }

  search(input: CapabilityScope) {
    this.calls.push({ method: 'search', scope: input });
    return Promise.resolve({ hits: [], hasMore: false });
  }

  tail(input: CapabilityScope, threadId: string, limit: number) {
    this.calls.push({ method: 'tail', scope: input });
    expect(threadId).toBe('thread-2');
    expect(limit).toBe(20);
    return Promise.resolve([]);
  }
}

function toolMap(port: ThreadsPort) {
  return new Map(
    createThreadTools({ threads: port, resolveScope: () => scope }).map((tool) => [
      tool.name,
      tool,
    ]),
  );
}

describe('threads pack tools', () => {
  test('registers the full threads family', () => {
    const tools = createThreadTools({ threads: new FakeThreads(), resolveScope: () => scope });
    expect(tools.map((tool) => tool.name)).toEqual([
      'threads_list',
      'threads_history',
      'threads_search',
      'threads_tail',
    ]);
  });

  test('forwards the live scope and parsed input', async () => {
    const port = new FakeThreads();
    const byName = toolMap(port);
    const listed = await byName.get('threads_list')?.execute({}, ctx);
    expect(listed).toMatchObject({ threads: [{ current: true, hasSchedule: false }] });
    await byName.get('threads_history')?.execute({ beforeSeq: 4, limit: 2 }, ctx);
    await byName.get('threads_search')?.execute({ query: 'deploy', scope: 'org' }, ctx);
    await byName.get('threads_tail')?.execute({ threadId: 'thread-2' }, ctx);
    expect(port.calls.map((call) => call.method)).toEqual(['list', 'history', 'search', 'tail']);
    expect(port.calls.every((call) => call.scope === scope)).toBe(true);
  });
});
