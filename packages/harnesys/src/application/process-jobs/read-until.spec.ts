import { describe, expect, test } from 'bun:test';
import { compileUntil, matchesUntil } from './read-until.ts';

describe('read-until', () => {
  test('compiles case-insensitive multiline patterns', () => {
    const re = compileUntil('^DONE$');
    expect(re).not.toBeNull();
    expect(matchesUntil(re as RegExp, 'step 1\nDONE\nnext')).toBe(true);
    expect(matchesUntil(re as RegExp, 'done\nnext step')).toBe(true);
    expect(matchesUntil(re as RegExp, 'working...')).toBe(false);
  });

  test('rejects empty, oversized and invalid patterns', () => {
    expect(compileUntil('')).toBeNull();
    expect(compileUntil('   ')).toBeNull();
    expect(compileUntil('x'.repeat(201))).toBeNull();
    expect(compileUntil('[')).toBeNull();
    expect(compileUntil('error|failed')).not.toBeNull();
  });
});
