import { describe, expect, test } from 'bun:test';
import { DEFAULT_MODE_ID, defaultAgentCompaction } from '@harnesys/studio-shared';
import { modeByIdOf, modesFromConfig, toAgentDefinition } from './agent-definition.mapper.ts';

function recordOf(config: Record<string, unknown>) {
  return {
    id: 'agent-1',
    orgId: 'org-1',
    name: 'Agent',
    role: 'worker',
    instructions: 'work',
    modelId: 'model-1',
    budgetUsdDaily: null,
    level: 'delegate' as const,
    parentId: null,
    executionProfileId: null,
    status: 'active' as const,
    sharedSourceIds: [],
    sourceLevels: {},
    secretNames: [],
    skills: [],
    mcpServers: [],
    enabledPlugins: {},
    defaultModeId: null,
    config,
    hooks: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('modesFromConfig', () => {
  test('absent or malformed modesJson yields an empty list', () => {
    expect(modesFromConfig({})).toEqual([]);
    expect(modesFromConfig({ modesJson: 'yes' })).toEqual([]);
    expect(modesFromConfig({ modesJson: { id: 'x' } })).toEqual([]);
  });

  test('drops entries without a valid id, with the reserved default id, or with an empty name', () => {
    const modes = modesFromConfig({
      modesJson: [
        { id: 'Bad Id', name: 'no spaces' },
        { id: DEFAULT_MODE_ID, name: 'Default' },
        { id: 'valid', name: '' },
        { id: 'valid', name: 'Valid' },
      ],
    });
    expect(modes.map((mode) => mode.id)).toEqual(['valid']);
  });

  test('passes through packs, disabledTools and exposure on a valid mode', () => {
    const raw = {
      id: 'plan',
      name: 'Plan',
      packs: { shell: true, files: null, web: { exposure: { search: 'deferred' as const } } },
      disabledTools: ['shell_write'],
      exposure: { search: 'deferred' as const },
    };
    expect(modesFromConfig({ modesJson: [raw] })).toEqual([raw]);
  });
});

describe('modeByIdOf', () => {
  test('finds a mode by id, undefined otherwise', () => {
    const modes = modesFromConfig({ modesJson: [{ id: 'plan', name: 'Plan' }] });
    expect(modeByIdOf(modes, 'plan')?.name).toBe('Plan');
    expect(modeByIdOf(modes, 'other')).toBeUndefined();
    expect(modeByIdOf(modes, undefined)).toBeUndefined();
  });
});

describe('toAgentDefinition memoryPolicy', () => {
  test('valid memoryPolicyJson is parsed with defaults merged in', () => {
    const def = toAgentDefinition(recordOf({ memoryPolicyJson: { enforce: true, minSteps: 7 } }), {
      model: undefined,
      provider: undefined,
    });
    expect(def.memoryPolicy).toEqual({
      read: true,
      consolidate: true,
      reflect: false,
      enforce: true,
      promote: false,
      minSteps: 7,
      maxNudges: 1,
      reflectInterval: 24,
      decayHalfLifeDays: 30,
      promoteThreshold: 8,
      projectLimit: 20,
      projectBudgetTokens: 800,
      pinBudgetTokens: 1500,
      relevanceTopK: 8,
      relevanceMinChars: 24,
      factClipChars: 200,
    });
  });

  test('garbage or absent memoryPolicyJson leaves memoryPolicy undefined', () => {
    const def = toAgentDefinition(recordOf({ memoryPolicyJson: 'garbage' }), {
      model: undefined,
      provider: undefined,
    });
    expect(def.memoryPolicy).toBeUndefined();
    const bare = toAgentDefinition(recordOf({}), { model: undefined, provider: undefined });
    expect(bare.memoryPolicy).toBeUndefined();
  });

  test('consolidateModelId survives the parse round-trip', () => {
    const def = toAgentDefinition(
      recordOf({ memoryPolicyJson: { consolidateModelId: 'model-uuid-1' } }),
      { model: undefined, provider: undefined },
    );
    expect(def.memoryPolicy?.consolidateModelId).toBe('model-uuid-1');
  });
});

describe('toAgentDefinition compaction', () => {
  test('absent key falls back to the spec default so presets get compaction', () => {
    const def = toAgentDefinition(recordOf({}), { model: undefined, provider: undefined });
    expect(def.compaction).toEqual(defaultAgentCompaction());
  });

  test('explicit null is a native always-on mechanism: falls back to the default', () => {
    const def = toAgentDefinition(recordOf({ compactionJson: null }), {
      model: undefined,
      provider: undefined,
    });
    expect(def.compaction).toEqual(defaultAgentCompaction());
  });

  test('configured port ref is passed through', () => {
    const ref = {
      name: 'threshold-summary',
      spec: { thresholdRatio: 0.6, auto: true, summaryModel: { provider: 'p', model: 'm' } },
    };
    const def = toAgentDefinition(recordOf({ compactionJson: ref }), {
      model: undefined,
      provider: undefined,
    });
    expect(def.compaction).toEqual(ref);
  });

  test('malformed value falls back to the default', () => {
    const def = toAgentDefinition(recordOf({ compactionJson: 'yes' }), {
      model: undefined,
      provider: undefined,
    });
    expect(def.compaction).toEqual(defaultAgentCompaction());
  });
});
