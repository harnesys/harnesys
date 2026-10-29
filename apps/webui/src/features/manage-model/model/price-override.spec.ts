import { describe, expect, test } from 'bun:test';
import { formatPricePer1M, parsePricePer1M, priceOverrideValues } from './price-override';

describe('parsePricePer1M', () => {
  test('blank and broken values are rejected', () => {
    expect(parsePricePer1M('')).toBeNull();
    expect(parsePricePer1M('  ')).toBeNull();
    expect(parsePricePer1M('abc')).toBeNull();
    expect(parsePricePer1M('-1')).toBeNull();
  });

  test('numbers are read as dollars per million tokens', () => {
    expect(parsePricePer1M('3')).toBe(3);
    expect(parsePricePer1M(' 0.25 ')).toBe(0.25);
    expect(parsePricePer1M('0')).toBe(0);
  });
});

describe('priceOverrideValues', () => {
  test('both sides must be valid', () => {
    expect(priceOverrideValues('3', '15')).toEqual({ inputPer1M: 3, outputPer1M: 15 });
    expect(priceOverrideValues('3', '')).toBeNull();
    expect(priceOverrideValues('', '15')).toBeNull();
  });
});

describe('formatPricePer1M', () => {
  test('keeps the server value as is', () => {
    expect(formatPricePer1M(3)).toBe('3');
    expect(formatPricePer1M(0.25)).toBe('0.25');
  });
});
