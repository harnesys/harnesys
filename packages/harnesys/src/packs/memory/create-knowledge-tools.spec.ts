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

function fakePort(
  indexed: readonly string[] = [],
  names: Record<string, string> = {},
): KnowledgePort & { calls: { sourceId?: string }[] } {
  const calls: { sourceId?: string }[] = [];
  return {
    calls,
    indexedSources: (sourceIds) => Promise.resolve(sourceIds.filter((id) => indexed.includes(id))),
    sourceNames: (sourceIds) =>
      Promise.resolve(
        Object.fromEntries(
          sourceIds.flatMap((id) => {
            const name = names[id];
            return name === undefined ? [] : [[id, name]];
          }),
        ),
      ),
    search: (input) => {
      calls.push({ sourceId: input.sourceId });
      return Promise.resolve([]);
    },
  };
}

const ctx = { cwd: '/tmp', paths: { allow: [] }, agentId: 'agent-1' };

describe('knowledge tools source scope', () => {
  test('explicit source outside scope is reported as not shared', async () => {
    const port = fakePort(['src-shared', 'src-other']);
    const tools = createKnowledgeTools({ port, resolveScope: () => scope });
    const search = tools.find((tool) => tool.name === 'knowledge_search');
    const result = (await search?.execute({ query: 'q', sourceId: 'src-external' }, ctx)) as {
      code?: string;
      message?: string;
    };
    expect(result.code).toBe('KNOWLEDGE_SOURCE_NOT_SHARED');
    expect(result.message).toContain('"src-external"');
    expect(result.message).toContain('share it: Sources page');
    expect(port.calls).toEqual([]);
  });

  test('empty scope answers with setup steps, never an empty list', async () => {
    const port = fakePort();
    const tools = createKnowledgeTools({ port, resolveScope: () => ({ ...scope, sourceIds: [] }) });
    const search = tools.find((tool) => tool.name === 'knowledge_search');
    const result = (await search?.execute({ query: 'q' }, ctx)) as {
      code?: string;
      message?: string;
    };
    expect(result.code).toBe('KNOWLEDGE_NOT_CONFIGURED');
    expect(result.message).toContain('Sources page');
    expect(port.calls).toEqual([]);
  });

  test('explicit source cannot bypass an empty scope', async () => {
    const port = fakePort();
    const tools = createKnowledgeTools({ port, resolveScope: () => ({ ...scope, sourceIds: [] }) });
    const search = tools.find((tool) => tool.name === 'knowledge_search');
    const result = (await search?.execute({ query: 'q', sourceId: 'src-any' }, ctx)) as {
      code?: string;
    };
    expect(result.code).toBe('KNOWLEDGE_NOT_CONFIGURED');
    expect(port.calls).toEqual([]);
  });

  test('shared but not indexed answers with reindex steps instead of []', async () => {
    const port = fakePort([], { 'src-shared': 'Design Docs' });
    const tools = createKnowledgeTools({ port, resolveScope: () => scope });
    const search = tools.find((tool) => tool.name === 'knowledge_search');
    const result = (await search?.execute({ query: 'q' }, ctx)) as {
      code?: string;
      message?: string;
    };
    expect(result.code).toBe('KNOWLEDGE_SOURCE_NOT_INDEXED');
    expect(result.message).toContain('"Design Docs" (src-shared)');
    expect(result.message).toContain('"src-other"');
    expect(result.message).toContain('reindex');
    expect(port.calls).toEqual([]);
  });

  test('explicit shared source without an index names that source', async () => {
    const port = fakePort(['src-other'], { 'src-shared': 'Design Docs' });
    const tools = createKnowledgeTools({ port, resolveScope: () => scope });
    const search = tools.find((tool) => tool.name === 'knowledge_search');
    const result = (await search?.execute({ query: 'q', sourceId: 'src-shared' }, ctx)) as {
      code?: string;
      message?: string;
    };
    expect(result.code).toBe('KNOWLEDGE_SOURCE_NOT_INDEXED');
    expect(result.message).toContain('"Design Docs" (src-shared)');
    expect(port.calls).toEqual([]);
  });

  test('indexed hits path: explicit source inside scope passes through', async () => {
    const port = fakePort(['src-shared', 'src-other']);
    const tools = createKnowledgeTools({ port, resolveScope: () => scope });
    const search = tools.find((tool) => tool.name === 'knowledge_search');
    await search?.execute({ query: 'q', sourceId: 'src-shared' }, ctx);
    expect(port.calls).toEqual([{ sourceId: 'src-shared' }]);
  });

  test('fallback uses the first indexed shared source', async () => {
    const port = fakePort(['src-other']);
    const tools = createKnowledgeTools({ port, resolveScope: () => scope });
    const search = tools.find((tool) => tool.name === 'knowledge_search');
    await search?.execute({ query: 'q' }, ctx);
    expect(port.calls).toEqual([{ sourceId: 'src-other' }]);
  });

  test('indexed source with no matches still returns an empty list', async () => {
    const port = fakePort(['src-shared', 'src-other']);
    const tools = createKnowledgeTools({ port, resolveScope: () => scope });
    const search = tools.find((tool) => tool.name === 'knowledge_search');
    const result = await search?.execute({ query: 'no-such-topic' }, ctx);
    expect(result).toEqual([]);
  });
});
