import { describe, expect, test } from 'bun:test';
import type {
  KnowledgeFileRecord,
  KnowledgeFilesByStatus,
  KnowledgeIndexState,
  KnowledgeRootRecord,
  KnowledgeSettings,
  KnowledgeStats,
  UpsertKnowledgeSettingsRequest,
} from '@harnesys/studio-shared';
import type { CapabilityScope, KnowledgeHit, KnowledgeReadResult } from 'harnesys';
import { KnowledgeSourceNotFoundException } from '../../../domain/knowledge/knowledge.error.ts';
import { KnowledgeSearchPort } from '../../../domain/knowledge/knowledge-search.port.ts';
import {
  KnowledgeStorePort,
  type UpsertKnowledgeRootInput,
} from '../../../domain/knowledge/knowledge-store.port.ts';
import type { SourceRecord } from '../../../domain/source/source-registry.port.ts';
import { SourceRegistryPort } from '../../../domain/source/source-registry.port.ts';
import { OrgKnowledgePort } from './org-knowledge.port.ts';

const SCOPE: CapabilityScope = {
  orgId: 'org-1',
  agentId: 'agent-1',
  threadId: 'thread-0',
  sourceIds: ['src-1'],
};

const EMPTY_SCOPE: CapabilityScope = { ...SCOPE, sourceIds: [] };

const EMPTY_FILES_BY_STATUS: KnowledgeFilesByStatus = {
  pending: 0,
  indexed: 0,
  skipped: 0,
  error: 0,
};

interface MemoryChunk extends KnowledgeReadResult {
  sourceId: string;
}

function source(id: string, orgId: string): SourceRecord {
  return {
    id,
    orgId,
    name: id,
    description: null,
    distribution: { kind: 'host-bound', hostId: '00000000-0000-4000-8000-000000000001' },
    uiVisibility: 'host',
    managed: true,
    vcs: null,
    availability: { hostIds: [] },
    lspJson: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

class MemoryKnowledgeSearch extends KnowledgeSearchPort {
  calls: Array<{ orgId: string; sourceId: string; query: string; limit?: number }> = [];
  hits: KnowledgeHit[] = [{ id: 'chunk-1', text: 'hello world' }];

  search(orgId: string, sourceId: string, query: string, limit?: number): Promise<KnowledgeHit[]> {
    this.calls.push({
      orgId,
      sourceId,
      query,
      ...(limit === undefined ? {} : { limit }),
    });
    return Promise.resolve(this.hits);
  }
}

class MemoryKnowledgeStore extends KnowledgeStorePort {
  chunks: MemoryChunk[] = [
    { id: 'chunk-1', sourceId: 'src-1', text: 'hello world', uri: 'docs/hello.md' },
  ];

  listRoots(): KnowledgeRootRecord[] {
    return [];
  }

  upsertRoot(input: UpsertKnowledgeRootInput): KnowledgeRootRecord {
    return { sourceId: input.sourceId, path: input.path, enabled: input.enabled ?? true };
  }

  deleteRoot(): void {}

  countChunks(): number {
    return 0;
  }

  countFilesByStatus(): KnowledgeFilesByStatus {
    return { ...EMPTY_FILES_BY_STATUS };
  }

  getSettings(_orgId: string, sourceId: string): KnowledgeSettings {
    return {
      sourceId,
      entireSource: false,
      backend: 'fts',
      embedProvider: null,
      embedModel: null,
      watchEnabled: false,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
  }

  putSettings(
    orgId: string,
    sourceId: string,
    patch: UpsertKnowledgeSettingsRequest,
  ): KnowledgeSettings {
    return { ...this.getSettings(orgId, sourceId), ...patch };
  }

  listFiles(): KnowledgeFileRecord[] {
    return [];
  }

  getIndexState(_orgId: string, sourceId: string): KnowledgeIndexState {
    return {
      sourceId,
      status: 'idle',
      phase: null,
      processed: 0,
      total: 0,
      lastError: null,
      startedAt: null,
      finishedAt: null,
    };
  }

  getStats(): KnowledgeStats {
    return { chunkCount: 0, filesByStatus: { ...EMPTY_FILES_BY_STATUS } };
  }

  readChunk(_orgId: string, sourceId: string, id: string): KnowledgeReadResult {
    const row = this.chunks.find((chunk) => chunk.id === id && chunk.sourceId === sourceId);
    if (!row) {
      throw new KnowledgeSourceNotFoundException('knowledge chunk not found');
    }
    const { sourceId: _sourceId, ...result } = row;
    return result;
  }

  deleteForSource(): void {}
}

class MemorySources extends SourceRegistryPort {
  constructor(private readonly items: SourceRecord[]) {
    super();
  }

  list(orgId: string): SourceRecord[] {
    return this.items.filter((item) => item.orgId === orgId);
  }

  findById(orgId: string, sourceId: string): SourceRecord | null {
    return this.items.find((item) => item.orgId === orgId && item.id === sourceId) ?? null;
  }

  findManagedWorkspace(): SourceRecord | null {
    return null;
  }

  insert(): void {}
  updateVisibility(): void {}
  updateName(): void {}
  updateDistribution(): void {}
  updateVcs(): void {}
  updateAvailability(): void {}
  updateLspJson(): void {}
  remove(): void {}
}

function setup(scope: CapabilityScope = SCOPE) {
  const search = new MemoryKnowledgeSearch();
  const store = new MemoryKnowledgeStore();
  const sources = new MemorySources([source('src-1', 'org-1')]);
  const port = new OrgKnowledgePort({
    orgId: 'org-1',
    search,
    store,
    sources,
    resolveScope: () => scope,
  });
  return { search, store, port };
}

describe('OrgKnowledgePort', () => {
  test('search delegates to the knowledge port with the same query', async () => {
    const { search, port } = setup();
    const hits = await port.search({ sourceId: 'src-1', query: 'hello' });
    expect(hits).toEqual([{ id: 'chunk-1', text: 'hello world' }]);
    expect(search.calls).toEqual([{ orgId: 'org-1', sourceId: 'src-1', query: 'hello' }]);
  });

  test('search falls back to scope sourceIds[0]', async () => {
    const { search, port } = setup();
    await port.search({ sourceId: '', query: 'hello' });
    expect(search.calls).toEqual([{ orgId: 'org-1', sourceId: 'src-1', query: 'hello' }]);
  });

  test('empty scope throws knowledge-memory error', async () => {
    const { port } = setup(EMPTY_SCOPE);
    await expect(
      Promise.resolve().then(() => port.search({ sourceId: '', query: 'hello' })),
    ).rejects.toThrow('knowledge-memory: no source in scope');
  });

  test('search rejects unknown source', async () => {
    const { search, port } = setup();
    await expect(
      Promise.resolve().then(() => port.search({ sourceId: 'ghost', query: 'hello' })),
    ).rejects.toThrow(KnowledgeSourceNotFoundException);
    expect(search.calls).toEqual([]);
  });

  test('read returns the seeded chunk text', async () => {
    const { port } = setup();
    await expect(port.read({ sourceId: 'src-1', id: 'chunk-1' })).resolves.toEqual({
      id: 'chunk-1',
      text: 'hello world',
      uri: 'docs/hello.md',
    });
  });

  test('read rejects unknown chunk with the store not-found error', async () => {
    const { port } = setup();
    await expect(
      Promise.resolve().then(() => port.read({ sourceId: 'src-1', id: 'missing' })),
    ).rejects.toThrow('knowledge chunk not found');
  });

  test('read rejects unknown source', async () => {
    const { port } = setup();
    await expect(
      Promise.resolve().then(() => port.read({ sourceId: 'ghost', id: 'chunk-1' })),
    ).rejects.toThrow(KnowledgeSourceNotFoundException);
  });
});
