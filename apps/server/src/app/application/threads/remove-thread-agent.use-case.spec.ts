import { describe, expect, test } from 'bun:test';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import { RemoveThreadAgentUseCase } from './remove-thread-agent.use-case.ts';
import {
  MemoryAgents,
  MemoryThreadMembers,
  MemoryThreads,
  memoryAgent,
  memoryThread,
  StubThreadParticipants,
} from './thread.fakes.ts';

function build() {
  const threads = new MemoryThreads();
  const members = new MemoryThreadMembers();
  const agents = new MemoryAgents();
  agents.seed(memoryAgent({ id: 'agent-1' }));
  agents.seed(memoryAgent({ id: 'agent-2' }));
  return {
    threads,
    members,
    useCase: new RemoveThreadAgentUseCase(threads, members, new StubThreadParticipants(), agents),
  };
}

describe('RemoveThreadAgentUseCase', () => {
  test('rejects removing the only agent of a chat thread without touching membership', () => {
    const { threads, members, useCase } = build();
    threads.seed(memoryThread({ id: 'thread-1', kind: 'chat' }));
    members.ensure('org-1', 'thread-1', 'agent-1');

    expect(() =>
      useCase.execute({ orgId: 'org-1', threadId: 'thread-1', agentId: 'agent-1' }),
    ).toThrow(ThreadValidationException);
    expect(members.listByThread('org-1', 'thread-1').map((row) => row.agentId)).toEqual([
      'agent-1',
    ]);
  });

  test('rejects removing the last agent of a group thread', () => {
    const { threads, members, useCase } = build();
    threads.seed(memoryThread({ id: 'thread-1', kind: 'group' }));
    members.ensure('org-1', 'thread-1', 'agent-1');

    expect(() =>
      useCase.execute({ orgId: 'org-1', threadId: 'thread-1', agentId: 'agent-1' }),
    ).toThrow(ThreadValidationException);
    expect(members.listByThread('org-1', 'thread-1')).toHaveLength(1);
  });

  test('moves auto-reply to a remaining member before removing the agent', () => {
    const { threads, members, useCase } = build();
    threads.seed(memoryThread({ id: 'thread-1', kind: 'group', autoReplyAgentId: 'agent-1' }));
    members.ensure('org-1', 'thread-1', 'agent-1');
    members.ensure('org-1', 'thread-1', 'agent-2');

    const summary = useCase.execute({
      orgId: 'org-1',
      threadId: 'thread-1',
      agentId: 'agent-1',
    });

    expect(summary.autoReplyAgentId).toBe('agent-2');
    expect(members.listByThread('org-1', 'thread-1').map((row) => row.agentId)).toEqual([
      'agent-2',
    ]);
  });

  test('rejects removing a non-member', () => {
    const { threads, members, useCase } = build();
    threads.seed(memoryThread({ id: 'thread-1', kind: 'group' }));
    members.ensure('org-1', 'thread-1', 'agent-1');

    expect(() =>
      useCase.execute({ orgId: 'org-1', threadId: 'thread-1', agentId: 'agent-2' }),
    ).toThrow(ThreadNotFoundException);
    expect(members.listByThread('org-1', 'thread-1')).toHaveLength(1);
  });
});
