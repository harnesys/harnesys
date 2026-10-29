import { describe, expect, test } from 'bun:test';
import { costUsd, normalizeUsage, priceUsage, resolvePricing } from './pricing.ts';

describe('resolvePricing', () => {
  test('manual override wins over catalog', () => {
    const resolution = resolvePricing({
      catalogPricing: { prompt: '0.0000025', completion: '0.00001' },
      override: { inputPer1M: 3, outputPer1M: 15 },
    });
    expect(resolution.source).toBe('manual');
    expect(resolution.inputPer1M).toBe(3);
    expect(resolution.outputPer1M).toBe(15);
  });

  test('catalog prices are converted from per token to per 1M', () => {
    const resolution = resolvePricing({
      catalogPricing: { prompt: '0.0000025', completion: '0.00001' },
    });
    expect(resolution.source).toBe('catalog');
    expect(resolution.inputPer1M).toBeCloseTo(2.5, 10);
    expect(resolution.outputPer1M).toBeCloseTo(10, 10);
  });

  test('no price source yields none', () => {
    expect(resolvePricing({}).source).toBe('none');
    expect(resolvePricing({ catalogPricing: { prompt: '', completion: '' } }).source).toBe('none');
  });
});

describe('priceUsage', () => {
  test('counts fractional catalog price per token', () => {
    const usage = normalizeUsage({ promptTokens: 1000, generatedTokens: 500 });
    const priced = priceUsage({
      usage,
      catalogPricing: { prompt: '0.0000025', completion: '0.00001' },
    });
    expect(priced.pricingSource).toBe('catalog');
    expect(priced.costUsd).toBeCloseTo(0.0075, 10);
  });

  test('provider reported cost wins over catalog and override', () => {
    const usage = normalizeUsage({ promptTokens: 10, cost_usd: 0.42 });
    const priced = priceUsage({
      usage,
      catalogPricing: { prompt: '0.0000025', completion: '0.00001' },
      override: { inputPer1M: 3, outputPer1M: 15 },
    });
    expect(priced.pricingSource).toBe('provider');
    expect(priced.costUsd).toBeCloseTo(0.42, 10);
  });

  test('manual override prices the call', () => {
    const usage = normalizeUsage({ promptTokens: 1_000_000, generatedTokens: 1_000_000 });
    const priced = priceUsage({
      usage,
      override: { inputPer1M: 2.5, outputPer1M: 10 },
    });
    expect(priced.pricingSource).toBe('manual');
    expect(priced.costUsd).toBeCloseTo(12.5, 10);
  });

  test('unrecognized usage costs nothing', () => {
    const priced = priceUsage({ usage: normalizeUsage({}) });
    expect(priced.pricingSource).toBe('none');
    expect(priced.costUsd).toBe(0);
  });

  test('cache tokens are priced with their own rates', () => {
    const resolution = resolvePricing({
      catalogPricing: {
        prompt: '0.0000025',
        completion: '0.00001',
        input_cache_read: '0.00000025',
        input_cache_write: '0.000003',
      },
    });
    const cost = costUsd(resolution, {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(3.25, 10);
  });

  test('image price is charged per image without token conversion', () => {
    const priced = priceUsage({
      usage: normalizeUsage({ promptTokens: 1000, generatedTokens: 500, images: 3 }),
      catalogPricing: {
        prompt: '0.0000025',
        completion: '0.00001',
        image: '0.003',
      },
    });
    expect(priced.pricingSource).toBe('catalog');
    expect(priced.costUsd).toBeCloseTo(0.0075 + 3 * 0.003, 10);
  });

  test('request price is charged once per model call', () => {
    const priced = priceUsage({
      usage: normalizeUsage({ promptTokens: 1000, generatedTokens: 500 }),
      catalogPricing: {
        prompt: '0.0000025',
        completion: '0.00001',
        request: '0.01',
      },
    });
    expect(priced.pricingSource).toBe('catalog');
    expect(priced.costUsd).toBeCloseTo(0.0075 + 0.01, 10);
  });

  test('threshold override prices the whole request', () => {
    const catalogPricing = {
      prompt: '0.0000025',
      completion: '0.00001',
      overrides: [
        {
          minPromptTokens: 200000,
          prompt: '0.000006',
          completion: '0.0000225',
          input_cache_read: '0.0000006',
          input_cache_write: '0.0000075',
        },
      ],
    };
    const above = priceUsage({
      usage: normalizeUsage({ promptTokens: 250_000, generatedTokens: 1000 }),
      catalogPricing,
    });
    expect(above.pricingSource).toBe('catalog');
    expect(above.costUsd).toBeCloseTo(250_000 * 0.000006 + 1000 * 0.0000225, 10);

    const below = priceUsage({
      usage: normalizeUsage({ promptTokens: 1000, generatedTokens: 1000 }),
      catalogPricing,
    });
    expect(below.costUsd).toBeCloseTo(1000 * 0.0000025 + 1000 * 0.00001, 10);
  });

  test('threshold override applies to every per-token rate', () => {
    const resolution = resolvePricing({
      catalogPricing: {
        prompt: '0.0000025',
        completion: '0.00001',
        input_cache_read: '0.0000003',
        input_cache_write: '0.00000375',
        overrides: [
          {
            minPromptTokens: 200000,
            prompt: '0.000006',
            completion: '0.0000225',
            input_cache_read: '0.0000006',
            input_cache_write: '0.0000075',
          },
        ],
      },
      promptTokens: 300_000,
    });
    expect(resolution.inputPer1M).toBeCloseTo(6, 10);
    expect(resolution.outputPer1M).toBeCloseTo(22.5, 10);
    expect(resolution.cacheReadPer1M).toBeCloseTo(0.6, 10);
    expect(resolution.cacheWritePer1M).toBeCloseTo(7.5, 10);
  });

  test('override falls back to base image and request prices', () => {
    const resolution = resolvePricing({
      catalogPricing: {
        prompt: '0.0000025',
        completion: '0.00001',
        image: '0.003',
        request: '0.01',
        overrides: [{ minPromptTokens: 200000, prompt: '0.000006' }],
      },
      promptTokens: 300_000,
    });
    expect(resolution.perImageUsd).toBeCloseTo(0.003, 10);
    expect(resolution.perRequestUsd).toBeCloseTo(0.01, 10);
  });

  test('the highest applicable threshold wins', () => {
    const resolution = resolvePricing({
      catalogPricing: {
        prompt: '0.00000003',
        completion: '0.00000013',
        overrides: [
          { minPromptTokens: 32000, prompt: '0.0000001', completion: '0.0000004' },
          { minPromptTokens: 256000, prompt: '0.0000002', completion: '0.0000008' },
        ],
      },
      promptTokens: 300_000,
    });
    expect(resolution.inputPer1M).toBeCloseTo(0.2, 10);
    expect(resolution.outputPer1M).toBeCloseTo(0.8, 10);
  });

  test('override without a per-token rate keeps the base rate', () => {
    const resolution = resolvePricing({
      catalogPricing: {
        prompt: '0.0000025',
        completion: '0.00001',
        overrides: [{ minPromptTokens: 200000, prompt: '0.000006' }],
      },
      promptTokens: 300_000,
    });
    expect(resolution.inputPer1M).toBeCloseTo(6, 10);
    expect(resolution.outputPer1M).toBeCloseTo(10, 10);
  });

  test('manual override wins over catalog image and request prices', () => {
    const priced = priceUsage({
      usage: normalizeUsage({ promptTokens: 1000, generatedTokens: 500, images: 2 }),
      catalogPricing: {
        prompt: '0.0000025',
        completion: '0.00001',
        image: '0.003',
        request: '0.01',
      },
      override: { inputPer1M: 3, outputPer1M: 15 },
    });
    expect(priced.pricingSource).toBe('manual');
    expect(priced.costUsd).toBeCloseTo(0.003 + 0.0075, 10);
  });

  test('image count is read from the raw provider usage', () => {
    const usage = normalizeUsage({ raw: { images: 4 } });
    expect(usage.images).toBe(4);
  });

  test('image_count is used when images is missing', () => {
    const usage = normalizeUsage({ image_count: 2 });
    expect(usage.images).toBe(2);
  });
});
