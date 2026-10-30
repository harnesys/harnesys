import { describe, expect, test } from 'bun:test';
import type { AgentPresetBody, EnvelopePreset, PresetEnvelope } from '@harnesys/contracts';
import { ImportPresetsUseCase } from './import-presets.use-case.ts';
import { FakePresetStore } from './preset-library.fakes.ts';

const agentBody: AgentPresetBody = {
  name: 'Coder',
  role: 'Engineer',
  instructions: 'write code',
};

function envelopeOf(presets: EnvelopePreset[], author?: { name: string }): PresetEnvelope {
  const main = presets[0];
  if (main === undefined) {
    throw new Error('envelope needs a main preset');
  }
  return {
    formatVersion: 1,
    manifest: {
      id: main.id,
      version: main.version,
      kind: main.kind,
      name: main.name,
      tags: main.tags ?? [],
      ...(author ? { author } : {}),
    },
    presets,
  };
}

describe('ImportPresetsUseCase', () => {
  test('rejects duplicate ids inside one envelope', () => {
    const store = new FakePresetStore();
    const useCase = new ImportPresetsUseCase(store);
    const envelope = envelopeOf([
      { kind: 'agent', id: 'local/coder', version: '1.0.0', name: 'Coder', body: agentBody },
      { kind: 'agent', id: 'local/coder', version: '1.0.0', name: 'Coder', body: agentBody },
    ]);
    expect(() => useCase.execute({ envelope })).toThrow(/PRESET_VALIDATION|duplicate preset ids/);
    expect(store.records.size).toBe(0);
  });

  test('rejects an envelope older than the stored preset', () => {
    const store = new FakePresetStore();
    store.save({
      id: 'local/coder',
      kind: 'agent',
      origin: 'user',
      version: '2.0.0',
      name: 'Coder',
      body: agentBody,
    });
    const useCase = new ImportPresetsUseCase(store);
    const envelope = envelopeOf([
      { kind: 'agent', id: 'local/coder', version: '1.0.0', name: 'Coder', body: agentBody },
    ]);
    expect(() => useCase.execute({ envelope })).toThrow(/PRESET_CONFLICT|older than the stored/);
    expect(store.findById('agent', 'local/coder')?.version).toBe('2.0.0');
  });

  test('imports presets as user presets installed from a file', () => {
    const store = new FakePresetStore();
    const useCase = new ImportPresetsUseCase(store);
    const envelope = envelopeOf([
      { kind: 'agent', id: 'local/coder', version: '1.0.0', name: 'Coder', body: agentBody },
    ]);
    const result = useCase.execute({ envelope });
    expect(result.items).toHaveLength(1);
    const stored = store.findById('agent', 'local/coder');
    expect(stored?.origin).toBe('user');
    expect(stored?.installedFrom).toBe('file');
  });

  test('preserves the manifest author for the main preset', () => {
    const store = new FakePresetStore();
    const useCase = new ImportPresetsUseCase(store);
    const envelope = envelopeOf(
      [
        { kind: 'agent', id: 'local/coder', version: '1.0.0', name: 'Coder', body: agentBody },
        { kind: 'agent', id: 'local/poet', version: '1.0.0', name: 'Poet', body: agentBody },
      ],
      { name: 'mike' },
    );
    useCase.execute({ envelope });
    expect(store.findById('agent', 'local/coder')?.author).toBe('mike');
    expect(store.findById('agent', 'local/poet')?.author).toBeNull();
  });

  test('rejects entries in the reserved harnesys namespace', () => {
    const store = new FakePresetStore();
    store.save({
      id: 'harnesys/lead',
      kind: 'agent',
      origin: 'system',
      version: '1.0.0',
      name: 'Lead',
      body: agentBody,
    });
    const useCase = new ImportPresetsUseCase(store);
    const envelope = envelopeOf([
      { kind: 'agent', id: 'harnesys/lead', version: '2.0.0', name: 'Lead', body: agentBody },
    ]);
    expect(() => useCase.execute({ envelope })).toThrow(/PRESET_VALIDATION|reserved/);
    expect(store.findById('agent', 'harnesys/lead')?.version).toBe('1.0.0');
    expect(store.findById('agent', 'harnesys/lead')?.origin).toBe('system');
  });
});
