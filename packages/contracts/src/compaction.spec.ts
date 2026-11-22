import { describe, expect, test } from 'bun:test';
import { CreateAgentBodySchema, UpdateAgentBodySchema } from './agent.ts';
import { CompactionConfigSchema, CompactionSpecSchema } from './compaction.ts';

const validSpec = {
  maxContextTokens: 262_144,
  protectTokens: 32_768,
  thresholdRatio: 0.8,
  outputReserveRatio: 0.1,
  protectRecentRatio: 0.1,
  protectRecentTurns: 0,
  auto: true,
  preCompactNote: true,
  overflowCompaction: true,
  microcompact: false,
  microcompactKeepRounds: 5,
  microcompactStepRounds: 5,
  microcompactMinGainTokens: 256,
  compactionFailureLimit: 3,
  compactionRapidRefillSteps: 3,
  preThresholdGapRatio: 0.1,
  rapidRefillMaxCompactions: 3,
  summaryModel: { provider: 'p', model: 'm' },
};

describe('CompactionSpecSchema', () => {
  test('accepts a full spec and an empty spec', () => {
    expect(CompactionSpecSchema.safeParse(validSpec).success).toBe(true);
    expect(CompactionSpecSchema.safeParse({}).success).toBe(true);
  });

  test('rejects a protectTokens budget with no room to cut', () => {
    expect(
      CompactionSpecSchema.safeParse({ maxContextTokens: 100_000, protectTokens: 100_000 }).success,
    ).toBe(false);
    const tight = CompactionSpecSchema.safeParse({
      maxContextTokens: 100_000,
      protectTokens: 99_500,
    });
    expect(tight.success).toBe(false);
    if (!tight.success) {
      expect(tight.error.issues[0]?.path).toEqual(['protectTokens']);
      expect(tight.error.issues[0]?.message).toContain('no room to cut');
    }
  });

  test('rejects negative and out-of-range knobs', () => {
    expect(CompactionSpecSchema.safeParse({ protectTokens: -1 }).success).toBe(false);
    expect(CompactionSpecSchema.safeParse({ maxContextTokens: 0 }).success).toBe(false);
    expect(CompactionSpecSchema.safeParse({ maxContextTokens: 2_000_001 }).success).toBe(false);
    expect(CompactionSpecSchema.safeParse({ thresholdRatio: 0.05 }).success).toBe(false);
    expect(CompactionSpecSchema.safeParse({ thresholdRatio: 1.4 }).success).toBe(false);
    expect(CompactionSpecSchema.safeParse({ protectRecentRatio: 1.2 }).success).toBe(false);
    expect(CompactionSpecSchema.safeParse({ outputReserveRatio: 0.95 }).success).toBe(false);
    expect(CompactionSpecSchema.safeParse({ protectRecentTurns: -1 }).success).toBe(false);
    expect(CompactionSpecSchema.safeParse({ summaryModel: { provider: 'p' } }).success).toBe(false);
  });

  test('accepts the near-threshold and rapid-refill knobs at their bounds', () => {
    expect(
      CompactionSpecSchema.safeParse({ preThresholdGapRatio: 0, rapidRefillMaxCompactions: 0 })
        .success,
    ).toBe(true);
    expect(
      CompactionSpecSchema.safeParse({ preThresholdGapRatio: 0.9, rapidRefillMaxCompactions: 5 })
        .success,
    ).toBe(true);
  });

  test('rejects out-of-range near-threshold and rapid-refill knobs', () => {
    expect(CompactionSpecSchema.safeParse({ preThresholdGapRatio: -0.1 }).success).toBe(false);
    expect(CompactionSpecSchema.safeParse({ preThresholdGapRatio: 1 }).success).toBe(false);
    expect(CompactionSpecSchema.safeParse({ rapidRefillMaxCompactions: -1 }).success).toBe(false);
    expect(CompactionSpecSchema.safeParse({ rapidRefillMaxCompactions: 1.5 }).success).toBe(false);
  });
});

describe('CompactionConfigSchema', () => {
  test('accepts a port ref with and without fields', () => {
    expect(
      CompactionConfigSchema.safeParse({ name: 'threshold-summary', spec: validSpec }).success,
    ).toBe(true);
    expect(CompactionConfigSchema.safeParse({}).success).toBe(true);
    expect(CompactionConfigSchema.safeParse({ name: 'x' }).success).toBe(true);
  });
});

describe('CreateAgentBodySchema compaction config', () => {
  test('accepts a good compaction config and a config without compaction', () => {
    const good = CreateAgentBodySchema.safeParse({
      name: 'A',
      modelId: 'm',
      config: { compaction: { name: 'threshold-summary', spec: { thresholdRatio: 0.6 } } },
    });
    expect(good.success).toBe(true);
    const none = CreateAgentBodySchema.safeParse({ name: 'A', modelId: 'm', config: { foo: 1 } });
    expect(none.success).toBe(true);
  });

  test('rejects a bad compaction spec with a config.compaction path', () => {
    const result = CreateAgentBodySchema.safeParse({
      name: 'A',
      modelId: 'm',
      config: { compaction: { name: 'threshold-summary', spec: { thresholdRatio: 1.5 } } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) => issue.path.join('.') === 'config.compaction.spec.thresholdRatio',
        ),
      ).toBe(true);
    }
  });

  test('rejects a compaction port ref that is not an object', () => {
    const result = CreateAgentBodySchema.safeParse({
      name: 'A',
      modelId: 'm',
      config: { compactionJson: 'nope' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.join('.') === 'config.compactionJson'),
      ).toBe(true);
    }
  });
});

describe('UpdateAgentBodySchema compaction config', () => {
  test('keeps the config superRefine alive after partial()', () => {
    const bad = UpdateAgentBodySchema.safeParse({
      config: { compaction: { spec: { protectTokens: -1 } } },
    });
    expect(bad.success).toBe(false);
    const good = UpdateAgentBodySchema.safeParse({
      config: { compaction: { name: 'threshold-summary', spec: { thresholdRatio: 0.6 } } },
    });
    expect(good.success).toBe(true);
  });
});
