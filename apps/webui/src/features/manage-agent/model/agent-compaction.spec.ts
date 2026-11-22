import { describe, expect, test } from 'bun:test';
import {
  type CompactionDraft,
  compactionDraftFrom,
  toCompactionPortRef,
} from './agent-compaction.ts';

const BASE: CompactionDraft = {
  thresholdPercent: '80',
  maxContextTokens: '',
  reserveCapPercent: '10',
  protectRecentPercent: '10',
  protectTokens: '',
  protectRecentTurns: '',
  preCompactNote: true,
  preThresholdGapPercent: '10',
  auto: true,
  summaryProvider: '',
  summaryModel: '',
  microcompact: false,
  microcompactKeepRounds: '5',
  microcompactStepRounds: '',
  microcompactMinGainTokens: '256',
  compactionFailureLimit: '3',
  compactionRapidRefillSteps: '3',
  rapidRefillMaxCompactions: '3',
  overflowCompaction: true,
};

function specOf(draft: CompactionDraft): Record<string, unknown> {
  return toCompactionPortRef(draft)?.spec ?? {};
}

describe('agent compaction draft', () => {
  test('empty and non-positive absolute budgets stay out of the spec', () => {
    const spec = specOf(BASE);
    expect('maxContextTokens' in spec).toBe(false);
    expect('protectTokens' in spec).toBe(false);
    const zeroed = specOf({ ...BASE, maxContextTokens: '0', protectTokens: '0' });
    expect('maxContextTokens' in zeroed).toBe(false);
    expect('protectTokens' in zeroed).toBe(false);
  });

  test('filled absolute budgets reach the spec as positive integers', () => {
    const spec = specOf({ ...BASE, maxContextTokens: '100000', protectTokens: '20000' });
    expect(spec.maxContextTokens).toBe(100_000);
    expect(spec.protectTokens).toBe(20_000);
  });

  test('the percent and integer knobs map onto ratios and counts', () => {
    const spec = specOf({ ...BASE, preThresholdGapPercent: '10', rapidRefillMaxCompactions: '5' });
    expect(spec.preThresholdGapRatio).toBe(0.1);
    expect(spec.rapidRefillMaxCompactions).toBe(5);
  });

  test('the draft round-trips stably through the port ref', () => {
    const once = compactionDraftFrom(toCompactionPortRef(BASE));
    expect(once.preThresholdGapPercent).toBe('10');
    expect(once.rapidRefillMaxCompactions).toBe('3');
    expect(compactionDraftFrom(toCompactionPortRef(once))).toEqual(once);
  });
});
