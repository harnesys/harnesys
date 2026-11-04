import { describe, expect, test } from 'bun:test';
import type {
  CapabilityScope,
  EpisodicHit,
  EpisodicSearchInput,
  RunEventStore,
  SessionEvent,
} from 'harnesys';
import type { AgentRecord } from '../../../domain/agent/agent.ts';
import type { ThreadRecord } from '../../../domain/thread/thread.ts';
import { FakeTail } from './org-manager.port.fakes.ts';
import { OrgThreadsPort } from './org-threads.port.ts';
import { MemoryAgents, MemoryThreadAgents, MemoryThreads } from './wire-org-packs.fakes.ts';

const SCOPE: CapabilityScope = {
  orgId: 'org-1',
  agentId: 'agent-1',
  sourceIds: [],
  threadId: 'thread-1',
};

function thread(id: string, orgId = 'org-1'): ThreadRecord {
  return {
    id,
    orgId,
    title: id,
    kind: 'chat',
    autoReplyAgentId: null,
    policy: { version: 1 },
    lastThreadSeq: 0,
    conversationCount: 0,
    parentThreadId: null,
    forkAt: null,
    inheritedEventCount: 0,
    metadata: {},
    runProfileId: null,
    runDirectory: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastReadAt: '2026-01-01T00:00:00.000Z',
  };
}

function agent(id: string): AgentRecord {
  return {
    id,
    orgId: 'org-1',
    name: id,
    role: 'coder',
    instructions: '',
    modelId: 'model-1',
    budgetUsdDaily: 10,
    level: 'top',
    parentId: null,
    executionProfileId: null,
    status: 'active',
    sharedSourceIds: [],
    sourceLevels: {},
    secretNames: [],
    skills: [],
    mcpServers: [],
    enabledPlugins: {},
    defaultModeId: null,
    config: {},
    hooks: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function message(threadSeq: number, text: string): SessionEvent {
  return { type: 'user', text, threadSeq, conversational: true };
}

class FakeEvents implements RunEventStore {
  byThread = new Map<string, SessionEvent[]>();

  async listByThread(threadId: string): Promise<SessionEvent[]> {
    return this.byThread.get(threadId) ?? [];
  }

  append(): Promise<SessionEvent[]> {
    throw new Error('not used');
  }

  tail(): Promise<SessionEvent[]> {
    throw new Error('not used');
  }

  latestSeq(): Promise<number> {
    throw new Error('not used');
  }

  hasRun(): Promise<boolean> {
    throw new Error('not used');
  }

  appendForThread(): SessionEvent[] {
    throw new Error('not used');
  }

  truncateThreadFrom(): Promise<never> {
    throw new Error('not used');
  }

  removeEvent(): Promise<never> {
    throw new Error('not used');
  }

  next(): number {
    throw new Error('not used');
  }
}

class FakeEpisodic {
  calls: EpisodicSearchInput[] = [];
  hits: EpisodicHit[] = [];

  async search(input: EpisodicSearchInput): Promise<EpisodicHit[]> {
    this.calls.push(input);
    return this.hits;
  }
}

function setup() {
  const threads = new MemoryThreads();
  threads.rows = [thread('thread-1'), thread('thread-2'), thread('thread-9', 'org-9')];
  const threadAgents = new MemoryThreadAgents();
  const agents = new MemoryAgents();
  agents.rows = [agent('agent-1')];
  const events = new FakeEvents();
  const episodes = new FakeEpisodic();
  const tail = new FakeTail();
  const port = new OrgThreadsPort({
    threads,
    threadAgents,
    agents,
    events: events,
    episodic: episodes,
    tail,
  });
  return { port, events, episodes, tail };
}

describe('OrgThreadsPort history', () => {
  test('reads the current thread by default', async () => {
    const { port, events } = setup();
    events.byThread.set('thread-1', [message(1, 'hello'), message(2, 'world')]);
    const page = await port.history(SCOPE, {});
    expect(page.messages.map((row) => row.text)).toEqual(['hello', 'world']);
  });

  test('rejects a thread from another org', async () => {
    const { port } = setup();
    await expect(port.history(SCOPE, { threadId: 'thread-9' })).rejects.toThrow(
      'thread not found: thread-9',
    );
  });
});

describe('OrgThreadsPort search', () => {
  test('searches the current thread transcript by default', async () => {
    const { port, events, episodes } = setup();
    events.byThread.set('thread-1', [message(1, 'deploy checklist')]);
    const result = await port.search(SCOPE, { query: 'deploy' });
    expect(result.hits.map((row) => row.text)).toEqual(['deploy checklist']);
    expect(episodes.calls).toHaveLength(0);
  });

  test('scope=org delegates to episodic with conversational-only rows', async () => {
    const { port, episodes } = setup();
    episodes.hits = [
      { threadId: 'thread-2', threadSeq: 4, role: 'assistant', text: 'done: deploy' },
    ];
    const result = await port.search(SCOPE, { query: 'deploy', scope: 'org' });
    expect(episodes.calls).toEqual([
      {
        orgId: 'org-1',
        query: 'deploy',
        limit: 10,
        conversationalOnly: true,
      },
    ]);
    expect(result.hits).toEqual([
      { threadId: 'thread-2', threadSeq: 4, role: 'assistant', text: 'done: deploy' },
    ]);
    expect(result.hasMore).toBe(false);
  });

  test('scope=org validates a narrowing threadId against the org', async () => {
    const { port, episodes } = setup();
    await expect(
      port.search(SCOPE, { query: 'deploy', scope: 'org', threadId: 'thread-9' }),
    ).rejects.toThrow('thread not found: thread-9');
    expect(episodes.calls).toHaveLength(0);
  });
});

describe('OrgThreadsPort tail', () => {
  test('clamps the limit and checks the org boundary', async () => {
    const { port, tail } = setup();
    await port.tail(SCOPE, 'thread-2', 500);
    expect(tail.calls).toEqual([{ orgId: 'org-1', threadId: 'thread-2', limit: 100 }]);
    await expect(port.tail(SCOPE, 'thread-9', 10)).rejects.toThrow('thread not found: thread-9');
  });
});
