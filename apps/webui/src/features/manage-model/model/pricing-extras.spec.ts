import { describe, expect, test } from 'bun:test';
import type { ModelPricingWithOverrides } from './openrouter-sync';
import { mergePricingExtras, pricingExtrasFrom } from './pricing-extras';

describe('pricingExtrasFrom', () => {
  test('reads image, request and overrides', () => {
    const pricing: ModelPricingWithOverrides = {
      prompt: '0.000002',
      completion: '0.000008',
      image: '0.0001',
      request: '0.02',
      overrides: [{ minPromptTokens: 128000, prompt: '0.000004' }],
    };
    const extras = pricingExtrasFrom(pricing);
    expect(extras.image).toBe('0.0001');
    expect(extras.request).toBe('0.02');
    expect(extras.overrides).toEqual([{ minPromptTokens: 128000, prompt: '0.000004' }]);
  });

  test('missing pricing yields empty extras', () => {
    expect(pricingExtrasFrom(undefined)).toEqual({
      image: undefined,
      request: undefined,
      overrides: undefined,
    });
  });
});

describe('mergePricingExtras', () => {
  test('keeps the form prices and adds the extras', () => {
    const merged = mergePricingExtras(
      { prompt: '0.000002', completion: '0.000008' },
      { image: '0.0001', overrides: [{ minPromptTokens: 10 }] },
    ) as ModelPricingWithOverrides | undefined;
    expect(merged?.prompt).toBe('0.000002');
    expect(merged?.completion).toBe('0.000008');
    expect(merged?.image).toBe('0.0001');
    expect(merged?.overrides).toEqual([{ minPromptTokens: 10 }]);
  });

  test('no pricing means nothing to merge', () => {
    expect(mergePricingExtras(undefined, { image: '0.0001' })).toBeUndefined();
  });
});
