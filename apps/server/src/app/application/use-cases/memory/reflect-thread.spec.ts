import { describe, expect, test } from 'bun:test';
import { reflectDue } from './reflect-thread.use-case.ts';

const NOW = Date.parse('2026-10-24T12:00:00.000Z');

describe('reflectDue', () => {
  test('false before the interval elapsed', () => {
    expect(reflectDue('2026-10-24T11:00:00.000Z', NOW, 24)).toBe(false);
  });

  test('true after the interval elapsed', () => {
    expect(reflectDue('2026-10-23T00:00:00.000Z', NOW, 24)).toBe(true);
  });

  test('true without a last reflected timestamp', () => {
    expect(reflectDue(undefined, NOW, 24)).toBe(true);
  });
});
