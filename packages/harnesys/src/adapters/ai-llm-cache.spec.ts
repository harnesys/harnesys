import { describe, expect, test } from 'bun:test';
import { cacheBreakpointDrivers, withCacheBreakpoints } from './ai-llm-cache.ts';

describe('cacheBreakpointDrivers', () => {
  test('anthropic and minimax are breakpoint drivers', () => {
    expect(cacheBreakpointDrivers.has('anthropic')).toBe(true);
    expect(cacheBreakpointDrivers.has('minimax')).toBe(true);
  });

  test('openai-compatible drivers are not breakpoint drivers', () => {
    expect(cacheBreakpointDrivers.has('openai-compatible')).toBe(false);
    expect(cacheBreakpointDrivers.has('openrouter')).toBe(false);
    expect(cacheBreakpointDrivers.has('zai')).toBe(false);
  });
});

describe('withCacheBreakpoints', () => {
  test('marks last two messages with anthropic cacheControl at message level', () => {
    const messages = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ];
    const out = withCacheBreakpoints(messages) as Array<Record<string, unknown>>;
    expect(out).toHaveLength(3);
    expect(out[0]?.providerOptions).toBeUndefined();
    expect(out[1]?.providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
    expect(out[2]?.providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
  });

  test('fewer messages than breakpoints marks all', () => {
    const out = withCacheBreakpoints([{ role: 'user', content: 'a' }]) as Array<
      Record<string, unknown>
    >;
    expect(out[0]?.providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
  });

  test('empty messages returns empty array', () => {
    expect(withCacheBreakpoints([])).toEqual([]);
  });

  test('input array is not mutated', () => {
    const messages = [
      { role: 'user', content: 'a' },
      { role: 'user', content: 'b' },
    ] as Array<Record<string, unknown>>;
    withCacheBreakpoints(messages);
    expect(messages[0]?.providerOptions).toBeUndefined();
    expect(messages[1]?.providerOptions).toBeUndefined();
  });

  test('merges into existing message providerOptions', () => {
    const messages = [
      {
        role: 'user',
        content: 'a',
        providerOptions: { anthropic: { foo: 'bar' } },
      },
    ];
    const out = withCacheBreakpoints(messages) as Array<Record<string, unknown>>;
    expect(out[0]?.providerOptions).toEqual({
      anthropic: { foo: 'bar', cacheControl: { type: 'ephemeral' } },
    });
  });
});
