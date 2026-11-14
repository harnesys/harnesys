import { describe, expect, test } from 'bun:test';
import { findIntegrationUi, INTEGRATION_UI_REGISTRY } from './registry.ts';

describe('integration ui registry', () => {
  test('keeps the provider-agnostic registry boundary', () => {
    expect(Array.isArray(INTEGRATION_UI_REGISTRY)).toBe(true);
    expect(findIntegrationUi('missing')).toBeUndefined();
  });
});
