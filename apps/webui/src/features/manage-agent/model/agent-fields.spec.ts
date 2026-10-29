import { describe, expect, test } from 'bun:test';
import type { ProviderPublic } from '@harnesys/studio-shared';
import { agentFieldsFrom, agentFieldsSchema, toAgentDraft } from './agent-fields.ts';
import { generationDefaults } from './generation-specs.ts';

const MODEL_ID = 'test-model';
const provider: ProviderPublic = {
  id: 'p1',
  name: 'Test',
  driver: 'openai',
  enabled: true,
  hasKey: true,
  models: [
    {
      id: MODEL_ID,
      name: 'Test Model',
      kind: 'chat',
      metadata: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      missing: [],
      verified: true,
      efforts: [],
    },
  ],
};

describe('generationDefaults', () => {
  test('seeds formatted fallbacks for every visible slider', () => {
    const defaults = generationDefaults(MODEL_ID, [provider]);
    expect(defaults.temperature).toBe('1.00');
    expect(defaults.topP).toBe('1.00');
    expect(defaults.topK).toBe('40');
    expect(defaults.frequencyPenalty).toBe('0.00');
    expect(defaults.presencePenalty).toBe('0.00');
    expect(defaults.seed).toBeUndefined();
    expect(defaults.maxTokens).toBeUndefined();
  });

  test('seeds nothing for an unknown model', () => {
    expect(generationDefaults('missing', [provider])).toEqual({});
    expect(generationDefaults(null, [provider])).toEqual({});
  });
});

describe('generation save pipeline', () => {
  test('slider strings survive schema and reach the draft as numbers', () => {
    const fields = agentFieldsFrom({
      name: 'Coder',
      role: 'Operator',
      instructions: '',
      modelId: MODEL_ID,
      generation: {
        temperature: 1,
        topP: 1,
        topK: 40,
        frequencyPenalty: 0,
        presencePenalty: 0,
      },
    });
    const parsed = agentFieldsSchema.parse(fields);
    const draft = toAgentDraft(parsed);
    expect(draft.generation).toEqual({
      temperature: 1,
      topP: 1,
      topK: 40,
      frequencyPenalty: 0,
      presencePenalty: 0,
    });
  });

  test('seeded defaults survive schema and reach the draft', () => {
    const defaults = generationDefaults(MODEL_ID, [provider]);
    const fields = agentFieldsFrom({
      name: 'Coder',
      role: 'Operator',
      instructions: '',
      modelId: MODEL_ID,
    });
    const filled = { ...fields, ...defaults };
    const draft = toAgentDraft(agentFieldsSchema.parse(filled));
    expect(draft.generation).toEqual({
      temperature: 1,
      topP: 1,
      topK: 40,
      frequencyPenalty: 0,
      presencePenalty: 0,
    });
  });
});
