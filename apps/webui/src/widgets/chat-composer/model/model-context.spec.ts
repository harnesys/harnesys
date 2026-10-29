import { describe, expect, test } from 'bun:test';
import type { SessionEvent } from '@harnesys/studio-shared';
import { type MessageUsage, rollupUsage } from '@/entities/session/model/usage';
import { generationUsages } from './model-context.ts';

function runUsageEvent(seq: number): SessionEvent {
  return {
    type: 'model.usage',
    usage: { model: 'm', promptTokens: 100, generatedTokens: 10, cacheReadTokens: 90 },
    costUsd: 0.5,
    pricingSource: 'catalog',
    seq,
    runId: 'run-1',
  };
}

function memoryUsageEvent(seq: number): SessionEvent {
  return {
    type: 'model.usage',
    usage: { model: 'm', promptTokens: 256, generatedTokens: 635 },
    costUsd: 0,
    pricingSource: 'none',
    origin: 'memory',
    seq,
    runId: 'run-1',
  };
}

describe('generationUsages', () => {
  test('keeps run usage and drops background memory usage', () => {
    const usages = generationUsages([runUsageEvent(1), memoryUsageEvent(2)]);
    expect(usages).toHaveLength(1);
    expect(usages[0]?.promptTokens).toBe(100);
    expect(usages[0]?.pricingSource).toBe('catalog');
  });

  test('memory-only thread produces no usage', () => {
    expect(generationUsages([memoryUsageEvent(1)])).toHaveLength(0);
  });
});

describe('rollupUsage', () => {
  test('counts priced calls only from known pricing sources', () => {
    const priced: MessageUsage = {
      model: 'm',
      promptTokens: 100,
      generatedTokens: 10,
      contextTokens: 0,
      durationMs: 1000,
      tools: [],
      costUsd: 0.5,
      pricingSource: 'catalog',
    };
    const unpriced: MessageUsage = {
      model: 'm',
      promptTokens: 200,
      generatedTokens: 20,
      contextTokens: 0,
      durationMs: 2000,
      tools: [],
      costUsd: 0,
      pricingSource: 'none',
    };
    const rollup = rollupUsage([priced, unpriced]);
    expect(rollup.calls).toBe(2);
    expect(rollup.priced).toBe(1);
    expect(rollup.costUsd).toBeCloseTo(0.5, 10);
  });

  test('calls without pricing source stay unpriced', () => {
    const plain: MessageUsage = {
      model: 'm',
      promptTokens: 1,
      generatedTokens: 1,
      contextTokens: 0,
      durationMs: 0,
      tools: [],
    };
    expect(rollupUsage([plain]).priced).toBe(0);
  });
});
