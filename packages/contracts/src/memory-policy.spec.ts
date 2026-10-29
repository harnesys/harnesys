import { describe, expect, test } from 'bun:test';
import { DEFAULT_MEMORY_POLICY, MemoryPolicySchema, parseMemoryPolicy } from './memory-policy.ts';

describe('MemoryPolicySchema', () => {
  test('accepts a partial policy', () => {
    const result = MemoryPolicySchema.safeParse({ read: false, minSteps: 5 });
    expect(result.success).toBe(true);
  });

  test('rejects out-of-range numbers', () => {
    expect(MemoryPolicySchema.safeParse({ minSteps: -1 }).success).toBe(false);
    expect(MemoryPolicySchema.safeParse({ maxNudges: 100 }).success).toBe(false);
    expect(MemoryPolicySchema.safeParse({ decayHalfLifeDays: 0 }).success).toBe(false);
    expect(MemoryPolicySchema.safeParse({ promoteThreshold: 11 }).success).toBe(false);
  });

  test('rejects unknown keys', () => {
    expect(MemoryPolicySchema.safeParse({ nope: true }).success).toBe(false);
  });
});

describe('parseMemoryPolicy', () => {
  test('absent, null or non-object input means off', () => {
    expect(parseMemoryPolicy(undefined)).toBeUndefined();
    expect(parseMemoryPolicy(null)).toBeUndefined();
    expect(parseMemoryPolicy('on')).toBeUndefined();
    expect(parseMemoryPolicy([])).toBeUndefined();
  });

  test('invalid shape means off instead of throwing', () => {
    expect(parseMemoryPolicy({ minSteps: -5 })).toBeUndefined();
  });

  test('partial policy is filled with the spec defaults', () => {
    expect(parseMemoryPolicy({})).toEqual(DEFAULT_MEMORY_POLICY);
    expect(parseMemoryPolicy({ reflect: true })).toEqual({
      ...DEFAULT_MEMORY_POLICY,
      reflect: true,
    });
  });

  test('defaults include the six relevance and budget knobs', () => {
    const policy = parseMemoryPolicy({});
    expect(policy?.projectLimit).toBe(20);
    expect(policy?.projectBudgetTokens).toBe(800);
    expect(policy?.pinBudgetTokens).toBe(1500);
    expect(policy?.relevanceTopK).toBe(8);
    expect(policy?.relevanceMinChars).toBe(24);
    expect(policy?.factClipChars).toBe(200);
  });

  test('explicit knob values survive a round-trip', () => {
    expect(parseMemoryPolicy({ relevanceTopK: 5, factClipChars: 120 })).toEqual({
      ...DEFAULT_MEMORY_POLICY,
      relevanceTopK: 5,
      factClipChars: 120,
    });
  });

  test('explicit values win over defaults', () => {
    expect(parseMemoryPolicy({ read: false, minSteps: 7, promoteThreshold: 4 })).toEqual({
      ...DEFAULT_MEMORY_POLICY,
      read: false,
      minSteps: 7,
      promoteThreshold: 4,
    });
  });
});
