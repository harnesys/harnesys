import { describe, expect, test } from 'bun:test';
import type { CapabilityScope } from '../../domain/pack.ts';
import type { KnowledgePort } from '../../ports/memory.ts';
import { createKnowledgeTools } from './create-knowledge-tools.ts';

const scope: CapabilityScope = {
  orgId: 'org-1',
  agentId: 'agent-1',
  sourceIds: ['src-shared', 'src-other'],
  threadId: 'thread-1',
};

function fakePort(): KnowledgePort & { calls: { sourceId?: string }[] } {
  const calls: { sourceId?: string }[] = [];
  return {
    calls,
    search: (input) => {
      calls.push({ sourceId: input.sourceId });
      return Promise.resolve([]);
    },
  };
}

const ctx = { cwd: '/tmp', paths: { allow: [] }, agentId: 'agent-1' };

describe('knowledge tools source scope', () => {
  test('explicit source outside scope is not configured', async () => {
    const port = fakePort();
    const tools = createKnowledgeTools({ port, resolveScope: () => scope });
    const search = tools.find((tool) => tool.name === 'knowledge_search');
    const result = await search?.execute({ query: 'q', sourceId: 'src-external' }, ctx);
    expect(result).toEqual({
      error: true,
      code: 'KNOWLEDGE_NOT_CONFIGURED',
      message: 'knowledge sourceIds not configured on capability scope',
    });
    expect(port.calls).toEqual([]);
  });

  test('empty scope without explicit source is not configured', async () => {
    const port = fakePort();
    const tools = createKnowledgeTools({ port, resolveScope: () => ({ ...scope, sourceIds: [] }) });
    const search = tools.find((tool) => tool.name === 'knowledge_search');
    const result = await search?.execute({ query: 'q' }, ctx);
    expect(result).toEqual({
      error: true,
      code: 'KNOWLEDGE_NOT_CONFIGURED',
      message: 'knowledge sourceIds not configured on capability scope',
    });
    expect(port.calls).toEqual([]);
  });

  test('explicit source inside scope passes through', async () => {
    const port = fakePort();
    const tools = createKnowledgeTools({ port, resolveScope: () => scope });
    const search = tools.find((tool) => tool.name === 'knowledge_search');
    await search?.execute({ query: 'q', sourceId: 'src-shared' }, ctx);
    expect(port.calls).toEqual([{ sourceId: 'src-shared' }]);
  });

  test('fallback uses first shared source', async () => {
    const port = fakePort();
    const tools = createKnowledgeTools({ port, resolveScope: () => scope });
    const search = tools.find((tool) => tool.name === 'knowledge_search');
    await search?.execute({ query: 'q' }, ctx);
    expect(port.calls).toEqual([{ sourceId: 'src-shared' }]);
  });
});
