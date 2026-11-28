import { describe, expect, test } from 'bun:test';
import type { LlmNote, LlmNoteContext, LlmNoteProvider } from '../../application/llm-notes.ts';
import type { CapabilityScope } from '../../domain/pack.ts';
import type { KnowledgePort } from '../../ports/memory.ts';
import { knowledgeMemoryCapability } from './knowledge.ts';

function scopeWith(sourceIds: string[]): CapabilityScope {
  return { orgId: 'org-1', agentId: 'agent-1', sourceIds, threadId: 'thread-1' };
}

function portWith(indexed: readonly string[]): KnowledgePort {
  return {
    search: () => Promise.resolve([]),
    indexedSources: (sourceIds) => Promise.resolve(sourceIds.filter((id) => indexed.includes(id))),
    sourceNames: () => Promise.resolve({}),
  };
}

const noteCtx = {
  agentId: 'agent-1',
  runId: 'run-1',
  sessionId: 'session-1',
  nodeId: 'think',
  steps: 1,
  state: {},
} satisfies LlmNoteContext;

async function notesOf(notes: LlmNoteProvider | LlmNoteProvider[] | undefined): Promise<LlmNote[]> {
  if (notes === undefined) {
    return [];
  }
  if (Array.isArray(notes)) {
    return (await Promise.all(notes.map((provider) => provider(noteCtx)))).flat();
  }
  return await notes(noteCtx);
}

describe('knowledge-memory pack exposure', () => {
  test('a run without shared sources exposes no knowledge tools and no note', async () => {
    const built = knowledgeMemoryCapability.create({
      ports: { knowledge: portWith([]) },
      spec: {},
      scope: scopeWith([]),
    });
    expect(built.tools ?? []).toEqual([]);
    expect(await notesOf(built.notes)).toEqual([]);
  });

  test('shared sources without any index keep the tools but drop the note', async () => {
    const built = knowledgeMemoryCapability.create({
      ports: { knowledge: portWith([]) },
      spec: {},
      scope: scopeWith(['src-1']),
    });
    expect((built.tools ?? []).map((tool) => tool.name)).toEqual([
      'knowledge_search',
      'knowledge_read',
    ]);
    expect(await notesOf(built.notes)).toEqual([]);
  });

  test('an indexed shared source exposes tools and the usage note', async () => {
    const built = knowledgeMemoryCapability.create({
      ports: { knowledge: portWith(['src-1']) },
      spec: {},
      scope: scopeWith(['src-1']),
    });
    expect((built.tools ?? []).map((tool) => tool.name)).toEqual([
      'knowledge_search',
      'knowledge_read',
    ]);
    expect(await notesOf(built.notes)).toHaveLength(1);
  });
});
