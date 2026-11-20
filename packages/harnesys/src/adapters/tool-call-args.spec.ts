import { describe, expect, test } from 'bun:test';
import { plainToolCallArgs } from './tool-call-args.ts';

describe('plainToolCallArgs', () => {
  test('keeps a plain object untouched', () => {
    expect(plainToolCallArgs({ a: 1 })).toEqual({ a: 1 });
  });

  test('unwraps a double-encoded JSON object', () => {
    expect(plainToolCallArgs('{"project":"p"}')).toEqual({ project: 'p' });
  });

  test('wraps a double-encoded JSON array', () => {
    expect(plainToolCallArgs('[1,2]')).toEqual({ input: [1, 2] });
  });

  test('wraps a non-JSON string', () => {
    expect(plainToolCallArgs('hello')).toEqual({ input: 'hello' });
  });

  test('maps null and undefined to empty args', () => {
    expect(plainToolCallArgs(null)).toEqual({});
    expect(plainToolCallArgs(undefined)).toEqual({});
  });
});
