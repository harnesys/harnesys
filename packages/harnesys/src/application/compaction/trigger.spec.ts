import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_COMPACTION_MAX_CONTEXT_TOKENS,
  DEFAULT_COMPACTION_PRE_THRESHOLD_GAP_RATIO,
  DEFAULT_COMPACTION_PROTECT_TOKENS,
  DEFAULT_COMPACTION_RAPID_REFILL_MAX_COMPACTIONS,
  MIN_COMPACTION_CUT_TOKENS,
  parseThresholdSpec,
  resolveCompactionBudget,
  resolveCompactionSizing,
} from '../../domain/compaction.ts';

const windowlessDefaults = {
  maxContextTokens: DEFAULT_COMPACTION_MAX_CONTEXT_TOKENS,
  protectTokens: DEFAULT_COMPACTION_PROTECT_TOKENS,
};

describe('resolveCompactionSizing three-case table', () => {
  test('an explicit absolute budget wins over the legacy ratio', () => {
    const sizing = resolveCompactionSizing(
      { maxContextTokens: 100_000, protectTokens: 20_000, thresholdRatio: 0.5 },
      200_000,
    );
    expect(sizing).toEqual({ maxContextTokens: 100_000, protectTokens: 20_000 });
  });

  test('the legacy ratio scales with a known window', () => {
    const sizing = resolveCompactionSizing({ thresholdRatio: 0.8, protectRecentRatio: 0.1 }, 1000);
    expect(sizing).toEqual({ maxContextTokens: 800, protectTokens: 100 });
  });

  test('the legacy ratio without a known window falls back to the defaults', () => {
    const sizing = resolveCompactionSizing({ thresholdRatio: 0.8, protectRecentRatio: 0.1 });
    expect(sizing).toEqual(windowlessDefaults);
  });

  test('no budget at all resolves to the defaults on any window', () => {
    expect(resolveCompactionSizing({}, 1000)).toEqual(windowlessDefaults);
    expect(resolveCompactionSizing({})).toEqual(windowlessDefaults);
  });

  test('the protect tail is clamped below the budget so the cut stays possible', () => {
    const sizing = resolveCompactionSizing({ maxContextTokens: 4096, protectTokens: 8192 }, 8192);
    expect(sizing.maxContextTokens).toBe(4096);
    expect(sizing.protectTokens).toBeLessThan(4096);
  });
});

describe('parseThresholdSpec budget resolution', () => {
  test('an absent ratio stays undefined instead of holding a default', () => {
    const parsed = parseThresholdSpec({});
    expect(parsed.thresholdRatio).toBeUndefined();
    expect(parsed.protectRecentRatio).toBeUndefined();
    expect(resolveCompactionSizing(parsed).maxContextTokens).toBe(
      DEFAULT_COMPACTION_MAX_CONTEXT_TOKENS,
    );
    expect(resolveCompactionSizing(parsed).protectTokens).toBe(DEFAULT_COMPACTION_PROTECT_TOKENS);
  });

  test('an absolute budget is reported next to a legacy ratio', () => {
    const parsed = parseThresholdSpec({
      maxContextTokens: 100_000,
      protectTokens: 10_000,
      thresholdRatio: 0.5,
    });
    expect(parsed.maxContextTokens).toBe(100_000);
    expect(parsed.protectTokens).toBe(10_000);
    expect(parsed.thresholdRatio).toBe(0.5);
    expect(resolveCompactionSizing(parsed).maxContextTokens).toBe(100_000);
    expect(resolveCompactionSizing(parsed).protectTokens).toBe(10_000);
  });

  test('a legacy-only spec keeps the ratios and the windowless defaults', () => {
    const parsed = parseThresholdSpec({ thresholdRatio: 0.6, protectRecentRatio: 0.2 });
    expect(parsed.thresholdRatio).toBe(0.6);
    expect(parsed.protectRecentRatio).toBe(0.2);
    expect(resolveCompactionSizing(parsed).maxContextTokens).toBe(
      DEFAULT_COMPACTION_MAX_CONTEXT_TOKENS,
    );
    expect(resolveCompactionSizing(parsed).protectTokens).toBe(DEFAULT_COMPACTION_PROTECT_TOKENS);
  });

  test('out-of-range legacy ratios are clamped at runtime', () => {
    const parsed = parseThresholdSpec({
      thresholdRatio: 5,
      protectRecentRatio: -1,
      outputReserveRatio: 4,
    });
    expect(parsed.thresholdRatio).toBe(1);
    expect(parsed.protectRecentRatio).toBe(0);
    expect(parsed.outputReserveRatio).toBe(0.9);
  });

  test('non-positive absolute budgets are treated as absent', () => {
    const parsed = parseThresholdSpec({ maxContextTokens: 0, protectTokens: -5 });
    expect(parsed.maxContextTokens).toBeUndefined();
    expect(parsed.protectTokens).toBeUndefined();
    expect(resolveCompactionSizing(parsed).maxContextTokens).toBe(
      DEFAULT_COMPACTION_MAX_CONTEXT_TOKENS,
    );
  });
});

describe('resolveCompactionBudget runtime semantics', () => {
  test('an unknown window reports the sizing budget without exhausting', () => {
    const budget = resolveCompactionBudget({ maxContextTokens: 1000, protectTokens: 100 });
    expect(budget).toEqual({ threshold: 1000, protectTokens: 100, exhausted: false });
  });

  test('a known window caps the threshold by the window minus reserve', () => {
    const budget = resolveCompactionBudget(
      { maxContextTokens: 100_000, protectTokens: 5000 },
      8192,
      1024,
    );
    expect(budget.threshold).toBe(8192 - 1024);
    expect(budget.protectTokens).toBe(5000);
    expect(budget.exhausted).toBe(false);
  });

  test('a reserve at or above the window exhausts the budget', () => {
    const budget = resolveCompactionBudget({ maxContextTokens: 100_000 }, 8192, 8192);
    expect(budget.exhausted).toBe(true);
    expect(budget.threshold).toBe(100_000);
  });

  test('a protect tail above the threshold is clamped to leave room to cut', () => {
    const budget = resolveCompactionBudget({ maxContextTokens: 10_000, protectTokens: 9000 }, 5000);
    expect(budget.threshold).toBe(5000);
    expect(budget.protectTokens).toBe(5000 - MIN_COMPACTION_CUT_TOKENS);
  });
});

describe('parseThresholdSpec near-threshold and rapid-refill knobs', () => {
  test('the new knobs default when absent', () => {
    const parsed = parseThresholdSpec({});
    expect(parsed.preThresholdGapRatio).toBe(DEFAULT_COMPACTION_PRE_THRESHOLD_GAP_RATIO);
    expect(parsed.rapidRefillMaxCompactions).toBe(DEFAULT_COMPACTION_RAPID_REFILL_MAX_COMPACTIONS);
  });

  test('out-of-range values are clamped', () => {
    expect(parseThresholdSpec({ preThresholdGapRatio: 5 }).preThresholdGapRatio).toBe(0.9);
    expect(parseThresholdSpec({ preThresholdGapRatio: -1 }).preThresholdGapRatio).toBe(0);
    expect(parseThresholdSpec({ rapidRefillMaxCompactions: -2 }).rapidRefillMaxCompactions).toBe(0);
    expect(parseThresholdSpec({ rapidRefillMaxCompactions: 2.9 }).rapidRefillMaxCompactions).toBe(
      2,
    );
  });
});
