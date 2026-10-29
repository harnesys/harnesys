import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { Injectable, isInjectable } from './injectable';

describe('isInjectable', () => {
  test('returns true for a class marked with @Injectable()', () => {
    @Injectable()
    class Marked {}

    expect(isInjectable(Marked)).toBe(true);
  });

  test('returns false for a plain class', () => {
    class Plain {}

    expect(isInjectable(Plain)).toBe(false);
  });
});
