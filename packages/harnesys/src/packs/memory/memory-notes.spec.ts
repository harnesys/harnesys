import { describe, expect, test } from 'bun:test';
import type { MemoryPolicy } from '@harnesys/contracts';
import type { LlmNoteContext, LlmNoteProvider } from '../../application/llm-notes.ts';
import type { CapabilityScope } from '../../domain/pack.ts';
import type { PinPort, SemanticMemoryPort } from '../../ports/memory.ts';
import { pinMemoryCapability } from './pin.ts';
import { semanticMemoryCapability } from './semantic.ts';

interface PackNotes {
  notes?: LlmNoteProvider | LlmNoteProvider[];
}

function providersOf(pack: PackNotes): LlmNoteProvider[] {
  if (Array.isArray(pack.notes)) {
    return pack.notes;
  }
  return pack.notes !== undefined ? [pack.notes] : [];
}

function lastNote(pack: PackNotes): LlmNoteProvider {
  const providers = providersOf(pack);
  return providers[providers.length - 1] ?? (() => []);
}

const NOTE_CTX: LlmNoteContext = {
  agentId: 'agent-1',
  runId: 'run-1',
  sessionId: 'session-1',
  nodeId: 'think',
  steps: 1,
  state: {},
};

const SCOPE: CapabilityScope = {
  orgId: 'org-1',
  agentId: 'agent-1',
  sourceIds: [],
  threadId: 'thread-1',
};

function pinPortFake(projected: string, calls: number[][]): PinPort {
  return {
    list: () => Promise.resolve([]),
    upsert: () => {
      throw new Error('not used');
    },
    remove: () => Promise.resolve(),
    projectForWindow: (_scope, budgetTokens) => {
      calls.push([budgetTokens]);
      return Promise.resolve(projected);
    },
  } as PinPort;
}

function semanticPortFake(
  projected: string,
  calls: { scopes?: string[] }[],
  withProjection: boolean,
): SemanticMemoryPort {
  const base = {
    list: () => Promise.resolve([]),
    upsert: () => {
      throw new Error('not used');
    },
    update: () => {
      throw new Error('not used');
    },
    remove: () => Promise.resolve(),
  };
  if (!withProjection) {
    return base as SemanticMemoryPort;
  }
  return {
    ...base,
    projectForWindow: (_scope, input) => {
      calls.push({ scopes: input.scopes });
      return Promise.resolve(projected);
    },
  } as SemanticMemoryPort;
}

function semanticQueryPortFake(
  projected: string,
  windowCalls: { scopes?: string[] }[],
  queryCalls: { query: string; topK: number; halfLifeDays: number }[],
): SemanticMemoryPort {
  return {
    list: () => Promise.resolve([]),
    upsert: () => {
      throw new Error('not used');
    },
    update: () => {
      throw new Error('not used');
    },
    remove: () => Promise.resolve(),
    projectForWindow: (_scope, input) => {
      windowCalls.push({ scopes: input.scopes });
      return Promise.resolve(projected);
    },
    projectForQuery: (_scope, input) => {
      queryCalls.push({
        query: input.query,
        topK: input.topK,
        halfLifeDays: input.halfLifeDays,
      });
      return Promise.resolve(projected);
    },
  } as SemanticMemoryPort;
}

const DEFAULT_POLICY: MemoryPolicy = {
  read: true,
  consolidate: true,
  reflect: false,
  enforce: false,
  promote: false,
  minSteps: 3,
  maxNudges: 1,
  reflectInterval: 24,
  decayHalfLifeDays: 30,
  promoteThreshold: 8,
};

describe('memory pack notes', () => {
  test('pin and semantic packs project memory notes', async () => {
    const pinCalls: number[][] = [];
    const pin = pinMemoryCapability.create({
      ports: { pin: pinPortFake('alpha rule', pinCalls) },
      spec: {},
      scope: SCOPE,
    });
    const pinProjection = lastNote(pin);
    expect(await pinProjection(NOTE_CTX)).toEqual([{ tag: 'memory-pin', text: 'alpha rule' }]);
    expect(pinCalls).toEqual([[1500]]);

    const semanticCalls: { scopes?: string[] }[] = [];
    const semantic = semanticMemoryCapability.create({
      ports: { semantic: semanticPortFake('session fact', semanticCalls, true) },
      spec: { autoProjectSession: true, autoProjectLong: true },
      scope: SCOPE,
    });
    const semanticProjection = lastNote(semantic);
    expect(await semanticProjection(NOTE_CTX)).toEqual([
      { tag: 'memory-semantic', text: 'session fact' },
    ]);
    expect(semanticCalls).toEqual([{ scopes: ['session', 'long'] }]);
  });

  test('policy read=false and empty projection suppress notes', async () => {
    const policy: MemoryPolicy = { ...DEFAULT_POLICY, read: false };
    const pin = pinMemoryCapability.create({
      ports: { pin: pinPortFake('alpha rule', []) },
      spec: {},
      scope: SCOPE,
      policy,
    });
    expect(await lastNote(pin)(NOTE_CTX)).toEqual([]);

    const semantic = semanticMemoryCapability.create({
      ports: { semantic: semanticPortFake('session fact', [], true) },
      spec: { autoProjectSession: true, autoProjectLong: true },
      scope: SCOPE,
      policy,
    });
    expect(await lastNote(semantic)(NOTE_CTX)).toEqual([]);

    const emptyPin = pinMemoryCapability.create({
      ports: { pin: pinPortFake('', []) },
      spec: {},
      scope: SCOPE,
    });
    expect(await lastNote(emptyPin)(NOTE_CTX)).toEqual([]);

    const noProjection = semanticMemoryCapability.create({
      ports: { semantic: semanticPortFake('', [], false) },
      spec: { autoProjectSession: true, autoProjectLong: true },
      scope: SCOPE,
    });
    expect(await lastNote(noProjection)(NOTE_CTX)).toEqual([]);
  });

  test('long userText projects by query, short falls back to window', async () => {
    const windowCalls: { scopes?: string[] }[] = [];
    const queryCalls: { query: string; topK: number; halfLifeDays: number }[] = [];
    const semantic = semanticMemoryCapability.create({
      ports: { semantic: semanticQueryPortFake('matched fact', windowCalls, queryCalls) },
      spec: { autoProjectSession: true, autoProjectLong: true },
      scope: SCOPE,
    });
    const projection = lastNote(semantic);
    const long =
      'Please investigate why the memory retrieval scoring ignores recent facts in this workspace';
    expect(await projection({ ...NOTE_CTX, userText: long })).toEqual([
      { tag: 'memory-semantic', text: 'matched fact' },
    ]);
    expect(queryCalls).toEqual([{ query: long, topK: 8, halfLifeDays: 30 }]);
    expect(windowCalls).toEqual([]);

    expect(await projection({ ...NOTE_CTX, runId: 'run-2', userText: 'Продолжай' })).toEqual([
      { tag: 'memory-semantic', text: 'matched fact' },
    ]);
    expect(windowCalls).toEqual([{ scopes: ['session', 'long'] }]);
    expect(queryCalls).toHaveLength(1);
  });

  test('projection is cached per run', async () => {
    const windowCalls: { scopes?: string[] }[] = [];
    const queryCalls: { query: string; topK: number; halfLifeDays: number }[] = [];
    const semantic = semanticMemoryCapability.create({
      ports: { semantic: semanticQueryPortFake('matched fact', windowCalls, queryCalls) },
      spec: { autoProjectSession: true, autoProjectLong: true },
      scope: SCOPE,
    });
    const projection = lastNote(semantic);
    const ctx = { ...NOTE_CTX, userText: 'a'.repeat(40) };
    expect(await projection(ctx)).toEqual([{ tag: 'memory-semantic', text: 'matched fact' }]);
    expect(await projection(ctx)).toEqual([{ tag: 'memory-semantic', text: 'matched fact' }]);
    expect(queryCalls).toHaveLength(1);
  });
});
